import {spawn,type ChildProcess} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {resultSchema,resultJsonSchema} from '../../contracts/src/schema.js';
export type Agent='codex'|'claude';
export type Command={executable:string;prefix?:string[]};
export type Profile={agent:Agent;command:Command;version:string};
export function childEnvironment(){
  const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','COMSPEC','PATHEXT','CODEX_HOME']);
  return Object.fromEntries(Object.entries(process.env).filter(([k,v])=>v!==undefined&&allowed.has(k.toUpperCase()))) as NodeJS.ProcessEnv;
}
export function normalizeEvent(agent:Agent,event:any){
  if(agent==='codex'&&event.type==='item.completed'&&event.item?.type==='command_execution')return {kind:'code_read',outcome:event.item.exit_code===0?'completed':'failed'};
  if(agent==='claude'&&event.type==='assistant'&&event.message?.content?.some((x:any)=>x.type==='tool_use'&&['Read','Glob','Grep','Skill'].includes(x.name)))return {kind:'code_read',outcome:'started'};
  return null;
}
export class AgentAdapter {
  private child?:ChildProcess;
  lastSyntheticOutput='';
  constructor(readonly profile:Profile){}
  async probe(){
    const output=await this.run(['--version'],'',undefined,undefined,10000);
    return {installed:true,version:output.trim(),supported:output.includes(this.profile.version),releaseApproved:false};
  }
  async prepare(directory:string){
    const root=resolve(directory);await mkdir(root,{recursive:true});
    const source=new URL('../../skills/mail-triage/SKILL.md',import.meta.url);
    const skill=await readFile(source,'utf8');
    const manifest=JSON.parse(await readFile(new URL('../../skills/manifest.json',import.meta.url),'utf8'));
    if(createHash('sha256').update(skill).digest('hex')!==manifest.files['mail-triage/SKILL.md'])throw new Error('SKILL_HASH_MISMATCH');
    for(const name of ['.agents','.claude']){
      const target=join(root,name,'skills','mail-triage-readonly');await mkdir(target,{recursive:true});await writeFile(join(target,'SKILL.md'),skill,{flag:'wx'});
    }
    await writeFile(join(root,'result-schema.json'),JSON.stringify(resultJsonSchema),{flag:'wx'});
    await writeFile(join(root,'mcp-empty.json'),' {"mcpServers":{}}',{flag:'wx'});
    return {root,skillVersion:manifest.version,contractVersion:'1'};
  }
  async execute(run:{directory:string;synthetic:true},signal:AbortSignal){
    if(run.synthetic!==true)throw new Error('ADAPTER_NOT_RELEASE_APPROVED');
    const probe=await this.probe();if(!probe.supported)throw new Error('UNVERIFIED_CLI_VERSION');
    const prompt='Use the mail-triage-readonly skill installed in this directory. First actually read .agents/skills/mail-triage-readonly/SKILL.md and fixture.json. Codex may use the shell exec_command with PowerShell Get-Content for these two files; Claude may use Read. Return the common result JSON with the total quantity * unitPrice and the skill marker. This is synthetic data only. Do not access anything outside this directory. Do not change files. No network or MCP tools are needed. If reading fails, report needs_input honestly.';
    const args=this.profile.agent==='codex'
      ?['exec','--ignore-user-config','--sandbox','read-only','-c','approval_policy="never"','--ephemeral','--skip-git-repo-check','--json','--output-schema',join(run.directory,'result-schema.json'),'-']
      :['-p','--restricted','--strict-mcp-config','--mcp-config',join(run.directory,'mcp-empty.json'),'--permission-mode','dontAsk','--tools','Read,Glob,Grep,Skill','--allowedTools','Read,Glob,Grep,Skill','--disallowedTools','Bash,PowerShell,Write,Edit,NotebookEdit','--no-session-persistence','--verbose','--output-format','stream-json','--json-schema',JSON.stringify(resultJsonSchema)];
    const output=await this.run(args,prompt,run.directory,signal,180000);
    this.lastSyntheticOutput=output;
    let candidate:any;const events:any[]=[];
    for(const line of output.split(/\r?\n/).filter(Boolean)){
      let event;try{event=JSON.parse(line);}catch{continue;}events.push(event);
      if(this.profile.agent==='codex'&&event.type==='item.completed'&&event.item?.type==='agent_message'){try{candidate=JSON.parse(event.item.text);}catch{}}
      if(this.profile.agent==='claude'&&event.type==='result')candidate=event.structured_output;
    }
    const result=this.validateResult(candidate,events);
    return {result,events:events.map(e=>normalizeEvent(this.profile.agent,e)).filter(Boolean)};
  }
  validateResult(value:unknown,events:any[]){
    const result=resultSchema.parse(value);
    if(!result.report.includes('mail-triage-readonly/1.0.0')||!result.evidence.some(e=>e.kind==='document'&&e.reference.includes('fixture.json')&&e.verified))throw new Error('MISSING_SYNTHETIC_EVIDENCE');
    if(this.profile.agent==='codex'&&!events.some(e=>normalizeEvent('codex',e)?.outcome==='completed'))throw new Error('MISSING_TOOL_OBSERVATION');
    if(this.profile.agent==='claude'&&!events.some(e=>normalizeEvent('claude',e)))throw new Error('MISSING_TOOL_OBSERVATION');
    return result;
  }
  cancel(){
    if(!this.child?.pid)return;
    if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(this.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else{try{process.kill(-this.child.pid,'SIGKILL');}catch{this.child.kill('SIGKILL');}}
  }
  private run(args:string[],input:string,cwd?:string,signal?:AbortSignal,timeout=180000):Promise<string>{
    signal?.throwIfAborted();
    return new Promise((resolve,reject)=>{
      const child=spawn(this.profile.command.executable,[...(this.profile.command.prefix??[]),...args],{cwd,env:childEnvironment(),windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});this.child=child;
      let output='',failed=false;const cancel=()=>{failed=true;this.cancel();};
      signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,timeout);
      child.stdout.on('data',b=>{output+=b;if(output.length>4*1024*1024)cancel();});child.stderr.resume();
      child.once('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(new Error('CLI_START_FAILED'));});
      child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.child=undefined;code===0&&!failed?resolve(output):reject(new Error(failed?'CLI_CANCELLED':'CLI_FAILED'));});
      child.stdin.on('error',()=>{});child.stdin.end(input);
    });
  }
}
