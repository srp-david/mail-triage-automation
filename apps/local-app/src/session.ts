import {z} from 'zod';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import type {NativeLogin} from './pkce.js';
import type {UsernameLogin} from './username-login.js';
export interface SessionStore {read(key:string):Promise<any>;write(key:string,value:unknown):Promise<void>}
const tokenSet=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),token_type:z.literal('Bearer'),expires_in:z.number().int().positive().max(2592000),subject:z.string().min(1)});
const saved=z.object({phase:z.literal('ready'),accessToken:z.string().min(1),refreshToken:z.string().min(1),expiresAt:z.number(),subject:z.string(),userId:z.string().uuid(),issuer:z.string(),clientId:z.string(),audience:z.string(),role:z.string().optional(),mustChangePassword:z.boolean().optional()});
type Saved=z.infer<typeof saved>;
export class LocalSession {
  private current?:Saved;
  private loaded=false;
  private chain:Promise<unknown>=Promise.resolve();
  private epoch=0;
  constructor(readonly login:NativeLogin|UsernameLogin,private store:SessionStore,private identify:(token:string)=>Promise<{userId:string;role?:string;mustChangePassword?:boolean}>,private now=Date.now,private refreshMode:'rotating'|'static'='rotating'){}
  get usernameMode(){return 'mode' in this.login&&this.login.mode==='username';}
  async credentials(input:unknown){
    if(!('credentials' in this.login))throw new ApiError(400,'USERNAME_LOGIN_REQUIRED');
    const login=this.login,epoch=++this.epoch;
    return this.serial(async()=>{
      await this.load();const old=this.current;this.current=undefined;await this.store.write('session',{phase:'signed_out'});
      if(old)await login.revoke(old.refreshToken).catch(()=>{});
      const tokens=tokenSet.parse(await login.credentials(input));
      if(epoch!==this.epoch){await login.revoke(tokens.refresh_token).catch(()=>{});throw new ApiError(401,'LOGIN_CANCELLED');}
      const actor=await this.identify(tokens.access_token);
      if(epoch!==this.epoch){await login.revoke(tokens.refresh_token).catch(()=>{});throw new ApiError(401,'LOGIN_CANCELLED');}
      const value:Saved={phase:'ready',accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:this.now()+tokens.expires_in*1000,subject:tokens.subject,...actor,issuer:login.issuer,clientId:login.clientId,audience:login.audience};
      await this.store.write('session',value);this.loaded=true;this.current=value;return {ok:true};
    });
  }
  async status(){const actor=await this.identify(await this.token());return actor;}
  async password(input:unknown){if(!('password' in this.login))throw new ApiError(400,'USERNAME_LOGIN_REQUIRED');const result=await this.login.password(await this.token(),input);await this.logout();return result;}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.chain.then(fn,fn);this.chain=next.catch(()=>{});return next;}
  private async load(){if(this.loaded)return;
    try{const value=saved.safeParse(await this.store.read('session'));if(value.success&&value.data.issuer===this.login.issuer&&value.data.clientId===this.login.clientId&&value.data.audience===this.login.audience)this.current=value.data;}
    catch(error:any){if(error?.code!=='ENOENT')throw new ApiError(503,'SESSION_STORE_UNAVAILABLE');}
    this.loaded=true;
  }
  begin(){this.epoch++;return this.login.begin();}
  async accept(url:URL){const epoch=this.epoch;return this.serial(async()=>{
    const tokens=tokenSet.parse(await this.login.callback(url));if(epoch!==this.epoch)throw new ApiError(401,'LOGIN_CANCELLED');
    const actor=await this.identify(tokens.access_token);if(epoch!==this.epoch)throw new ApiError(401,'LOGIN_CANCELLED');
    const value:Saved={phase:'ready',accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:this.now()+tokens.expires_in*1000,subject:tokens.subject,userId:actor.userId,issuer:this.login.issuer,clientId:this.login.clientId,audience:this.login.audience};
    await this.store.write('session',value);this.loaded=true;this.current=value;return {userId:value.userId};
  });}
  async token(){return this.serial(async()=>{
    await this.load();let current=this.current;if(!current)throw new ApiError(401,'LOGIN_REQUIRED');
    if(current.expiresAt>this.now()+60000)return current.accessToken;
    // Persist rotation intent before exchange. A crash/response loss forces login;
    // replaying the old refresh token could revoke its entire rotating family.
    this.current=undefined;await this.store.write('session',{phase:'renewing'});
    try{
      const response=await this.login.refresh(current.refreshToken,current.subject);
      const tokens=tokenSet.parse({...response,refresh_token:response.refresh_token??(this.refreshMode==='static'?current.refreshToken:undefined)});
      const actor=await this.identify(tokens.access_token);if(actor.userId!==current.userId)throw new Error('IDENTITY_CHANGED');
      current={...current,...actor,accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:this.now()+tokens.expires_in*1000};
      await this.store.write('session',current);this.current=current;return current.accessToken;
    }catch{throw new ApiError(401,'LOGIN_REQUIRED');}
  });}
  async identity(){await this.token();if(!this.current)throw new ApiError(401,'LOGIN_REQUIRED');return {userId:this.current.userId,...(this.usernameMode?{role:this.current.role,mustChangePassword:this.current.mustChangePassword}:{})};}
  async logout(){this.epoch++;this.login.cancel();return this.serial(async()=>{
    await this.load();const refresh=this.current?.refreshToken;this.current=undefined;
    await this.store.write('session',{phase:'signed_out'});
    let revoked=false;if(refresh)try{revoked=await this.login.revoke(refresh);}catch{}
    return {ok:true,providerRevoked:revoked};
  });}
}
