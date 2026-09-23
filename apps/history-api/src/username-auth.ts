import {randomUUID,randomBytes} from 'node:crypto';
import {SignJWT,jwtVerify,importJWK,type JWK} from 'jose';
import {z} from 'zod';
import {transaction} from './db.js';
import {lock,digest,member} from './directory.js';
import {hashPassword,verifyPassword,username,temporaryPassword,checkPassword} from './password.js';
import {ApiError,type Principal,uuid} from '../../../packages/contracts/src/v1.js';
import type {PoolClient} from 'pg';
const role=z.enum(['admin','analyst','viewer']);
const denied=()=>new ApiError(401,'LOGIN_DENIED');
export function parseSigningKey(value:string){try{return JSON.parse(value) as JWK;}catch{throw new Error('SIGNING_KEY_INVALID');}}
const audit=(c:PoolClient,actor:string|null,action:string,target:string|null)=>c.query('INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,$2,$3)',[actor,action,target]);
export class UsernameAuth {
  private constructor(readonly issuer:string,readonly audience:string,readonly teamId:string,private privateKey:CryptoKey|Uint8Array,private publicKey:CryptoKey|Uint8Array,private dummyHash:string){}
  static async create(issuer:string,audience:string,teamId:string,jwk:JWK){
    if(new URL(issuer).protocol!=='https:'||!audience||!jwk.d||jwk.kty!=='EC'||jwk.crv!=='P-256')throw new Error('INVALID_AUTH_SETTINGS');
    uuid.parse(teamId);const {d,...pub}=jwk;
    return new UsernameAuth(issuer,audience,teamId,await importJWK(jwk,'ES256'),await importJWK(pub,'ES256'),await hashPassword(temporaryPassword()));
  }
  private async tokens(c:PoolClient,userId:string,sessionId:string,restricted:boolean){
    const refresh=randomBytes(32).toString('base64url');
    await c.query('INSERT INTO refresh_token(token_hash,session_id) VALUES($1,$2)',[digest(refresh),sessionId]);
    const access=await new SignJWT({sid:sessionId}).setProtectedHeader({alg:'ES256',typ:'JWT'}).setIssuer(this.issuer).setAudience(this.audience).setSubject(userId).setIssuedAt().setExpirationTime('5m').sign(this.privateKey);
    return {access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:300,subject:userId,mustChangePassword:restricted};
  }
  private async session(c:PoolClient,userId:string,restricted:boolean){
    const id=randomUUID();await c.query("INSERT INTO auth_session(id,user_id,restricted,expires_at) VALUES($1,$2,$3,now()+CASE WHEN $3 THEN interval '10 minutes' ELSE interval '30 days' END)",[id,userId,restricted]);
    return this.tokens(c,userId,id,restricted);
  }
  private async throttle(name:string){
    const ok=await transaction(async c=>{
      await lock(c);
      await c.query("DELETE FROM auth_throttle WHERE window_start<now()-interval '15 minutes'");
      for(const [bucket,max] of [['global',300],['name:'+digest(name),10]] as const){
        const r=(await c.query('INSERT INTO auth_throttle VALUES($1,1,now()) ON CONFLICT(bucket) DO UPDATE SET attempts=auth_throttle.attempts+1 RETURNING attempts',[bucket])).rows[0];
        if(r.attempts>max)return false;
      }return true;
    });if(!ok)throw new ApiError(429,'LOGIN_RATE_LIMIT');
  }
  async login(input:unknown){
    const b=z.object({username:z.string().max(128),password:z.string().max(128)}).strict().parse(input);
    let name:string;try{name=username(b.username);}catch{name='!invalid';}
    await this.throttle(name);
    const row=await transaction(async c=>(await c.query('SELECT u.id,u.active,c.* FROM app_user u JOIN user_credential c ON c.user_id=u.id WHERE u.username=$1',[name])).rows[0]);
    const valid=await verifyPassword(b.password,row?.password_hash??this.dummyHash);
    const result=await transaction(async c=>{
      await lock(c);
      const fresh=row&&(await c.query('SELECT u.active,c.*,c.temporary_until>now() AS temporary_valid FROM app_user u JOIN user_credential c ON c.user_id=u.id WHERE u.id=$1',[row.id])).rows[0];
      if(!valid||!fresh?.active||fresh.password_hash!==row.password_hash||fresh.must_change&&!fresh.temporary_valid){await audit(c,row?.id??null,'auth.login_denied',null);return null;}
      await member(c,{userId:row.id});await audit(c,row.id,'auth.login',row.id);
      return this.session(c,row.id,fresh.must_change);
    });if(!result)throw denied();return result;
  }
  async authenticate(token:string,allowRestricted=false):Promise<Principal & {role:string;mustChangePassword:boolean}>{
    let userId:string,sessionId:string;
    try{const {payload}=await jwtVerify(token,this.publicKey,{algorithms:['ES256'],issuer:this.issuer,audience:this.audience,requiredClaims:['sub','sid','exp','iat'],maxTokenAge:'5m'});userId=uuid.parse(payload.sub);sessionId=uuid.parse(payload.sid);}catch{throw denied();}
    return transaction(async c=>{
      await lock(c);
      const s=(await c.query('SELECT * FROM auth_session WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',[sessionId,userId])).rows[0];
      if(!s)throw denied();const m=await member(c,{userId});
      if(s.restricted&&!allowRestricted)throw new ApiError(403,'PASSWORD_CHANGE_REQUIRED');
      return {userId,sessionId,role:m.role,mustChangePassword:s.restricted};
    });
  }
  async refresh(input:unknown){
    const token=z.object({refresh_token:z.string().min(32).max(200)}).strict().parse(input).refresh_token;
    const result=await transaction(async c=>{
      await lock(c);
      const r=(await c.query('SELECT t.*,s.user_id,s.restricted,s.revoked_at,s.expires_at>now() AS valid FROM refresh_token t JOIN auth_session s ON s.id=t.session_id WHERE token_hash=$1',[digest(token)])).rows[0];
      if(!r)return null;
      if(r.used_at){await c.query('UPDATE auth_session SET revoked_at=now() WHERE id=$1',[r.session_id]);await audit(c,r.user_id,'auth.refresh_reuse',r.session_id);return null;}
      if(!r.valid||r.revoked_at)return null;
      await member(c,{userId:r.user_id});
      await c.query('UPDATE refresh_token SET used_at=now() WHERE token_hash=$1',[digest(token)]);
      return this.tokens(c,r.user_id,r.session_id,r.restricted);
    });if(!result)throw denied();return result;
  }
  async logout(input:unknown){
    const token=z.object({refresh_token:z.string().min(32).max(200)}).strict().parse(input).refresh_token;
    return transaction(async c=>{await lock(c);const rows=(await c.query('UPDATE auth_session SET revoked_at=now() WHERE revoked_at IS NULL AND id IN(SELECT session_id FROM refresh_token WHERE token_hash=$1) RETURNING id,user_id',[digest(token)])).rows;for(const r of rows)await audit(c,r.user_id,'auth.logout',r.id);return {ok:true};});
  }
  async changePassword(actor:Principal,input:unknown){
    await this.throttle('password:'+actor.userId);
    const b=z.object({currentPassword:z.string().max(128),newPassword:z.string().max(128)}).strict().parse(input);checkPassword(b.newPassword);
    const old=await transaction(async c=>(await c.query('SELECT password_hash FROM user_credential WHERE user_id=$1',[actor.userId])).rows[0]);
    if(!old||!await verifyPassword(b.currentPassword,old.password_hash))throw denied();
    if(b.currentPassword===b.newPassword)throw new ApiError(400,'PASSWORD_UNCHANGED');
    const hash=await hashPassword(b.newPassword);
    return transaction(async c=>{
      await lock(c);await this.checkSession(c,actor);
      const changed=await c.query('UPDATE user_credential SET password_hash=$2,must_change=false,temporary_until=NULL,changed_at=now() WHERE user_id=$1 AND password_hash=$3',[actor.userId,hash,old.password_hash]);
      if(!changed.rowCount)throw denied();
      await c.query('UPDATE auth_session SET revoked_at=now() WHERE user_id=$1',[actor.userId]);await audit(c,actor.userId,'auth.password_changed',actor.userId);
      return {ok:true,loginRequired:true};
    });
  }
  private async checkSession(c:PoolClient,actor:Principal){
    if(!actor.sessionId||!(await c.query('SELECT 1 FROM auth_session WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',[actor.sessionId,actor.userId])).rowCount)throw denied();
    return member(c,{userId:actor.userId});
  }
  private async admin(c:PoolClient,actor:Principal){const m=await member(c,actor);if(m.role!=='admin'||m.team_id!==this.teamId)throw new ApiError(403,'ADMIN_REQUIRED');}
  async users(actor:Principal){return transaction(async c=>{await lock(c);await this.admin(c,actor);return (await c.query('SELECT u.id,u.username,u.display_name,u.active,m.role,c.must_change FROM app_user u JOIN membership m ON m.user_id=u.id LEFT JOIN user_credential c ON c.user_id=u.id WHERE m.team_id=$1 ORDER BY u.username NULLS LAST,u.id',[this.teamId])).rows;});}
  async createUser(actor:Principal|null,input:unknown){
    const b=z.object({username:z.string(),displayName:z.string().min(1).max(100),role}).strict().parse(input),name=username(b.username);
    const password=temporaryPassword(),hash=await hashPassword(password);
    return transaction(async c=>{
      await lock(c);
      if(actor)await this.admin(c,actor);
      else if((await c.query("SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.team_id=$1 AND m.role='admin' AND m.active AND u.active",[this.teamId])).rowCount)throw new ApiError(409,'BOOTSTRAP_ALREADY_DONE');
      if(!actor&&b.role!=='admin')throw new ApiError(400,'BOOTSTRAP_ADMIN_REQUIRED');
      if((await c.query('SELECT 1 FROM app_user WHERE username=$1',[name])).rowCount)throw new ApiError(409,'USERNAME_EXISTS');
      const id=randomUUID();await c.query('INSERT INTO app_user(id,username,display_name) VALUES($1,$2,$3)',[id,name,b.displayName]);
      await c.query('INSERT INTO membership(user_id,team_id,role) VALUES($1,$2,$3)',[id,this.teamId,b.role]);
      await c.query("INSERT INTO user_credential(user_id,password_hash,temporary_until) VALUES($1,$2,now()+interval '24 hours')",[id,hash]);
      await audit(c,actor?.userId??null,actor?'admin.user_created':'operator.bootstrap',id);
      return {id,username:name,temporaryPassword:password};
    });
  }
  async updateUser(actor:Principal,id:string,input:unknown){
    uuid.parse(id);const b=z.object({displayName:z.string().min(1).max(100),role,active:z.boolean()}).strict().parse(input);
    return transaction(async c=>{
      await lock(c);await this.admin(c,actor);
      const target=(await c.query('SELECT u.active,m.role FROM app_user u JOIN membership m ON m.user_id=u.id WHERE u.id=$1 AND m.team_id=$2',[id,this.teamId])).rows[0];
      if(!target)throw new ApiError(404,'USER_NOT_FOUND');
      if(target.active&&target.role==='admin'&&(!b.active||b.role!=='admin')){
        const count=(await c.query("SELECT count(*)::int AS n FROM app_user u JOIN membership m ON m.user_id=u.id WHERE m.team_id=$1 AND m.role='admin' AND m.active AND u.active",[this.teamId])).rows[0].n;
        if(count<=1)throw new ApiError(409,'LAST_ADMIN');
      }
      await c.query('UPDATE app_user SET display_name=$2,active=$3 WHERE id=$1',[id,b.displayName,b.active]);
      await c.query('UPDATE membership SET role=$2 WHERE user_id=$1 AND team_id=$3',[id,b.role,this.teamId]);
      await c.query('UPDATE auth_session SET revoked_at=now() WHERE user_id=$1',[id]);await audit(c,actor.userId,'admin.user_updated',id);return {ok:true};
    });
  }
  async resetPassword(actor:Principal,id:string){
    uuid.parse(id);const password=temporaryPassword(),hash=await hashPassword(password);
    return transaction(async c=>{await lock(c);await this.admin(c,actor);
      if(!(await c.query('SELECT 1 FROM membership WHERE user_id=$1 AND team_id=$2',[id,this.teamId])).rowCount)throw new ApiError(404,'USER_NOT_FOUND');
      const r=await c.query("UPDATE user_credential SET password_hash=$2,must_change=true,temporary_until=now()+interval '24 hours',changed_at=now() WHERE user_id=$1",[id,hash]);
      if(!r.rowCount)throw new ApiError(409,'EXPLICIT_MAPPING_REQUIRED');
      await c.query('UPDATE auth_session SET revoked_at=now() WHERE user_id=$1',[id]);await audit(c,actor.userId,'admin.password_reset',id);return {temporaryPassword:password};
    });
  }
}
