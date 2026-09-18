import {randomUUID} from 'node:crypto';
import type {HistoryClient} from '../../history-client/src/index.js';
import type {ReceiptStore} from './runner.js';
import type {Lease} from '../../contracts/src/v1.js';
import {normalizeSync} from '../../contracts/src/sync.js';
// User explicitly starts/resumes a new sync. Never replay a possibly executed MCP batch.
export async function syncBatch(client:HistoryClient,store:ReceiptStore,id:string,lease:Lease,device:string,
  collect:(limit:number,signal:AbortSignal)=>Promise<unknown>,signal?:AbortSignal){
  signal?.throwIfAborted();
  const key='sync-'+id;let receipt:any;
  try{receipt=await store.read(key);}catch(e:any){if(e.code!=='ENOENT')throw e;}
  if(receipt?.state==='started')throw new Error('SYNC_OUTCOME_UNCERTAIN');
  if(receipt?.state!=='outbox'){
    const heartbeat=await client.request('/sync-runs/'+id+'/heartbeat',lease,device);
    if(heartbeat.stopRequested)return {status:'paused'};
    if(heartbeat.nextAttemptAt&&Date.parse(heartbeat.nextAttemptAt)>Date.now())return {status:'retrying',nextAttemptAt:heartbeat.nextAttemptAt};
    receipt={state:'started',batchId:randomUUID()};await store.write(key,receipt);
    await client.request('/sync-runs/'+id+'/beginBatch',{...lease,batchId:receipt.batchId},device);
    // collect must enforce a timeout shorter than the returned lease. A lost response remains uncertain.
    const remaining=Date.parse(heartbeat.leaseUntil)-Date.now()-1000;
    if(remaining<=0)throw new Error('SYNC_LEASE_EXPIRED');
    const controller=new AbortController();const cancel=()=>controller.abort(new Error('SYNC_OUTCOME_UNCERTAIN'));signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,Math.min(remaining,90000));
    let response:unknown;
    try{response=normalizeSync(await Promise.race([collect(100,controller.signal),new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(new Error('SYNC_OUTCOME_UNCERTAIN')),{once:true});if(signal?.aborted)cancel();})]));}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    receipt={...receipt,state:'outbox',response};await store.write(key,receipt);
  }
  const result=await client.request('/sync-runs/'+id+'/batch',{...lease,batchId:receipt.batchId,response:receipt.response},device);
  await store.write(key,{state:'saved',batchId:receipt.batchId});return result;
}
