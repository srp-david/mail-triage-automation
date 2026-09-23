import {AgentAdapter} from '../packages/agent-adapters/src/index.ts';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'triage-cancel-')),file=join(directory,'pids.json'),stub=join(directory,'agent.mjs');
await writeFile(stub,`import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';if(process.argv.includes('--version')){console.log('fixture-version');}else{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});writeFileSync(${JSON.stringify(file)},JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);}`);
const adapter=new AgentAdapter({agent:'codex',version:'fixture-version',command:{executable:process.execPath,prefix:[stub]}});await adapter.prepare(directory);
const controller=new AbortController();let pids=[];
const running=adapter.executeEvidence({directory,providers:{mail:async()=>({}),roots:{}},instruction:'Synthetic cancellation'},controller.signal);
const settled=running.then(()=>({ok:true}),e=>({error:e.message}));
try{
  const deadline=Date.now()+15000;while(Date.now()<deadline){try{pids=JSON.parse(await readFile(file,'utf8'));break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal(pids.length,2);controller.abort();assert.equal((await settled).error,'CLI_CANCELLED');
  const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
  const limit=Date.now()+5000;while(pids.some(alive)&&Date.now()<limit)await new Promise(r=>setTimeout(r,100));
  assert.deepEqual(pids.map(alive),[false,false]);console.log(JSON.stringify({agentParentStopped:true,descendantStopped:true,synthetic:true,platform:process.platform}));
}finally{controller.abort();await settled;await rm(directory,{recursive:true,force:true});}
