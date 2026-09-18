import {randomUUID} from 'node:crypto';
import type {HistoryClient} from '../../history-client/src/index.js';
import type {ReceiptStore} from './runner.js';
import {syncBatch} from './sync.js';
export class SyncRunner {
  private activeId?:string;
  private busy=false;
  constructor(private client:HistoryClient,private store:ReceiptStore,readonly runnerId:string,private device:string,private collect:(sourceId:string,limit:number,signal:AbortSignal)=>Promise<unknown>){}
  async tick(signal:AbortSignal){if(this.busy)throw new Error('SYNC_BUSY');this.busy=true;try{
    signal.throwIfAborted();const key='sync-device-'+this.runnerId;let receipt:any;
    try{receipt=await this.store.read(key);}catch(e:any){if(e.code!=='ENOENT')throw e;}
    if(receipt?.state==='running'&&receipt.claim.id!==this.activeId)throw new Error('SYNC_RECOVERY_REQUIRED');
    if(!receipt||receipt.state==='idle'){
      const next=await this.client.request('/runners/'+this.runnerId+'/sync-next',undefined,this.device);if(!next)return null;
      receipt={state:'claiming',id:next.id,sourceId:next.source_id,requestId:randomUUID()};await this.store.write(key,receipt);
    }
    if(receipt.state==='claiming'){
      const claim=await this.client.request('/sync-runs/'+receipt.id+'/claim',{requestId:receipt.requestId},this.device);
      receipt={...receipt,state:'running',claim};await this.store.write(key,receipt);this.activeId=claim.id;
    }
    const {claim}=receipt,lease={runnerId:this.runnerId,leaseToken:claim.leaseToken,generation:claim.generation};
    const result=await syncBatch(this.client,this.store,claim.id,lease,this.device,(limit,s)=>this.collect(receipt.sourceId,limit,s),signal);
    if(!['running','retrying'].includes(result.status)){await this.store.write(key,{state:'idle'});this.activeId=undefined;}
    return result;
  }finally{this.busy=false;}}
  async recovery(){try{const r=await this.store.read('sync-device-'+this.runnerId);return {state:r.state,id:r.claim?.id};}catch(e:any){if(e.code==='ENOENT')return null;throw e;}}
  async deliverOutbox(){if(this.busy)throw new Error('SYNC_BUSY');this.busy=true;try{
    const key='sync-device-'+this.runnerId,r=await this.store.read(key),claim=r.claim;
    if(!claim||(await this.store.read('sync-'+claim.id)).state!=='outbox')throw new Error('NO_RECOVERABLE_RESULT');
    const lease={runnerId:this.runnerId,leaseToken:claim.leaseToken,generation:claim.generation};
    const result=await syncBatch(this.client,this.store,claim.id,lease,this.device,async()=>{throw new Error('RECOVERY_MUST_NOT_COLLECT');});
    if(['running','retrying'].includes(result.status)){await this.client.request('/sync-runs/'+claim.id+'/stop',{});await this.client.request('/sync-runs/'+claim.id+'/heartbeat',lease,this.device);}
    await this.store.write(key,{state:'idle'});this.activeId=undefined;return result;
  }finally{this.busy=false;}}
  async archiveInterrupted(){if(this.busy)throw new Error('SYNC_BUSY');this.busy=true;try{const key='sync-device-'+this.runnerId,r=await this.store.read(key);if(!r.claim?.id)throw new Error('SYNC_RECOVERY_REQUIRED');
    const remote=await this.client.request('/sync-runs/'+r.claim.id);if(['queued','running','retrying'].includes(remote.status))throw new Error('SYNC_STILL_ACTIVE');
    await this.store.write('sync-archive-'+r.claim.id,r);await this.store.write(key,{state:'idle'});this.activeId=undefined;return {ok:true};
  }finally{this.busy=false;}}
}
