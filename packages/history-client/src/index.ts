import {ApiError,contractVersion,uuid,type RunInput,type Lease} from '../../contracts/src/v1.js';
import {historyBase} from './url.js';
export class HistoryClient {
  constructor(readonly baseUrl:string,private token:()=>Promise<string>,private transport:typeof fetch=fetch){
    historyBase(baseUrl);
  }
  async request<T=any>(path:string,body?:unknown,device?:string,options?:{query?:Record<string,string>;text?:boolean;signal?:AbortSignal}):Promise<T|null>{
    if(!/^\/[a-z0-9/?=&_-]*$/i.test(path))throw new Error('Invalid API path');
    const url=new URL(historyBase(this.baseUrl)+'/api/v1'+path);if(options?.query)url.search=new URLSearchParams(options.query).toString();
    const response=await this.transport(url,{
      method:body===undefined?'GET':'POST',redirect:'error',signal:options?.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),
      headers:{authorization:'Bearer '+await this.token(),'content-type':'application/json','x-contract-version':contractVersion,...(device?{'x-device-credential':device}:{})},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    if(!response.ok){
      const data=await response.json().catch(()=>({})),upstream=uuid.safeParse(response.headers.get('x-request-id'));
      throw new ApiError(response.status,data?.code??'REQUEST_FAILED',upstream.success?upstream.data:undefined);
    }
    return response.status===204?null:options?.text?await response.text() as T:await response.json();
  }
  start(input:RunInput){return this.request('/runs',input);}
  get(id:string){return this.request('/runs/'+uuid.parse(id));}
  complete(id:string,lease:Lease,requestId:string,result:unknown,device:string){
    return this.request('/runs/'+uuid.parse(id)+'/result',{...lease,requestId,result},device);
  }
}
