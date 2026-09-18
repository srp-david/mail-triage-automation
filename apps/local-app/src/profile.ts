import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError,uuid} from '../../../packages/contracts/src/v1.js';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import type {LocalSession,SessionStore} from './session.js';
import {mailSource} from './source-client.js';
import type {LocalUiContext} from './ui-routes.js';
const selection=z.object({sourceId:uuid.or(z.literal('')),collectionId:uuid.optional(),runnerId:uuid.optional(),agent:z.enum(['codex','claude'])}).strict();
export class LocalProfile implements LocalUiContext {
  private chain:Promise<unknown>=Promise.resolve();
  private instancePromise?:Promise<string>;
  constructor(private history:HistoryClient,private session:LocalSession,private store:SessionStore,private endpoint?:string){}
  private serial<T>(fn:()=>Promise<T>){const next=this.chain.then(fn,fn);this.chain=next.catch(()=>{});return next;}
  private async read(key:string,fallback:any){try{return await this.store.read(key);}catch(e:any){if(e?.code==='ENOENT')return fallback;throw new ApiError(503,'LOCAL_SETTINGS_UNAVAILABLE');}}
  private async profile(){const {userId}=await this.session.identity();return {userId,value:selection.parse(await this.read('profile-'+userId,{sourceId:'',agent:'codex'}))};}
  private instance(){return this.instancePromise??=(async()=>{let value=await this.read('source-instance',null);if(!value){value={id:randomUUID(),endpoint:this.endpoint};await this.store.write('source-instance',value);}if(value.endpoint!==this.endpoint)throw new ApiError(409,'SOURCE_CONFIGURATION_CHANGED');return uuid.parse(value.id);})().catch(error=>{this.instancePromise=undefined;throw error;});}
  async selection(){const {value}=await this.profile();
    if(!value.sourceId)return {...value,original:undefined};
    const sources=await this.history.request<any[]>('/sources'),source=sources!.find(s=>s.id===value.sourceId);
    if(!source)return {...value,sourceId:'',runnerId:undefined,original:undefined};
    const bound=this.endpoint&&source.instance_id===await this.instance();
    return {...value,original:bound?mailSource(this.endpoint!):undefined};
  }
  async configure(input:unknown){return this.serial(async()=>{
    const value=selection.parse(input),{userId}=await this.profile();
    const sources=await this.history.request<any[]>('/sources');if(value.sourceId&&!sources!.some(s=>s.id===value.sourceId))throw new ApiError(404,'SOURCE_NOT_FOUND');
    if(value.collectionId&&!(await this.history.request<any[]>('/collections'))!.some(c=>c.id===value.collectionId))throw new ApiError(404,'COLLECTION_NOT_FOUND');
    if(value.runnerId&&!(await this.history.request<any[]>('/runners'))!.some(r=>r.id===value.runnerId&&r.active&&r.agents.includes(value.agent)))throw new ApiError(403,'RUNNER_DENIED');
    await this.store.write('profile-'+userId,value);return {ok:true};
  });}
  async registerSource(input:unknown){return this.serial(async()=>{
    if(!this.endpoint)throw new ApiError(409,'LOCAL_MCP_NOT_CONFIGURED');const b=z.object({displayName:z.string().min(1).max(200)}).strict().parse(input);
    const result=await this.history.request('/sources',{...b,instanceId:await this.instance()});return result;
  });}
  async registerRunner(input:unknown){return this.serial(async()=>{
    const b=z.object({displayName:z.string().min(1).max(200),agents:z.array(z.enum(['codex','claude'])).min(1).max(2),sourceIds:z.array(uuid).min(1).max(30)}).strict().parse(input);
    const result=await this.history.request('/runners',{...b,requestId:randomUUID()});
    // Never return the device credential to browser storage or logs.
    try{await this.store.write('device-'+result.id,{id:result.id,credential:result.credential,userId:(await this.session.identity()).userId});}
    catch{await this.history.request('/runners/'+result.id+'/revoke',{}).catch(()=>{});throw new ApiError(503,'DEVICE_SAVE_FAILED');}
    return {id:result.id};
  });}
  async status(){const s=await this.selection();return {storeId:s.sourceId,originalAvailable:!!s.original,worker:{online:false,state:'stopped'},sync:s.sourceId?await this.history.request('/sources/'+s.sourceId+'/sync-latest'):null};}
}
