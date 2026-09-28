import {ApiError} from '../../../packages/contracts/src/v1.js';
import {Runner,type Executor,type ReceiptStore} from '../../../packages/runner/src/runner.js';
import {SyncRunner} from '../../../packages/runner/src/sync-runner.js';
import {Scheduler} from '../../../packages/runner/src/scheduler.js';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import type {LocalSession} from './session.js';
import type {LocalProfile} from './profile.js';
export class LocalRuntime {
  private loops=new Map<string,Scheduler>();
  private runner?:Runner;
  private sync?:SyncRunner;
  private key?:string;
  private chain:Promise<unknown>=Promise.resolve();
  private drained=false;
  private pausedKinds:('analysis'|'sync')[]=[];
  private pausedKey?:string;
  constructor(private history:HistoryClient,private profile:LocalProfile,private session:LocalSession,private secrets:ReceiptStore,private receipts:ReceiptStore,private executor?:Executor){}
  private serial<T>(fn:()=>Promise<T>){const next=this.chain.then(fn,fn);this.chain=next.catch(()=>{});return next;}
  private async initialize(){
    const selected=await this.profile.selection(),actor=await this.session.identity();if(!selected.runnerId)throw new ApiError(409,'RUNNER_REQUIRED');
    const key=actor.userId+':'+selected.runnerId+':'+selected.sourceId;
    if(this.key===key)return;
    await this.stopLoops();this.pausedKinds=[];this.pausedKey=undefined;
    const device=await this.secrets.read('device-'+selected.runnerId);if(device.userId!==actor.userId||device.id!==selected.runnerId)throw new ApiError(403,'RUNNER_DENIED');
    const check=async(sourceId:string)=>{
      const current=await this.profile.selection(),user=await this.session.identity();
      if(user.userId!==actor.userId||current.runnerId!==selected.runnerId||current.sourceId!==sourceId||sourceId!==selected.sourceId)throw new ApiError(409,'SOURCE_CHANGED');
      if(!current.original)throw new ApiError(409,'ORIGINAL_UNAVAILABLE');return current.original;
    };
    this.runner=new Runner(this.history,this.receipts,{execute:async(run,signal,progress)=>{
      if(!this.executor)throw new ApiError(409,'ADAPTER_NOT_RELEASE_APPROVED');const source=await check(run.sourceId);signal.throwIfAborted();
      const mail=await source.call('get_email',{id:run.mailId,body_limit:1});signal.throwIfAborted();
      if(Number(mail.id)!==Number(run.mailId)||(mail.messageId??null)!==run.messageId)throw new ApiError(409,'SOURCE_CHANGED');
      let parentResult=null;if(run.parentId){const parent=await this.history.get(run.parentId);if(parent.sourceId!==run.sourceId||parent.mailId!==run.mailId||parent.messageId!==run.messageId)throw new ApiError(409,'SOURCE_CHANGED');parentResult=parent.result;}
      return this.executor.execute({...run,parentResult},signal,progress);
    }},selected.runnerId,device.credential);
    this.sync=new SyncRunner(this.history,this.receipts,selected.runnerId,device.credential,async(sourceId,limit,signal)=>{
      const source=await check(sourceId);signal.throwIfAborted();return source.sync(limit,signal);
    });
    this.loops.set('analysis',new Scheduler(signal=>this.runner!.tick(signal),5000,60000));
    this.loops.set('sync',new Scheduler(signal=>this.sync!.tick(signal),5000,60000));
    this.key=key;
  }
  async start(kind:'analysis'|'sync'){return this.serial(async()=>{if(this.drained)throw new ApiError(409,'UPDATE_IN_PROGRESS');if(kind==='analysis'&&!this.executor)throw new ApiError(409,'ADAPTER_NOT_RELEASE_APPROVED');await this.initialize();const loop=this.loops.get(kind)!;if(loop.state==='recovery_required')await loop.stop();const started=loop.start();this.pausedKinds=this.pausedKinds.filter(value=>value!==kind);if(!this.pausedKinds.length)this.pausedKey=undefined;return {ok:true,started,state:loop.state};});}
  private async stopLoops(){await Promise.all([...this.loops.values()].map(s=>s.stop()));}
  async stop(){return this.serial(async()=>{this.pausedKinds=[];this.pausedKey=undefined;await this.stopLoops();return {ok:true};});}
  async pause(){return this.serial(async()=>{
    if(this.drained)throw new ApiError(409,'UPDATE_IN_PROGRESS');
    const kinds=(['analysis','sync'] as const).filter(kind=>['working','idle','retrying'].includes(this.loops.get(kind)?.state??''));
    if(kinds.length){this.pausedKinds=[...new Set([...this.pausedKinds,...kinds])];this.pausedKey=this.key;}
    await this.stopLoops();return {ok:true};
  });}
  async resume(){return this.serial(async()=>{
    if(this.drained)throw new ApiError(409,'UPDATE_IN_PROGRESS');
    if(!this.pausedKinds.length||!this.pausedKey)throw new ApiError(409,'NO_PAUSED_WORK');
    await this.session.token();const actor=await this.session.identity();if(actor.mustChangePassword)throw new ApiError(403,'PASSWORD_CHANGE_REQUIRED');
    const selected=await this.profile.selection();
    if(actor.userId+':'+selected.runnerId+':'+selected.sourceId!==this.pausedKey||!selected.original)throw new ApiError(409,'SOURCE_CHANGED');
    await this.initialize();for(const kind of this.pausedKinds)this.loops.get(kind)!.start();
    this.pausedKinds=[];this.pausedKey=undefined;return {ok:true};
  });}
  async reconfigure(apply:()=>Promise<Executor|undefined>){return this.serial(async()=>{
    if(this.drained)throw new ApiError(409,'UPDATE_IN_PROGRESS');
    if([...this.loops.values()].some(loop=>loop.state==='working'))throw new ApiError(409,'CONNECTION_WORK_IN_PROGRESS');
    await this.stopLoops();this.executor=await apply();this.pausedKinds=[];this.pausedKey=undefined;this.key=undefined;this.runner=undefined;this.sync=undefined;this.loops.clear();
  });}
  async drain(){return this.serial(async()=>{this.drained=true;await Promise.all([...this.loops.values()].map(s=>s.drain()));return {ok:true};});}
  releaseDrain(){this.drained=false;}
  status(){return {analysis:this.loops.get('analysis')?.state??'stopped',sync:this.loops.get('sync')?.state??'stopped',analysisAvailable:!!this.executor};}
  trayStatus(){const status=this.status();return {...status,canPause:!this.drained&&[status.analysis,status.sync].some(value=>['working','idle','retrying'].includes(value)),canResume:!this.drained&&this.pausedKinds.length>0};}
  async recovery(){return this.serial(async()=>{await this.initialize();return {analysis:await this.runner!.recovery(),sync:await this.sync!.recovery()};});}
  async resolve(action:'archive-analysis'|'archive-sync'|'deliver'|'deliver-sync'|'recover'){return this.serial(async()=>{
    await this.initialize();await this.loops.get(action.includes('sync')?'sync':'analysis')!.stop();
    if(action==='archive-analysis')return this.runner!.archiveInterrupted();
    if(action==='archive-sync')return this.sync!.archiveInterrupted();
    if(action==='deliver-sync')return this.sync!.deliverOutbox();
    if(action==='deliver'){if((await this.runner!.recovery())?.state!=='outbox')throw new ApiError(409,'NO_RECOVERABLE_RESULT');return this.runner!.tick();}
    return this.runner!.recoverResult(async run=>{const s=await this.profile.selection();if(s.sourceId!==run.sourceId||!s.original)throw new ApiError(409,'ORIGINAL_UNAVAILABLE');const mail=await s.original.call('get_email',{id:run.mailId,body_limit:1});if(Number(mail.id)!==Number(run.mailId)||(mail.messageId??null)!==run.messageId)throw new ApiError(409,'SOURCE_CHANGED');return {messageId:run.messageId,verifiedAt:new Date().toISOString()};});
  });}
}
