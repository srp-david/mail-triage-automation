import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalExecutor} from '../apps/local-app/src/executor.js';
test('local executor rejects stale mail before agent start, revalidates reads and cleans per-run scratch',async()=>{
  const root=await mkdtemp(join(tmpdir(),'executor-'));let messageId='changed',started=0;
  const selection:any=async()=>({sourceId:'source',original:{full:async()=>({id:17,messageId})}});
  const factory:any=()=>({prepare:async()=>{},executeEvidence:async(task:any)=>{started++;assert.equal((await task.providers.mail()).messageId,'expected');assert.deepEqual(await task.providers.context(),{answer:'User clarification',previousReport:{report:'Prior synthetic analysis'}});return {result:{report:'synthetic'}};}});
  const executor=new LocalExecutor(root,{codex:{agent:'codex',version:'fixture',command:{executable:'unused'}}},selection,{},undefined,factory);
  try{
    const run={agent:'codex',sourceId:'source',mailId:17,messageId:'expected',answer:'User clarification',parentResult:{report:'Prior synthetic analysis'}};
    await assert.rejects(executor.execute(run,new AbortController().signal),/MAIL_IDENTITY_CHANGED/);assert.equal(started,0);
    messageId='expected';assert.deepEqual(await executor.execute(run,new AbortController().signal),{report:'synthetic'});assert.equal(started,1);assert.deepEqual(await readdir(root),[]);
    await assert.rejects(executor.execute({...run,agent:'claude'},new AbortController().signal),/AGENT_NOT_CONFIGURED/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('report-only question works without MCP and requires explicit evidence opt-in',async()=>{
 const root=await mkdtemp(join(tmpdir(),'report-executor-'));
 const factory:any=()=>({prepare:async()=>{},executeEvidence:async(task:any)=>{
   await assert.rejects(task.providers.mail(),/ORIGINAL_UNAVAILABLE/);assert.deepEqual(task.providers.roots,{});assert.deepEqual(task.providers.queries,{});
   assert.equal((await task.providers.context()).report,'Frozen version');return {result:{report:'Answer'}};
 }});
 const executor=new LocalExecutor(root,{codex:{agent:'codex',command:{executable:'unused'}}},async()=>{throw Error('Must not access MCP');},{privateRoot:'unused'},undefined,factory);
 try{assert.deepEqual(await executor.execute({reportOnly:true,agent:'codex',reportContext:{report:'Frozen version'},answer:'Question',allowEvidence:false},new AbortController().signal),{report:'Answer'});assert.deepEqual(await readdir(root),[]);}finally{await rm(root,{recursive:true,force:true});}
});
