import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,open,readFile,rename,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import {verifyUpdate,type SignedUpdate} from '../../../packages/contracts/src/updates.js';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import type {LocalRuntime} from './runtime.js';
import type {UpdateState} from '../../../packages/contracts/src/update-state.js';

export class LocalUpdates {
  private state:UpdateState;
  private timer?:ReturnType<typeof setInterval>;
  private checking?:Promise<UpdateState>;
  private installing=false;
  private abort?:AbortController;
  private epoch=0;
  private deferredRelease?:string;
  constructor(private root:string,private version:string,private history:HistoryClient,private runtime:LocalRuntime){this.state={currentVersion:version,status:'unknown',phase:'idle'};}
  snapshot():UpdateState{return structuredClone(this.state);}
  start(interval=60*60*1000){if(this.timer)return;void this.check();this.timer=setInterval(()=>void this.check(),interval);this.timer.unref();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;this.reset();}
  reset(){this.epoch++;this.abort?.abort();this.checking=undefined;this.deferredRelease=undefined;this.state={currentVersion:this.version,status:'unknown',phase:'idle'};}
  defer(){if(this.installing)throw new ApiError(409,'UPDATE_IN_PROGRESS');this.deferredRelease=this.state.update?.releaseId;this.state.deferred=!!this.deferredRelease;return this.snapshot();}
  async check(manual=false):Promise<UpdateState>{
    if(this.installing)return this.snapshot();
    if(manual){this.deferredRelease=undefined;this.state.deferred=false;}
    if(this.checking)return this.checking;
    const epoch=this.epoch;this.state.phase='checking';delete this.state.errorCode;
    const pending=(async()=>{
      try{
        const result=await this.offer();if(epoch!==this.epoch)return this.snapshot();
        this.state={currentVersion:this.version,status:result.status,phase:'idle',lastCheckedAt:new Date().toISOString(),
          ...(result.update?{update:{releaseId:result.update.releaseId,version:result.update.version,assetSha256:result.update.assetSha256,releaseNotesUrl:result.update.releaseNotesUrl},deferred:this.deferredRelease===result.update.releaseId}:{})};
      }catch(error){if(epoch===this.epoch)this.fail(error);}
      return this.snapshot();
    })();
    this.checking=pending;
    try{return await pending;}finally{if(this.checking===pending)this.checking=undefined;}
  }
  private fail(error:unknown){
    const code=error instanceof ApiError?error.code:'UPDATE_CHECK_FAILED';
    const login=error instanceof ApiError&&(error.status===401||code==='PASSWORD_CHANGE_REQUIRED');
    this.state={currentVersion:this.version,status:login?'login_required':'error',phase:'error',lastCheckedAt:this.state.lastCheckedAt,errorCode:code};
  }
  private async offer():Promise<{status:UpdateState['status'];update?:SignedUpdate}>{
    if(this.version==='0.0.0')return {status:'unavailable' as const};
    const channel=this.version.includes('-candidate.')?'test':'stable';
    const response=await this.history.request<{status:string;update?:unknown}>('/updates/check',undefined,undefined,
      {query:{version:this.version,platform:'win32-x64',channel}});
    if(response?.status!=='offered')return {status:response?.status==='current'?'current':response?.status==='channel_denied'?'channel_denied':'unavailable'};
    try{return {status:'offered' as const,update:verifyUpdate(response.update)};}
    catch{throw new ApiError(503,'UPDATE_SIGNATURE_INVALID');}
  }
  private async download(update:SignedUpdate,active:()=>void,signal:AbortSignal){
    this.state.phase='downloading';this.state.downloadedBytes=0;this.state.totalBytes=update.assetSize;
    const directory=join(this.root,'scratch','updates');await mkdir(directory,{recursive:true});
    const target=join(directory,update.version+'-setup.exe');
    try{if((await stat(target)).size===update.assetSize&&createHash('sha256').update(await readFile(target)).digest('hex')===update.assetSha256)return target;
      await unlink(target);}
    catch(error:any){if(error?.code!=='ENOENT')throw error;}
    const part=target+'.part-'+randomUUID();let file;
    try{
      let url=new URL(update.assetUrl),response:Response|undefined;
      for(let redirect=0;redirect<6;redirect++){
        if(url.protocol!=='https:'||url.username||url.password||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))
          throw new ApiError(503,'UPDATE_DOWNLOAD_ORIGIN');
        response=await fetch(url,{redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(180000)])});active();
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location');if(!location)throw new ApiError(503,'UPDATE_DOWNLOAD_REDIRECT');
          url=new URL(location,url);continue;
        }break;
      }
      if(!response?.ok||!response.body)throw new ApiError(503,'UPDATE_DOWNLOAD_FAILED');
      if(Number(response.headers.get('content-length')??0)>update.assetSize)throw new ApiError(503,'UPDATE_DOWNLOAD_SIZE');
      file=await open(part,'wx');const hash=createHash('sha256');let total=0;
      for await(const chunk of response.body){active();const bytes=Buffer.from(chunk);total+=bytes.length;
        if(total>update.assetSize)throw new ApiError(503,'UPDATE_DOWNLOAD_SIZE');hash.update(bytes);
        let offset=0;while(offset<bytes.length){const result=await file.write(bytes,offset,bytes.length-offset,null);offset+=result.bytesWritten;}
        active();this.state.downloadedBytes=total;
      }
      await file.sync();await file.close();file=undefined;active();this.state.phase='verifying';
      if(total!==update.assetSize||hash.digest('hex')!==update.assetSha256)throw new ApiError(503,'UPDATE_DOWNLOAD_CHECKSUM');
      await rename(part,target);return target;
    }finally{await file?.close().catch(()=>{});await unlink(part).catch(()=>{});}
  }
  beginInstall(input:{releaseId:string;assetSha256:string},installed:()=>Promise<unknown>){
    if(this.installing)throw new ApiError(409,'UPDATE_IN_PROGRESS');
    if(this.state.status!=='offered'||this.state.update?.releaseId!==input.releaseId||this.state.update.assetSha256!==input.assetSha256)throw new ApiError(409,'UPDATE_NOT_OFFERED');
    this.installing=true;this.abort=new AbortController();const epoch=this.epoch;this.state.phase='verifying';delete this.state.errorCode;
    void this.prepare(input,epoch).then(()=>installed()).catch(error=>{if(epoch===this.epoch)this.fail(error);}).finally(()=>{this.installing=false;});
    return this.snapshot();
  }
  private async prepare(input:{releaseId:string;assetSha256:string},epoch:number){
    const active=()=>{if(epoch!==this.epoch)throw new ApiError(409,'UPDATE_CANCELLED');};
    // A previously started background check must not overwrite install progress.
    await this.checking;active();this.state.phase='verifying';
    const first=await this.offer();active();if(first.status!=='offered'||!first.update)throw new ApiError(409,'UPDATE_NOT_OFFERED');
    if(first.update.releaseId!==input.releaseId||first.update.assetSha256!==input.assetSha256)throw new ApiError(409,'UPDATE_CHANGED');
    const installer=await this.download(first.update,active,this.abort!.signal);active();this.state.phase='verifying';
    const latest=await this.offer();active();if(latest.status!=='offered'||!latest.update||latest.update.releaseId!==first.update.releaseId||latest.update.assetSha256!==first.update.assetSha256)
      throw new ApiError(409,'UPDATE_CHANGED');
    try{
      this.state.phase='waiting';await this.runtime.drain();
      active();this.state.phase='installing';
      const child=spawn(installer,['--home',this.root,'--wait-for-stop','--restart'],{windowsHide:true,detached:true,stdio:'ignore'});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);});
      child.unref();
      return {accepted:true,releaseId:first.update.releaseId};
    }catch{this.runtime.releaseDrain();throw new ApiError(503,'UPDATER_START_FAILED');}
  }
}
