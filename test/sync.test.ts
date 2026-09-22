import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='sync-fixture-token-'.repeat(4);
const schema='triage_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool,migrate}=await import('../src/db.js');await migrate();
const {startSync,stopSync,processSyncBatch,recoverSync,syncDecision}=await import('../src/sync.js');
const row=async(id:string)=>(await pool.query('SELECT * FROM sync_run WHERE id=$1',[id])).rows[0];
const success={status:'success',saved:1,failed:0,remaining:0,errors:[],serverCount:1,existing:0};
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});

test('durable job collects over 3000 mails in sequential batches with normal MCP partial responses',async()=>{
 const job=await startSync();assert.equal((await row(job.id)).batch_count,0);
 await assert.rejects(startSync());let calls=0;
 const call=async(name:string,args:Record<string,unknown>)=>{
   assert.equal(name,'sync');assert.deepEqual(args,{max_messages:100});calls++;
   return {...success,status:calls<32?'partial':'success',saved:100,remaining:Math.max(0,3200-calls*100),existing:(calls-1)*100,serverCount:3200};
 };
 for(let i=0;i<32;i++)await processSyncBatch(call);
 const result=await row(job.id);assert.equal(result.status,'completed');assert.equal(result.saved,3200);assert.equal(result.batch_count,32);
 assert.equal(await processSyncBatch(call),false);assert.equal(calls,32);
});
test('stop during a batch saves that batch and prevents the next; resume preserves prior history',async()=>{
 const job=await startSync();let release!:()=>void,entered!:()=>void;
 const enteredGate=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let calls=0;
 const running=processSyncBatch(async()=>{calls++;entered();await gate;return {...success,status:'partial',saved:100,remaining:100};});
 await enteredGate;
 assert.equal(await processSyncBatch(async()=>{throw new Error('Concurrent sync');}),false);
 await assert.rejects(startSync());assert.equal((await stopSync(job.id)).status,'stopping');
 release();await running;assert.equal((await row(job.id)).status,'paused');assert.equal((await row(job.id)).saved,100);
 assert.equal(await processSyncBatch(async()=>{calls++;return success;}),false);assert.equal(calls,1);
 const resumed=await startSync();assert.notEqual(resumed.id,job.id);
 await processSyncBatch(async()=>({...success,saved:100,existing:100,serverCount:200}));
 assert.equal((await row(resumed.id)).saved,100);assert.equal((await row(job.id)).saved,100);
 assert.equal((await row(resumed.id)).detail.serverStored,200);
});
test('stop before first batch and retry delay performs no MCP request',async()=>{
 const job=await startSync();await stopSync(job.id);
 await processSyncBatch(async()=>{throw new Error('Cancelled job called MCP');});assert.equal((await row(job.id)).status,'paused');
 const next=await startSync();await processSyncBatch(async()=>({...success,status:'failed',saved:0,remaining:null,errors:[{code:'POP3_TIMEOUT'}]}));
 assert.equal((await row(next.id)).status,'retrying');
 assert.equal(await processSyncBatch(async()=>{throw new Error('Retry ran too early');}),false);
 await stopSync(next.id);await processSyncBatch(async()=>{throw new Error('Stopped retry called MCP');});assert.equal((await row(next.id)).status,'paused');
});
test('transient errors have three bounded delayed retries; auth and storage errors stop immediately',async()=>{
 const job=await startSync();let calls=0;
 for(let i=0;i<4;i++){
   await pool.query('UPDATE sync_run SET next_attempt_at=NULL WHERE id=$1',[job.id]);
   await processSyncBatch(async()=>{calls++;return {...success,status:'failed',saved:0,remaining:null,errors:[{code:'POP3_TIMEOUT'}]};});
   const r=await row(job.id);assert.equal(r.status,i<3?'retrying':'failed');assert.equal(r.retry_count,Math.min(i+1,3));
   if(i<3)assert.ok(new Date(r.next_attempt_at).getTime()>Date.now());
 }
 assert.equal(calls,4);assert.equal((await row(job.id)).detail.reason,'retry_exhausted');
 for(const code of ['AUTH_FAILED','STORAGE_FAILED','TLS_FAILED']){
   const stopped=await startSync();await processSyncBatch(async()=>({...success,status:'failed',saved:0,remaining:null,errors:[{code}]}));
   assert.equal((await row(stopped.id)).status,'failed');assert.equal((await row(stopped.id)).retry_count,0);
 }
});
test('failed mail or stalled/invalid result cannot report completion; recovered retries may complete',async()=>{
 for(const response of [
   {...success,status:'partial',failed:1,errors:[{code:'MESSAGE_TOO_LARGE'}]},
   {...success,status:'partial',saved:0,remaining:4},
   {...success,saved:-1},
 ]){
   const job=await startSync();await processSyncBatch(async()=>response);assert.notEqual((await row(job.id)).status,'completed');
   assert.ok(['partial','failed'].includes((await row(job.id)).status));
 }
 const job=await startSync();await processSyncBatch(async()=>({...success,status:'partial',failed:1,errors:[{code:'MESSAGE_RETRIEVAL_FAILED'}]}));
 await pool.query('UPDATE sync_run SET next_attempt_at=NULL WHERE id=$1',[job.id]);
 await processSyncBatch(async()=>success);const done=await row(job.id);
 assert.equal(done.status,'completed');assert.equal(done.saved,2);assert.equal(done.failed,1);assert.equal(done.retry_count,0);
 assert.equal(syncDecision({...success,status:'partial',saved:0,remaining:10}),'partial');
});
test('restart recovery pauses persisted work; response loss is explicitly uncertain',async()=>{
 const job=await startSync();await processSyncBatch(async()=>{throw new Error('Synthetic lost response');});
 assert.equal((await row(job.id)).uncertain,true);await recoverSync();
 assert.equal((await row(job.id)).status,'paused');assert.equal((await row(job.id)).detail.reason,'interrupted');
 let calls=0;assert.equal(await processSyncBatch(async()=>{calls++;return success;}),false);assert.equal(calls,0);
 const next=await startSync();await processSyncBatch(async()=>success);assert.equal((await row(next.id)).status,'completed');
});
test('lost advisory-lock connection never commits a stale batch result',async()=>{
 const job=await startSync();let entered!:()=>void,release!:()=>void;
 const enteredGate=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const pending=processSyncBatch(async()=>{entered();await gate;return success;});
 const rejected=assert.rejects(pending);await enteredGate;
 // Terminate only the lock belonging to this test's random schema in this database.
 const pid=(await pool.query(`SELECT l.pid FROM pg_locks l WHERE l.locktype='advisory' AND l.granted
   AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
   AND l.classid::bigint=((hashtextextended(current_schema() || ':mail-sync',0)>>32)&4294967295)
   AND l.objid::bigint=(hashtextextended(current_schema() || ':mail-sync',0)&4294967295)
   AND l.pid<>pg_backend_pid()`)).rows[0]?.pid;
 assert.ok(pid);await pool.query('SELECT pg_terminate_backend($1)',[pid]);
 await new Promise(r=>setTimeout(r,30));release();await rejected;await recoverSync();
 assert.equal((await row(job.id)).saved,0);assert.equal((await row(job.id)).status,'paused');
});
test('sync HTTP start only enqueues, stop requires auth and affects only the requested job',async()=>{
 const {createApp}=await import('../src/server.js');let calls=0;
 const server=createApp(async()=>{calls++;return success;}).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+(server.address() as any).port,headers={authorization:'Bearer '+process.env.TRIAGE_TOKEN};
 try{
   assert.equal((await fetch(base+'/api/sync',{method:'POST'})).status,401);
   const response=await fetch(base+'/api/sync',{method:'POST',headers});assert.equal(response.status,202);const job=await response.json();
   assert.equal(calls,0);assert.equal((await row(job.id)).batch_count,0);
   assert.equal((await fetch(base+'/api/sync',{method:'POST',headers})).status,409);
   const path=base+'/api/sync/'+job.id+'/stop';assert.equal((await fetch(path,{method:'POST'})).status,401);
   assert.equal((await fetch(path,{method:'POST',headers})).status,200);await processSyncBatch(async()=>{throw new Error('Must stop');});
   assert.equal((await fetch(path,{method:'POST',headers})).status,200);
   assert.equal((await fetch(base+'/api/sync/not-an-id/stop',{method:'POST',headers})).status,400);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
