import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {join} from 'node:path';
import {wslHelper} from './wsl-helper.js';
import {wslSettingsSchema,type Command,type WslSettings} from './command.js';

export function wslExecutable(){return join(process.env.SystemRoot??process.env.SYSTEMROOT??'C:\\Windows','System32','wsl.exe');}
export function wslArgs(settings:WslSettings){
  const value=wslSettingsSchema.parse(settings);
  return ['--distribution',value.distribution,...(value.user?['--user',value.user]:[]),'--exec','python3','-u','-c',wslHelper];
}
export function wslEnvironment(env:NodeJS.ProcessEnv){
  // Never inherit Windows HOME/CODEX_HOME, WSLENV, provider credentials, or history tokens.
  const allowed=new Set(['SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH']);
  return {...Object.fromEntries(Object.entries(env).filter(([key,value])=>value!==undefined&&allowed.has(key.toUpperCase()))),WSLENV:''};
}
export function wslRequest(command:Command,args:string[],input:string,cwd:string|undefined,timeoutMs:number,token?:string,checkUrl?:string){
  const prefix=command.prefix??[],combined=[...prefix,...args],pathIndexes:number[]=[];
  for(let index=0;index<args.length-1;index++)if(['--output-schema','--mcp-config'].includes(args[index]))pathIndexes.push(prefix.length+index+1);
  return {executable:command.executable,args:combined,pathIndexes,input,cwd,timeoutMs,token,checkUrl};
}
export function parseWslDistributions(buffer:Buffer){
  const text=buffer.includes(0)?buffer.toString('utf16le'):buffer.toString('utf8');
  return [...new Set(text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(x=>wslSettingsSchema.safeParse({distribution:x}).success))];
}
export async function listWslDistributions():Promise<{available:boolean;distributions:string[]}>{
  if(process.platform!=='win32')return {available:false,distributions:[]};
  return new Promise(resolve=>execFile(wslExecutable(),['--list','--quiet'],{encoding:'buffer',windowsHide:true,timeout:10000,maxBuffer:65536},(error,stdout)=>resolve(error?{available:false,distributions:[]}:{available:true,distributions:parseWslDistributions(stdout)})));
}
const codes=new Set(['WSL_PATH_UNAVAILABLE','WSL_AGENT_NOT_FOUND','WSL_AGENT_START_FAILED','WSL_NETWORK_UNAVAILABLE','WSL_REQUEST_TOO_LARGE','WSL_HELPER_FAILED','CLI_CANCELLED','CLI_OUTPUT_TOO_LARGE']);
export class WslProcess {
  private child?:ChildProcess;
  private cancelCurrent?:()=>void;
  cancel(){this.cancelCurrent?.();}
  run(command:Command,args:string[],input:string,cwd?:string,signal?:AbortSignal,timeout=180000,token?:string,checkUrl?:string):Promise<string>{
    signal?.throwIfAborted();if(this.child)throw new Error('AGENT_BUSY');
    if(process.platform!=='win32'||!command.wsl)throw new Error('WSL_WINDOWS_REQUIRED');
    return new Promise((resolve,reject)=>{
      const child=spawn(wslExecutable(),wslArgs(command.wsl!),{env:wslEnvironment(process.env),windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
      let output='',pending='',error='',done=false,settled=false,ready=false,cancelled=false,killTimer:ReturnType<typeof setTimeout>|undefined;
      const cancel=()=>{if(cancelled||settled)return;cancelled=true;error='CLI_CANCELLED';child.stdin.end();killTimer=setTimeout(()=>child.kill(),7000);};this.cancelCurrent=cancel;
      const finish=(code:number|null)=>{
        if(settled)return;settled=true;clearTimeout(timer);clearTimeout(startup);if(killTimer)clearTimeout(killTimer);signal?.removeEventListener('abort',cancel);this.child=undefined;this.cancelCurrent=undefined;
        if(!error&&(!done||code!==0))error=ready?'CLI_FAILED':'WSL_START_FAILED';
        error?reject(new Error(error)):resolve(output);
      };
      const timer=setTimeout(cancel,timeout+15000),startup=setTimeout(()=>{if(!ready)cancel();},15000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data',(chunk:string)=>{
        pending+=chunk;if(pending.length>200000){cancel();return;}
        let index;while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);
          try{const event=JSON.parse(line);
            if(event.type==='ready'){ready=true;clearTimeout(startup);}
            else if(event.type==='data'&&typeof event.value==='string'){output+=event.value;if(output.length>4*1024*1024)cancel();}
            else if(event.type==='error'){error=codes.has(event.code)?event.code:'WSL_HELPER_FAILED';}
            else if(event.type==='done'){done=true;if(event.exitCode!==0&&!error)error='CLI_FAILED';}
          }catch{error='WSL_HELPER_FAILED';child.stdin.end();}
        }
      });
      child.stderr.resume();child.once('error',()=>{error='WSL_START_FAILED';finish(null);});child.once('close',finish);child.stdin.on('error',()=>{});
      signal?.addEventListener('abort',cancel,{once:true});
      child.stdin.write(JSON.stringify(wslRequest(command,args,input,cwd,timeout,token,checkUrl))+'\n');
      if(signal?.aborted)cancel();
    });
  }
}
