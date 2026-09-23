import {test} from 'vitest';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-thread-cache-route-'.repeat(3);
const {createApp}=await import('../src/server.js');
const {config}=await import('../src/config.js');

test('thread route reuses search pages and refreshes on sync revision or explicit refresh',async()=>{
 let calls=0,revision='sync-1',size=101;
 const call=async()=>{calls++;return {emails:Array.from({length:size},(_,i)=>({id:i+1,inReplyTo:[],references:[]})),nextOffset:null};};
 const server=createApp(call,undefined,undefined,{list:async()=>[]} as any,async()=>revision).listen(0,'127.0.0.1');
 await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 const request=(query='',auth=true)=>fetch('http://127.0.0.1:'+address.port+'/api/mails?view=threads'+query,{headers:auth?{Authorization:'Bearer '+config.token}:{}});
 try{
  assert.equal((await request('',false)).status,401);assert.equal(calls,0);
  const first=await (await request()).json();assert.equal(first.total,101);
  assert.equal((await (await request('&offset=30')).json()).total,101);assert.equal(calls,1);
  size=102;revision='sync-2';assert.equal((await (await request()).json()).total,102);assert.equal(calls,2);
  size=103;assert.equal((await (await request('&refresh=1')).json()).total,103);assert.equal(calls,3);
  assert.equal((await request('&refresh=bad')).status,400);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
