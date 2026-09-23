import {randomUUID} from 'node:crypto';
import type {HistoryClient} from '../../history-client/src/index.js';
import {resultSchema} from '../../contracts/src/v1.js';
import {watchLease,failureCode,transientHistoryError} from './lease-heartbeat.js';
export interface ReceiptStore {read(key:string):Promise<any>;write(key:string,value:unknown):Promise<void>}
export type RunnerProgress={kind:'analysis_started'|'mail_read'|'local_tool'|'db_tool'|'result_saving';outcome:'completed'|'failed'};
export interface Executor {execute(run:any,signal:AbortSignal,progress?:(event:RunnerProgress)=>Promise<void>):Promise<unknown>}
// One instance per device. Caller must hold the app instance lock.
export class Runner {
  private busy=false;
  private controller?:AbortController;
  constructor(private client:HistoryClient,private store:ReceiptStore,private executor:Executor,readonly runnerId:string,private device:string,private heartbeatMs=30000){}
  async tick(signal?:AbortSignal){
    if(this.busy)throw new Error('RUNNER_BUSY');this.busy=true;
    this.controller=new AbortController();const stop=()=>this.controller?.abort(new Error('APP_STOPPED'));signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    try{return await this.advance(this.controller);}finally{signal?.removeEventListener('abort',stop);this.controller=undefined;this.busy=false;}
  }
  stop(){this.controller?.abort(new Error('APP_STOPPED'));}
  private async advance(controller:AbortController){
    controller.signal.throwIfAborted();
    let receipt:any;
    try{receipt=await this.store.read(this.runnerId);}catch(e:any){if(e.code!=='ENOENT')throw e;}
    if(['running','interrupted','recovering'].includes(receipt?.state))throw new Error('RECOVERY_REQUIRES_REVALIDATION');
    if(receipt?.state==='outbox')return this.flush(receipt);
    if(receipt?.state!=='claiming'){
      receipt={state:'claiming',requestId:randomUUID()};await this.store.write(this.runnerId,receipt);
    }
    const claim=await this.client.request('/runners/'+this.runnerId+'/claim',{requestId:receipt.requestId},this.device);
    if(!claim){await this.store.write(this.runnerId,{state:'idle'});return null;}
    receipt={state:'running',claim,resultRequestId:randomUUID()};await this.store.write(this.runnerId,receipt);
    const lease={runnerId:this.runnerId,leaseToken:claim.leaseToken,generation:claim.generation};
    const stopHeartbeat=watchLease(controller,claim.leaseUntil,signal=>this.client.request('/runs/'+claim.id+'/heartbeat',lease,this.device,{signal}),this.heartbeatMs);
    try{
      controller.signal.throwIfAborted();
      const run=await this.client.get(claim.id).catch(error=>{throw new Error(failureCode(error,true));});controller.signal.throwIfAborted();
      const progress=async(event:RunnerProgress)=>{
        controller.signal.throwIfAborted();
        try{await this.client.request('/runs/'+claim.id+'/progress',{...lease,event},this.device,{signal:controller.signal});}
        catch(error){
          controller.signal.throwIfAborted();
          // Progress is advisory and has no idempotency key. Do not duplicate it
          // or kill valid work for a lost response; heartbeat still fences work.
          if(!transientHistoryError(error)){controller.abort(new Error(failureCode(error,true)));throw error;}
        }
        controller.signal.throwIfAborted();
      };
      await progress({kind:'analysis_started',outcome:'completed'});
      const result=resultSchema.parse(await this.executor.execute(run,controller.signal,progress));controller.signal.throwIfAborted();
      receipt={...receipt,state:'outbox',result};await this.store.write(this.runnerId,receipt);
      await progress({kind:'result_saving',outcome:'completed'}).catch(()=>{});
    }catch(error){
      const reason=failureCode(controller.signal.aborted?controller.signal.reason:error);
      await this.store.write(this.runnerId,{...receipt,state:receipt.result?'outbox':'interrupted',reason});
      if(!receipt.result)await this.client.request('/runs/'+claim.id+'/fail',{...lease,code:reason},this.device).catch(()=>{});
      throw error;
    }finally{stopHeartbeat();}
    return this.flush(receipt);
  }
  async recovery(){let r:any;try{r=await this.store.read(this.runnerId);}catch(e:any){if(e.code!=='ENOENT')throw e;}return r?{state:r.state,runId:r.claim?.id,hasResult:!!r.result,reason:r.reason}:null;}
  async archiveInterrupted(){
    if(this.busy)throw new Error('RUNNER_BUSY');
    this.busy=true;try{const r=await this.store.read(this.runnerId);if(!['running','interrupted'].includes(r.state)||r.result)throw new Error('RECOVERY_ACTION_INVALID');
    const run=await this.client.get(r.claim.id);if(['queued','running'].includes(run.status))throw new Error('RUN_STILL_ACTIVE');
    await this.store.write(r.claim.id,{...r,state:'interrupted-archived'});await this.store.write(this.runnerId,{state:'idle'});return {ok:true};}finally{this.busy=false;}
  }
  async recoverResult(revalidate:(run:any)=>Promise<{messageId:string|null;verifiedAt:string}>){
    if(this.busy)throw new Error('RUNNER_BUSY');this.busy=true;
    try{
      const r=await this.store.read(this.runnerId);if(!r.result||!['outbox','recovering'].includes(r.state))throw new Error('NO_RECOVERABLE_RESULT');
      const run=await this.client.get(r.claim.id),proof=await revalidate(run);
      const receipt={...r,state:'recovering',recoveryRequestId:r.recoveryRequestId??randomUUID()};await this.store.write(this.runnerId,receipt);
      const response=await this.client.request('/runs/'+r.claim.id+'/recover',{runnerId:this.runnerId,leaseToken:r.claim.leaseToken,generation:r.claim.generation,requestId:receipt.recoveryRequestId,result:r.result,...proof},this.device);
      await this.store.write(response.id,{...receipt,state:'saved',response});await this.store.write(this.runnerId,{state:'idle'});return response;
    }finally{this.busy=false;}
  }
  private async flush(receipt:any){
    const {claim}=receipt;
    const response=await this.client.complete(claim.id,{runnerId:this.runnerId,leaseToken:claim.leaseToken,generation:claim.generation},receipt.resultRequestId,receipt.result,this.device);
    // Keep an immutable protected per-run recovery copy before clearing the device slot.
    await this.store.write(claim.id,{...receipt,state:'saved',response});await this.store.write(this.runnerId,{state:'idle'});return response;
  }
}
