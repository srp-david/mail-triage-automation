import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Runner} from '../packages/runner/src/runner.js';
import {Scheduler} from '../packages/runner/src/scheduler.js';
import {syncBatch} from '../packages/runner/src/sync.js';
import {SyncRunner} from '../packages/runner/src/sync-runner.js';
import {LocalRuntime} from '../apps/local-app/src/runtime.js';
test('result outbox survives lost completion response without executing agent twice',async()=>{
  const records=new Map<string,any>();const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return structuredClone(records.get(k));},async write(k:string,v:any){records.set(k,structuredClone(v));}};
  const id=randomUUID(),runnerId=randomUUID();let executions=0,completed=0;const events:any[]=[];
  const client:any={async request(path:string,body:any){if(path.endsWith('/progress')){events.push(body.event);if(body.event.kind==='result_saving')throw new Error('lost progress');return {ok:true};}return {id,runnerId,leaseToken:'x'.repeat(32),generation:1,leaseUntil:new Date(Date.now()+120000).toISOString()};},async get(){return {id};},async complete(){if(++completed===1)throw new Error('response lost');return {id,status:'completed'};}};
  const executor={async execute(){executions++;return {outcome:'completed',project:'unknown',report:'Synthetic',question:'',knowledge:'',evidence:[]};}};
  await assert.rejects(new Runner(client,store,executor,runnerId,'secret').tick(),/response lost/);
  assert.equal(records.get(runnerId).state,'outbox');
  assert.deepEqual(events,[{kind:'analysis_started',outcome:'completed'},{kind:'result_saving',outcome:'completed'}]);
  await new Runner(client,store,executor,runnerId,'secret').tick();assert.equal(executions,1);assert.equal(completed,2);assert.equal(records.get(id).state,'saved');
  records.set(runnerId,{state:'running'});await assert.rejects(new Runner(client,store,executor,runnerId,'secret').tick(),/RECOVERY_REQUIRES_REVALIDATION/);
});

test('scheduler aborts active execution and interrupted receipt cannot silently rerun',async()=>{
  const records=new Map<string,any>();const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return records.get(k);},async write(k:string,v:any){records.set(k,v);}};
  const id=randomUUID(),runnerId=randomUUID();let calls=0,stopped=false,ready!:()=>void;const started=new Promise<void>(r=>ready=r);
  const client:any={async request(path:string){if(path.endsWith('/fail'))return {ok:true};return {id,runnerId,leaseToken:'x'.repeat(32),generation:1,leaseUntil:new Date(Date.now()+120000).toISOString()};},async get(){return {id,status:'failed'};}};
  const runner=new Runner(client,store,{async execute(_run,signal){calls++;ready();await new Promise((_,reject)=>signal.addEventListener('abort',()=>{stopped=true;reject(new Error('aborted'));},{once:true}));}},runnerId,'secret');
  const scheduler=new Scheduler(signal=>runner.tick(signal),1,5);scheduler.start();await started;await scheduler.stop();assert.equal(stopped,true);assert.equal(scheduler.state,'stopped');assert.equal(records.get(runnerId).state,'interrupted');
  await assert.rejects(runner.tick(),/RECOVERY_REQUIRES_REVALIDATION/);assert.equal(calls,1);await runner.archiveInterrupted();assert.equal(records.get(runnerId).state,'idle');
});

test('update drain waits for the active task without aborting or starting another',async()=>{
  let entered!:()=>void,finish!:()=>void,calls=0,aborted=false;
  const started=new Promise<void>(resolve=>entered=resolve),pending=new Promise<void>(resolve=>finish=resolve);
  const scheduler=new Scheduler(async signal=>{calls++;signal.addEventListener('abort',()=>aborted=true);entered();await pending;},1,5);
  scheduler.start();await started;
  let drained=false;const drain=scheduler.drain().then(()=>drained=true);
  await new Promise(resolve=>setTimeout(resolve,5));assert.equal(drained,false);
  finish();await drain;
  assert.equal(aborted,false);assert.equal(calls,1);assert.equal(scheduler.state,'stopped');
});

