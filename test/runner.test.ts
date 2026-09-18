import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Runner} from '../packages/runner/src/runner.js';
import {Scheduler} from '../packages/runner/src/scheduler.js';
import {syncBatch} from '../packages/runner/src/sync.js';
test('result outbox survives lost completion response without executing agent twice',async()=>{
  const records=new Map<string,any>();const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return structuredClone(records.get(k));},async write(k:string,v:any){records.set(k,structuredClone(v));}};
  const id=randomUUID(),runnerId=randomUUID();let executions=0,completed=0;
  const client:any={async request(){return {id,runnerId,leaseToken:'x'.repeat(32),generation:1,leaseUntil:new Date(Date.now()+120000).toISOString()};},async get(){return {id};},async complete(){if(++completed===1)throw new Error('response lost');return {id,status:'completed'};}};
  const executor={async execute(){executions++;return {outcome:'completed',project:'unknown',report:'Synthetic',question:'',knowledge:'',evidence:[]};}};
  await assert.rejects(new Runner(client,store,executor,runnerId,'secret').tick(),/response lost/);
  assert.equal(records.get(runnerId).state,'outbox');
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
