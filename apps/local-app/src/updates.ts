import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,open,readFile,rename,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import {verifyUpdate,type SignedUpdate} from '../../../packages/contracts/src/updates.js';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import type {LocalRuntime} from './runtime.js';

export class LocalUpdates {
  constructor(private root:string,private version:string,private history:HistoryClient,private runtime:LocalRuntime){}
  async check(){
    if(this.version==='0.0.0')return {status:'unavailable' as const};
    const channel=this.version.includes('-candidate.')?'test':'stable';
    const response=await this.history.request<{status:string;update?:unknown}>('/updates/check',undefined,undefined,
      {query:{version:this.version,platform:'win32-x64',channel}});
    if(response?.status!=='offered')return {status:response?.status??'unavailable'};
    try{return {status:'offered' as const,update:verifyUpdate(response.update)};}
    catch{throw new ApiError(503,'UPDATE_SIGNATURE_INVALID');}
  }
  private async download(update:SignedUpdate){
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
        response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(180000)});
        if([301,302,303,307,308].includes(response.status)){
          const location=response.headers.get('location');if(!location)throw new ApiError(503,'UPDATE_DOWNLOAD_REDIRECT');
          url=new URL(location,url);continue;
        }break;
      }
      if(!response?.ok||!response.body)throw new ApiError(503,'UPDATE_DOWNLOAD_FAILED');
      if(Number(response.headers.get('content-length')??0)>update.assetSize)throw new ApiError(503,'UPDATE_DOWNLOAD_SIZE');
      file=await open(part,'wx');const hash=createHash('sha256');let total=0;
      for await(const chunk of response.body){const bytes=Buffer.from(chunk);total+=bytes.length;
        if(total>update.assetSize)throw new ApiError(503,'UPDATE_DOWNLOAD_SIZE');hash.update(bytes);
        let offset=0;while(offset<bytes.length){const result=await file.write(bytes,offset,bytes.length-offset,null);offset+=result.bytesWritten;}
      }
      await file.sync();await file.close();file=undefined;
      if(total!==update.assetSize||hash.digest('hex')!==update.assetSha256)throw new ApiError(503,'UPDATE_DOWNLOAD_CHECKSUM');
      await rename(part,target);return target;
    }finally{await file?.close().catch(()=>{});await unlink(part).catch(()=>{});}
  }
  async prepare(input:{releaseId:string;assetSha256:string}){
    const first=await this.check();if(first.status!=='offered'||!('update' in first)||!first.update)throw new ApiError(409,'UPDATE_NOT_OFFERED');
    if(first.update.releaseId!==input.releaseId||first.update.assetSha256!==input.assetSha256)throw new ApiError(409,'UPDATE_CHANGED');
    const installer=await this.download(first.update);
    const latest=await this.check();if(latest.status!=='offered'||!('update' in latest)||!latest.update||latest.update.releaseId!==first.update.releaseId||latest.update.assetSha256!==first.update.assetSha256)
      throw new ApiError(409,'UPDATE_CHANGED');
    await this.runtime.drain();
    try{
      const child=spawn(installer,['--home',this.root,'--wait-for-stop','--restart'],{windowsHide:true,detached:true,stdio:'ignore'});
      await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);});
      child.unref();
      return {accepted:true,releaseId:first.update.releaseId};
    }catch{this.runtime.releaseDrain();throw new ApiError(503,'UPDATER_START_FAILED');}
  }
}
