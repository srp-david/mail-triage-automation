import {test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {AgentAdapter} from '../packages/agent-adapters/src/index.js';
import {WslProcess,wslRequest} from '../packages/agent-adapters/src/wsl.js';

test.each(['codex','claude'] as const)('%s WSL adapter probes and reads authenticated Windows evidence before accepting output',async(agent)=>{
  const directory=await mkdtemp(join(tmpdir(),'wsl-evidence-'));
  const calls:string[][]=[];
  const result={outcome:'completed',project:'unknown',report:'Synthetic evidence',question:'',knowledge:'',evidence:[{kind:'mail',reference:'mail:current',verified:true},{kind:'code',reference:'skill/SKILL.md',verified:true}]};
  const run=vi.spyOn(WslProcess.prototype,'run').mockImplementation(async(command,args,input,cwd,_signal,timeout,token,checkUrl)=>{
    assert.equal(command.wsl?.distribution,'Ubuntu');assert.ok(cwd);calls.push(args);
    if(args.includes('--help'))return '--sandbox --ephemeral --skip-git-repo-check --json --output-schema --restricted --strict-mcp-config --mcp-config --permission-mode --tools --allowedTools --disallowedTools --no-session-persistence --verbose --output-format --json-schema';
    assert.ok(token);assert.ok(checkUrl);
    assert.deepEqual(await (await fetch(checkUrl!,{headers:{Authorization:'Bearer '+token}})).json(),{ok:true});
    if(args.includes('--version'))return 'synthetic 1';
    assert.ok(!args.some(arg=>arg.includes('windows.sandbox')));
    assert.ok(!args.join(' ').includes(token!));assert.ok(input.includes('read_mail'));
    const request=wslRequest(command,args,input,cwd,timeout!,token,checkUrl);
    assert.equal(request.pathIndexes.length,1);
    assert.equal(args[request.pathIndexes[0]-1],agent==='codex'?'--output-schema':'--mcp-config');
    const client=new Client({name:'synthetic-wsl-agent',version:'1'});
    try{
      await client.connect(new StreamableHTTPClientTransport(new URL(checkUrl!.replace('/wsl-check','/mcp')),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
      await client.callTool({name:'read_code',arguments:{root:'skill',path:'SKILL.md'}});
      await client.callTool({name:'read_mail',arguments:{}});
    }finally{await client.close();}
    return JSON.stringify(agent==='codex'?{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(result)}}:{type:'result',structured_output:result});
  });
  try{
    const adapter=new AgentAdapter({agent,command:{executable:agent,wsl:{distribution:'Ubuntu'}}});
    await adapter.prepare(directory);
    const actual=await adapter.executeEvidence({directory,providers:{mail:async()=>({subject:'synthetic'}),roots:{}},instruction:'synthetic only'},new AbortController().signal);
    assert.deepEqual(actual.result,result);assert.equal(actual.events.length,2);assert.equal(calls.length,3);
  }finally{run.mockRestore();await rm(directory,{recursive:true,force:true});}
});
