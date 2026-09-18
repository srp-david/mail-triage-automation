import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Runner} from '../packages/runner/src/runner.js';
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
