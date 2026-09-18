import {ApiError,contractVersion,uuid,type RunInput,type Lease} from '../../contracts/src/v1.js';
export class HistoryClient {
  constructor(readonly baseUrl:string,private token:()=>Promise<string>,private transport:typeof fetch=fetch){
    const url=new URL(baseUrl);
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
      (url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new Error('HTTPS API URL required');
  }
  async request<T=any>(path:string,body?:unknown,device?:string):Promise<T|null>{
    if(!/^\/[a-z0-9/?=&_-]*$/i.test(path))throw new Error('Invalid API path');
    const response=await this.transport(new URL('/api/v1'+path,this.baseUrl),{
      method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{authorization:'Bearer '+await this.token(),'content-type':'application/json','x-contract-version':contractVersion,...(device?{'x-device-credential':device}:{})},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new ApiError(response.status,data.code??'REQUEST_FAILED');}
    return response.status===204?null:await response.json();
  }
  start(input:RunInput){return this.request('/runs',input);}
  get(id:string){return this.request('/runs/'+uuid.parse(id));}
  complete(id:string,lease:Lease,requestId:string,result:unknown,device:string){
    return this.request('/runs/'+uuid.parse(id)+'/result',{...lease,requestId,result},device);
  }
}
