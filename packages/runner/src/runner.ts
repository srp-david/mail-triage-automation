import {randomUUID} from 'node:crypto';
import type {HistoryClient} from '../../history-client/src/index.js';
import {resultSchema} from '../../contracts/src/v1.js';
export interface ReceiptStore {read(key:string):Promise<any>;write(key:string,value:unknown):Promise<void>}
export interface Executor {execute(run:any,signal:AbortSignal):Promise<unknown>}
// One instance per device. Caller must hold the app instance lock.
export class Runner {
  private busy=false;
  constructor(private client:HistoryClient,private store:ReceiptStore,private executor:Executor,readonly runnerId:string,private device:string,private heartbeatMs=30000){}
  async tick(){
    if(this.busy)throw new Error('RUNNER_BUSY');this.busy=true;
    try{return await this.advance();}finally{this.busy=false;}
  }
  private async advance(){
    let receipt:any;
    try{receipt=await this.store.read(this.runnerId);}catch(e:any){if(e.code!=='ENOENT')throw e;}
    if(receipt?.state==='running')throw new Error('RECOVERY_REQUIRES_REVALIDATION');
    if(receipt?.state==='outbox')return this.flush(receipt);
    if(receipt?.state!=='claiming'){
      receipt={state:'claiming',requestId:randomUUID()};await this.store.write(this.runnerId,receipt);
    }
    const claim=await this.client.request('/runners/'+this.runnerId+'/claim',{requestId:receipt.requestId},this.device);
    if(!claim){await this.store.write(this.runnerId,{state:'idle'});return null;}
    receipt={state:'running',claim,resultRequestId:randomUUID()};await this.store.write(this.runnerId,receipt);
    const lease={runnerId:this.runnerId,leaseToken:claim.leaseToken,generation:claim.generation};
    const controller=new AbortController();let deadline:ReturnType<typeof setTimeout>;
    const arm=(until:string)=>{clearTimeout(deadline);deadline=setTimeout(()=>controller.abort(new Error('LEASE_EXPIRED')),Math.max(0,Date.parse(until)-Date.now()-1000));};
    arm(claim.leaseUntil);let checking=false;
    const pulse=setInterval(async()=>{
      if(checking||controller.signal.aborted)return;checking=true;
      try{const h=await this.client.request('/runs/'+claim.id+'/heartbeat',lease,this.device);if(h.cancelRequested)controller.abort(new Error('CANCELLED'));else arm(h.leaseUntil);}
      catch{controller.abort(new Error('HEARTBEAT_FAILED'));}finally{checking=false;}
    },this.heartbeatMs);
    try{
      const run=await this.client.get(claim.id);controller.signal.throwIfAborted();
      const result=resultSchema.parse(await this.executor.execute(run,controller.signal));controller.signal.throwIfAborted();
      receipt={...receipt,state:'outbox',result};await this.store.write(this.runnerId,receipt);
    }finally{clearInterval(pulse);clearTimeout(deadline!);}
    return this.flush(receipt);
  }
  private async flush(receipt:any){
    const {claim}=receipt;
    const response=await this.client.complete(claim.id,{runnerId:this.runnerId,leaseToken:claim.leaseToken,generation:claim.generation},receipt.resultRequestId,receipt.result,this.device);
    // Keep an immutable protected per-run recovery copy before clearing the device slot.
    await this.store.write(claim.id,{...receipt,state:'saved',response});await this.store.write(this.runnerId,{state:'idle'});return response;
  }
}
