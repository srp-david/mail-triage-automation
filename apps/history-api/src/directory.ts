import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from './db.js';
import type {VerifiedIdentity} from './auth.js';
import {ApiError,uuid,type Principal} from '../../../packages/contracts/src/v1.js';
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const secretMatches=(a:string,b:string)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
export async function lock(c:PoolClient){await c.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':v1-write',0))");}
export async function lockShared(c:PoolClient){await c.query("SELECT pg_advisory_xact_lock_shared(hashtextextended(current_schema()||':v1-write',0))");}
export async function member(c:PoolClient,actor:Principal){
  if(actor.sessionId&&!(await c.query('SELECT 1 FROM auth_session s JOIN user_credential uc ON uc.user_id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT s.restricted AND NOT uc.must_change',[actor.sessionId,actor.userId])).rowCount)throw new ApiError(401,'SESSION_REVOKED');
  const rows=(await c.query('SELECT m.* FROM membership m JOIN app_user u ON u.id=m.user_id WHERE u.id=$1 AND u.active AND m.active',[actor.userId])).rows;
  if(rows.length>1)throw new ApiError(403,'AMBIGUOUS_MEMBERSHIP');const row=rows[0];
  if(!row)throw new ApiError(403,'MEMBERSHIP_DISABLED');return row;
}
export async function sourceAccess(c:PoolClient,actor:Principal,id:string,write=false){
  const m=await member(c,actor);
  const s=(await c.query(`SELECT s.*,a.can_write FROM source s LEFT JOIN source_access a ON a.source_id=s.id AND a.user_id=$2
    WHERE s.id=$1 AND s.active AND s.team_id=$3 AND (s.owner_user_id=$2 OR a.user_id IS NOT NULL)`,[id,actor.userId,m.team_id])).rows[0];
  if(!s||write&&(m.role==='viewer'||s.owner_user_id!==actor.userId&&!s.can_write))throw new ApiError(404,'SOURCE_NOT_FOUND');return s;
}
export async function deviceAccess(c:PoolClient,actor:Principal,id:string,secret?:string){
  await member(c,actor);
  const r=(await c.query('SELECT * FROM runner WHERE id=$1 AND owner_user_id=$2 AND active',[id,actor.userId])).rows[0];
  if(!r||secret!==undefined&&!secretMatches(r.credential_hash,digest(secret)))throw new ApiError(403,'RUNNER_DENIED');return r;
}
export class Directory {
  constructor(readonly teamId:string,readonly adminSubject?:string){}
  async members(actor:Principal){return transaction(async c=>{await lockShared(c);const m=await member(c,actor);return (await c.query('SELECT u.id,u.email,u.username,u.display_name,m.role FROM app_user u JOIN membership m ON m.user_id=u.id WHERE m.team_id=$1 AND m.active AND u.active ORDER BY coalesce(u.username,u.email),u.id',[m.team_id])).rows;});}
  async runners(actor:Principal){return transaction(async c=>{await lockShared(c);await member(c,actor);return (await c.query('SELECT id,display_name,agents,active,seen_at FROM runner WHERE owner_user_id=$1 ORDER BY created_at,id',[actor.userId])).rows;});}
  async login(identity:VerifiedIdentity):Promise<Principal>{
    // Legacy fixture support only. Production entrypoints exclusively use UsernameAuth.
    if(process.env.NODE_ENV!=='test')throw new ApiError(401,'LEGACY_AUTH_DISABLED');
    return transaction(async c=>{
      await lock(c);
      let user=(await c.query('SELECT * FROM app_user WHERE issuer=$1 AND subject=$2',[identity.issuer,identity.subject])).rows[0];
      if(!user){
        user=(await c.query('INSERT INTO app_user(id,issuer,subject,email) VALUES($1,$2,$3,$4) RETURNING *',[randomUUID(),identity.issuer,identity.subject,identity.email])).rows[0];
        await c.query('INSERT INTO membership(user_id,team_id,role) VALUES($1,$2,$3)',[user.id,this.teamId,identity.subject===this.adminSubject?'admin':'analyst']);
      }
      const actor={userId:user.id};await member(c,actor);return actor;
    });
  }
  async sources(actor:Principal){return transaction(async c=>{
    const m=await member(c,actor);
    return (await c.query(`SELECT s.id,s.display_name,s.instance_id,s.owner_user_id FROM source s
      LEFT JOIN source_access a ON a.source_id=s.id AND a.user_id=$1
      WHERE s.team_id=$2 AND s.active AND (s.owner_user_id=$1 OR a.user_id IS NOT NULL)`,[actor.userId,m.team_id])).rows;
  });}
  async registerSource(actor:Principal,input:unknown){
    const b=z.object({instanceId:uuid,displayName:z.string().min(1).max(200)}).strict().parse(input);
    return transaction(async c=>{
      await lock(c);const m=await member(c,actor);if(m.role==='viewer')throw new ApiError(403,'WRITE_DENIED');
      const existing=(await c.query('SELECT * FROM source WHERE instance_id=$1',[b.instanceId])).rows[0];
      if(existing){await sourceAccess(c,actor,existing.id,true);return {id:existing.id};}
      const id=randomUUID();await c.query('INSERT INTO source(id,team_id,owner_user_id,instance_id,display_name,store_id) VALUES($1,$2,$3,$4,$5,$6)',[id,m.team_id,actor.userId,b.instanceId,b.displayName,id]);return {id};
    });
  }
  async grant(actor:Principal,sourceId:string,input:unknown){
    const b=z.object({userId:uuid,permission:z.enum(['read','write','none'])}).strict().parse(input);
    return transaction(async c=>{
      await lock(c);const s=await sourceAccess(c,actor,sourceId,true);
      if(s.owner_user_id!==actor.userId)throw new ApiError(403,'OWNER_REQUIRED');
      const target=await member(c,{userId:b.userId});if(target.team_id!==s.team_id)throw new ApiError(403,'TEAM_MISMATCH');
      if(b.permission==='none')await c.query('DELETE FROM source_access WHERE source_id=$1 AND user_id=$2',[sourceId,b.userId]);
      else await c.query('INSERT INTO source_access VALUES($1,$2,$3) ON CONFLICT(source_id,user_id) DO UPDATE SET can_write=$3',[sourceId,b.userId,b.permission==='write']);
      await c.query("INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,'source.grant',$2)",[actor.userId,sourceId]);return {ok:true};
    });
  }
  async registerRunner(actor:Principal,input:unknown){
    const b=z.object({requestId:uuid,displayName:z.string().min(1).max(200),agents:z.array(z.enum(['codex','claude'])).min(1).max(2),sourceIds:z.array(uuid).min(1).max(30)}).strict().parse(input);
    return transaction(async c=>{
      await lock(c);for(const id of b.sourceIds)await sourceAccess(c,actor,id,true);
      // An uncertain registration is not silently retried with a lost device secret.
      if((await c.query('SELECT 1 FROM runner WHERE request_id=$1',[b.requestId])).rowCount)throw new ApiError(409,'REGISTRATION_ALREADY_EXISTS');
      const id=randomUUID(),credential=randomBytes(32).toString('base64url');
      await c.query('INSERT INTO runner(id,owner_user_id,credential_hash,request_id,display_name,agents) VALUES($1,$2,$3,$4,$5,$6)',[id,actor.userId,digest(credential),b.requestId,b.displayName,JSON.stringify(b.agents)]);
      for(const sid of new Set(b.sourceIds))await c.query('INSERT INTO runner_source VALUES($1,$2)',[id,sid]);
      return {id,credential};
    });
  }
  async revoke(actor:Principal,id:string){return transaction(async c=>{
    await lock(c);await deviceAccess(c,actor,id);await c.query('UPDATE runner SET active=false WHERE id=$1',[id]);return {ok:true};
  });}
  async disable(actor:Principal,id:string){return transaction(async c=>{
    await lock(c);const m=await member(c,actor),target=await member(c,{userId:id});
    if(m.role!=='admin'||m.team_id!==target.team_id||actor.userId===id)throw new ApiError(403,'ADMIN_REQUIRED');
    await c.query('UPDATE app_user SET active=false WHERE id=$1',[id]);
    await c.query('UPDATE auth_session SET revoked_at=now() WHERE user_id=$1',[id]);
    await c.query("INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,'admin.user_disabled',$2)",[actor.userId,id]);return {ok:true};
  });}
}
