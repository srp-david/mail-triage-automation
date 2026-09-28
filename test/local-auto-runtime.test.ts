import {test,expect} from 'vitest';
import {LocalRuntime} from '../apps/local-app/src/runtime.js';
import {Scheduler} from '../packages/runner/src/scheduler.js';
import {localUiRoutes,type LocalSelection} from '../apps/local-app/src/ui-routes.js';
import {requestContext,finishRoutes} from '../packages/contracts/src/http.js';
import express from 'express';
import {randomUUID} from 'node:crypto';

function fixture(withAgent=true){
  const sourceId=randomUUID(),runnerId=randomUUID(),userId=randomUUID(),id=randomUUID();
  const records=new Map<string,any>();let queued=false,executed=0,collected=0;
  const source={call:async()=>({id:1,messageId:'<synthetic>',subject:'Synthetic',fetchedAt:'2026-09-28T00:00:00Z'}),sync:async()=>{collected++;return {status:'success',saved:1,failed:0,remaining:0,errors:[]};}};
  const selection:LocalSelection={sourceId,runnerId,agent:'codex',original:source as any};
  const store={async read(key:string){if(key==='device-'+runnerId)return {id:runnerId,userId,credential:'synthetic'};if(!records.has(key))throw Object.assign(new Error(),{code:'ENOENT'});return structuredClone(records.get(key));},async write(key:string,value:any){records.set(key,structuredClone(value));}};
  const claim={id,runnerId,leaseToken:'s'.repeat(32),generation:1,leaseUntil:new Date(Date.now()+120000).toISOString()};
  const history:any={
    async start(){queued=true;return {id};},
    async get(){return {id,sourceId,mailId:1,messageId:'<synthetic>'};},
    async complete(){return {id,status:'completed'};},
    async request(path:string){
      if(path==='/sync-runs'){queued=true;return {id};}
      if(path.endsWith('/sync-next'))return queued?{id,source_id:sourceId}:null;
      if(path.endsWith('/claim')){if(!queued)return null;queued=false;return claim;}
      if(path.endsWith('/heartbeat'))return {leaseUntil:claim.leaseUntil,stopRequested:false};
      if(path.endsWith('/batch'))return {status:'completed'};
      return {ok:true};
    }
  };
  const runtime=new LocalRuntime(history,{selection:async()=>selection} as any,{identity:async()=>({userId})} as any,store,store,withAgent?{async execute(){executed++;return {outcome:'completed',project:'unknown',report:'Synthetic',question:'',knowledge:'',evidence:[]};}}:undefined);
  return {runtime,selection,records,history,counts:()=>({executed,collected,queued})};
}
test.each(['sync','analysis'] as const)('%s request from stopped runtime starts and completes without manual start',async kind=>{
  const f=fixture(),app=express();app.use(requestContext);app.use(express.json());
  localUiRoutes(app,f.history,{selection:async()=>f.selection,submit:(k,s,enqueue)=>f.runtime.submit(k,s,enqueue)} as any);
  const server=finishRoutes(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
    expect(f.runtime.status()[kind]).toBe('stopped');
    const response=await fetch('http://127.0.0.1:'+(server.address() as any).port+'/api/'+(kind==='sync'?'sync':'runs'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(kind==='sync'?{}:{storeId:f.selection.sourceId,mailId:1,messageId:'<synthetic>',requestId:randomUUID()})});
    expect(response.status).toBe(kind==='sync'?202:201);
    await expect.poll(()=>f.runtime.status()[kind]).toBe('idle');
    expect(f.counts()).toEqual({executed:kind==='analysis'?1:0,collected:kind==='sync'?1:0,queued:false});
    expect(f.runtime.status()[kind==='sync'?'analysis':'sync']).toBe('stopped');
  }finally{await f.runtime.stop();await new Promise<void>(r=>server.close(()=>r()));}
});
test('unavailable agent, recovery, changed selection, pause and update reject before enqueue',async()=>{
  for(const reason of ['agent','recovery','source','pause','update','enqueue'] as const){
    const f=fixture(reason!=='agent');let admitted=0;
    try{
      const expected={...f.selection};
      if(reason==='recovery')f.records.set(f.selection.runnerId!,{state:'interrupted'});
      if(reason==='source')f.selection.sourceId=randomUUID();
      if(reason==='pause'){await f.runtime.start('sync');await expect.poll(()=>f.runtime.status().sync).toBe('idle');await f.runtime.pause();}
      if(reason==='update')await f.runtime.drain();
      await expect(f.runtime.submit('analysis',expected,async()=>{if(reason==='enqueue')throw new Error('NETWORK_FAILED');admitted++;return {id:'synthetic'};})).rejects.toThrow({agent:'AGENT_NOT_CONFIGURED',recovery:'LOCAL_RECOVERY_REQUIRED',source:'SOURCE_CHANGED',pause:'LOCAL_RUNTIME_PAUSED',update:'UPDATE_IN_PROGRESS',enqueue:'NETWORK_FAILED'}[reason]);
      expect(admitted).toBe(0);expect(f.runtime.status().analysis).toBe('stopped');
    }finally{await f.runtime.stop();}
  }
});
test('idle polling wakes immediately and repeated wakes never overlap active execution',async()=>{
  let calls=0,active=0,maximum=0,finish:undefined|(()=>void);
  const loop=new Scheduler(async()=>{calls++;active++;maximum=Math.max(maximum,active);if(calls===2)await new Promise<void>(r=>finish=r);active--;return null;},60000,60000);
  try{
    loop.start();await expect.poll(()=>loop.state).toBe('idle');
    loop.wake();await expect.poll(()=>calls).toBe(2);
    loop.wake();loop.wake();expect(calls).toBe(2);finish!();
    await expect.poll(()=>calls).toBe(3);expect(maximum).toBe(1);
  }finally{finish?.();await loop.stop();}
});