test('sync response-loss retries its outbox without collecting again; interrupted collection stays uncertain',async()=>{
  const records=new Map<string,any>();const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return structuredClone(records.get(k));},async write(k:string,v:any){records.set(k,structuredClone(v));}};
  const id=randomUUID(),lease={runnerId:randomUUID(),leaseToken:'x'.repeat(32),generation:1};let calls=0,submits=0;
  const client:any={async request(path:string){if(path.endsWith('/heartbeat'))return {leaseUntil:new Date(Date.now()+120000).toISOString()};if(path.endsWith('/batch')&&++submits===1)throw new Error('response lost');return {status:'completed'};}};
  const collect=async()=>{calls++;return {status:'success',saved:1,failed:0,remaining:0,errors:[]};};
  await assert.rejects(syncBatch(client,store,id,lease,'device',collect),/response lost/);assert.equal(records.get('sync-'+id).state,'outbox');await syncBatch(client,store,id,lease,'device',collect);assert.equal(calls,1);
  const controller=new AbortController(),uncertain=randomUUID();let entered!:()=>void;const started=new Promise<void>(r=>entered=r);
  const pending=syncBatch(client,store,uncertain,lease,'device',async(_n,signal)=>{entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));},controller.signal);
  await started;controller.abort();await assert.rejects(pending);assert.equal(records.get('sync-'+uncertain).state,'started');await assert.rejects(syncBatch(client,store,uncertain,lease,'device',collect),/SYNC_OUTCOME_UNCERTAIN/);
});
test('sync archive owns the same mutex as tick while remote status is pending',async()=>{
  let release!:(v:any)=>void;const remote=new Promise(r=>release=r),records=new Map<string,any>(),runnerId=randomUUID(),id=randomUUID();records.set('sync-device-'+runnerId,{state:'running',claim:{id}});
  const store={async read(k:string){return records.get(k);},async write(k:string,v:any){records.set(k,v);}},client:any={request:async()=>remote};
  const runner=new SyncRunner(client,store,runnerId,'synthetic',async()=>({})),archiving=runner.archiveInterrupted();
  await assert.rejects(runner.tick(new AbortController().signal),/SYNC_BUSY/);await assert.rejects(runner.archiveInterrupted(),/SYNC_BUSY/);release({status:'paused'});await archiving;assert.equal(records.get('sync-device-'+runnerId).state,'idle');
});
test('a saved result survives a transient outbox write failure without failing the remote run',async()=>{
  const records=new Map<string,any>(),runnerId=randomUUID(),id=randomUUID();let failWrite=true,failed=0;
  const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return records.get(k);},async write(k:string,v:any){if(v.state==='outbox'&&failWrite){failWrite=false;throw new Error('disk transient');}records.set(k,v);}};
  const client:any={async request(path:string){if(path.endsWith('/fail'))failed++;return {id,leaseToken:'x'.repeat(32),generation:1,leaseUntil:new Date(Date.now()+60000).toISOString()};},async get(){return {id};},async complete(){return {id};}};
  const runner=new Runner(client,store,{execute:async()=>({outcome:'completed',project:'unknown',report:'Synthetic',question:'',knowledge:'',evidence:[]})},runnerId,'synthetic');
  await assert.rejects(runner.tick(),/disk transient/);assert.equal(failed,0);assert.equal(records.get(runnerId).state,'outbox');await runner.tick();assert.equal(records.get(runnerId).state,'idle');
});
test('explicit analysis restart resumes its parked loop without stopping sync',async()=>{
  const runnerId=randomUUID(),userId=randomUUID(),sourceId=randomUUID(),records=new Map<string,any>();let claims=0;
  const store={async read(k:string){if(k==='device-'+runnerId)return {id:runnerId,userId,credential:'synthetic'};if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return records.get(k);},async write(k:string,v:any){records.set(k,v);}};
  const history:any={async request(path:string){if(path.endsWith('/claim')&&++claims===1)throw new Error('SOURCE_CHANGED');return null;}};
  const runtime=new LocalRuntime(history,{selection:async()=>({sourceId,runnerId})} as any,{identity:async()=>({userId})} as any,store,store,{execute:async()=>null});
  try{await runtime.start('analysis');await runtime.start('sync');for(let n=0;n<100&&runtime.status().analysis!=='recovery_required';n++)await new Promise(r=>setTimeout(r,1));assert.equal(runtime.status().analysis,'recovery_required');const restarted=await runtime.start('analysis');assert.equal(restarted.started,true);await new Promise(r=>setTimeout(r,5));assert.ok(claims>=2);assert.equal(runtime.status().sync,'idle');}finally{await runtime.stop();}
});
