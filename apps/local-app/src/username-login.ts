import {historyBase} from '../../../packages/history-client/src/url.js';
import {ApiError,contractVersion} from '../../../packages/contracts/src/v1.js';
export class UsernameLogin {
  readonly mode='username';readonly clientId:string;
  constructor(readonly baseUrl:string,readonly issuer:string,readonly audience:string,private transport:typeof fetch=fetch){
    this.clientId=historyBase(baseUrl);if(new URL(issuer).protocol!=='https:')throw new Error('INVALID_AUTH_SETTINGS');
  }
  async request(path:string,body?:unknown,token?:string){
    const res=await this.transport(this.clientId+'/auth/'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','x-contract-version':contractVersion,...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const value=await res.json().catch(()=>({}));if(!res.ok)throw new ApiError(res.status,value.code??'AUTH_FAILED');return value;
  }
  credentials(input:unknown){return this.request('login',input);}
  identify(token:string){return this.request('me',undefined,token);}
  password(token:string,input:unknown){return this.request('password',input,token);}
  refresh(refreshToken:string,_subject:string){return this.request('refresh',{refresh_token:refreshToken});}
  async revoke(refreshToken:string){await this.request('logout',{refresh_token:refreshToken});return true;}
  begin():string{throw new ApiError(400,'USERNAME_LOGIN_REQUIRED');}
  async callback(_url:URL):Promise<any>{throw new ApiError(401,'LEGACY_AUTH_DISABLED');}
  cancel(){}
}
