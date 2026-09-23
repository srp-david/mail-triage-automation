import {test,vi,afterEach,onTestFinished} from 'vitest';
afterEach(()=>vi.useRealTimers());
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {watchLease,failureCode} from '../packages/runner/src/lease-heartbeat.js';
import {Runner} from '../packages/runner/src/runner.js';
import {ApiError} from '../packages/contracts/src/v1.js';
const now=Date.parse('2026-09-21T00:00:00Z');
const until=(ms=120000)=>new Date(Date.now()+ms).toISOString();
const flush=()=>new Promise<void>(r=>setImmediate(r));
async function advance(ms:number){await vi.advanceTimersByTimeAsync(ms);await flush();}
function clock(){vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']});vi.setSystemTime(now);}

test('execution exceptions and time limits retain their own failure category',()=>{
  assert.equal(failureCode(new TypeError('executor programming error')),'AGENT_FAILED');
  assert.equal(failureCode(new TypeError('fetch failed'),true),'NETWORK_ERROR');
  assert.equal(failureCode(new Error('TIMEOUT')),'TIMEOUT');
});

test('heartbeat retries transient failures after 5, 15 and 30 seconds and resets after success',async()=>{
  clock();const controller=new AbortController(),times:number[]=[];
  const failures=[new TypeError('fetch failed'),new ApiError(503,'TEMPORARY'),new DOMException('timeout','TimeoutError'),null,new ApiError(429,'RATE_LIMITED'),null];
  const stop=watchLease(controller,until(),async()=>{times.push(Date.now()-now);const error=failures.shift();if(error)throw error;return {leaseUntil:until()};});onTestFinished(stop);
  for(const ms of [30000,5000,15000,30000,30000,5000])await advance(ms);
  assert.deepEqual(times,[30000,35000,50000,80000,110000,115000]);assert.equal(controller.signal.aborted,false);
});
test('heartbeat retry exhaustion is a network failure, never user cancellation',async()=>{
  clock();const c=new AbortController();let calls=0;
  onTestFinished(watchLease(c,until(),async()=>{calls++;throw new TypeError('network');}));
  for(const ms of [30000,5000,15000,30000])await advance(ms);
  assert.equal(calls,4);assert.equal(c.signal.reason.message,'NETWORK_ERROR');
  await advance(120000);assert.equal(calls,4);
});
test('lease deadline stops retries and fences even a late successful in-flight response',async()=>{
  clock();const c=new AbortController();let release!:(value:any)=>void,calls=0,signal!:AbortSignal;
  onTestFinished(watchLease(c,until(40000),async s=>{calls++;signal=s;return new Promise(r=>release=r);}));
  await advance(30000);assert.equal(calls,1);await advance(9000);
  assert.equal(c.signal.reason.message,'LEASE_EXPIRED');assert.equal(signal.aborted,true);
  release({leaseUntil:until()});await flush();await advance(200000);assert.equal(calls,1);
});
test('lease deadline also stops a scheduled transient retry before its due time',async()=>{
  clock();const c=new AbortController();let calls=0;
  onTestFinished(watchLease(c,until(40000),async()=>{calls++;throw new ApiError(502,'TEMPORARY');}));
  await advance(30000);await advance(5000);assert.equal(calls,2);
  await advance(4000);assert.equal(c.signal.reason.message,'LEASE_EXPIRED');await advance(30000);assert.equal(calls,2);
});
test('explicit cleanup fences in-flight heartbeat without aborting completed work',async()=>{
  clock();const c=new AbortController();let release!:(value:any)=>void,calls=0;
  const stop=watchLease(c,until(),async()=>{calls++;return new Promise(r=>release=r);});
  await advance(30000);stop();release({leaseUntil:until()});await flush();await advance(200000);
  assert.equal(calls,1);assert.equal(c.signal.aborted,false);
});
test('authorization and lease rejection stop immediately; only explicit cancel is CANCELLED',async()=>{
  clock();
  for(const [response,expected] of [[new ApiError(401,'LOGIN_REQUIRED'),'AUTH_REJECTED'],[new ApiError(403,'RUNNER_DENIED'),'AUTH_REJECTED'],[new ApiError(404,'SOURCE_NOT_FOUND'),'AUTH_REJECTED'],[new ApiError(409,'LEASE_CONFLICT'),'LEASE_EXPIRED'],[{cancelRequested:true,leaseUntil:until()},'CANCELLED']] as const){
    const c=new AbortController();let calls=0;const stop=watchLease(c,until(),async()=>{calls++;if(response instanceof Error)throw response;return response;});
    await advance(30000);assert.equal(c.signal.reason.message,expected);await advance(5000);assert.equal(calls,1);stop();
  }
});

function fixture(heartbeat:()=>Promise<any>,execute:(signal:AbortSignal,progress:any)=>Promise<any>){
  const runnerId=randomUUID(),id=randomUUID(),records=new Map<string,any>(),failures:string[]=[];let completed=0;
  const store={async read(key:string){if(!records.has(key))throw Object.assign(new Error(),{code:'ENOENT'});return records.get(key);},async write(key:string,v:any){records.set(key,structuredClone(v));}};
  const client:any={async request(path:string,body:any){
    if(path.endsWith('/claim'))return {id,runnerId,leaseToken:'x'.repeat(32),generation:1,leaseUntil:until()};
    if(path.endsWith('/heartbeat'))return heartbeat();
    if(path.endsWith('/fail')){failures.push(body.code);return {ok:true};}
    if(path.endsWith('/progress'))throw new TypeError('lost advisory progress response');
    throw new Error('Unexpected request');
  },async get(){return {id};},async complete(){completed++;return {id,status:'completed'};}};
  const runner=new Runner(client,store,{execute:(_run,signal,progress)=>execute(signal,progress)},runnerId,'synthetic-device');
  return {runner,records,runnerId,failures,completed:()=>completed};
}
test('Runner survives one heartbeat failure and lost progress without rerunning the agent',async()=>{
  clock();let heartbeats=0,executions=0,finish!:(value:any)=>void;
  const f=fixture(async()=>{if(++heartbeats===1)throw new TypeError('network');return {leaseUntil:until()};},async(signal,progress)=>{executions++;await progress({kind:'mail_read',outcome:'completed'});return new Promise((r,j)=>{finish=r;signal.addEventListener('abort',()=>j(signal.reason),{once:true});});});
  const pending=f.runner.tick();await flush();await advance(30000);assert.equal(f.failures.length,0);await advance(5000);
  finish({outcome:'completed',project:'unknown',report:'Synthetic',question:'',knowledge:'',evidence:[]});await pending;
  assert.equal(executions,1);assert.equal(heartbeats,2);assert.equal(f.completed(),1);assert.deepEqual(f.failures,[]);assert.equal(f.records.get(f.runnerId).state,'idle');
});
test('Runner persists distinct network, user cancel, authorization and app stop failure reasons',async()=>{
  clock();
  for(const reason of ['NETWORK_ERROR','CANCELLED','AUTH_REJECTED','APP_STOPPED']){
    const f=fixture(async()=>{if(reason==='NETWORK_ERROR')throw new TypeError('network');if(reason==='AUTH_REJECTED')throw new ApiError(403,'RUNNER_DENIED');return {leaseUntil:until(),cancelRequested:true};},signal=>new Promise((_,j)=>signal.addEventListener('abort',()=>j(signal.reason),{once:true})));
    const pending=f.runner.tick().catch(e=>e);await flush();
    if(reason==='APP_STOPPED')f.runner.stop();else{await advance(30000);if(reason==='NETWORK_ERROR')for(const ms of [5000,15000,30000])await advance(ms);}
    await pending;assert.deepEqual(f.failures,[reason]);assert.equal(f.records.get(f.runnerId).reason,reason);assert.equal(f.completed(),0);
    await assert.rejects(f.runner.tick(),/RECOVERY_REQUIRES_REVALIDATION/);
  }
});
