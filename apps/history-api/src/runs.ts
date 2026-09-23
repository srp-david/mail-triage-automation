import {randomUUID,randomBytes} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from './db.js';
import {lock,member,sourceAccess,deviceAccess,digest,secretMatches} from './directory.js';
import {ApiError,runInput,leaseSchema,uuid,completionSchema,runFailureCode,type Principal,type RunInput} from '../../../packages/contracts/src/v1.js';
import {progressSchema} from '../../../src/progress.js';
import {SharedHistory} from './shared-history.js';
async function expire(c:PoolClient){
  await c.query(`UPDATE analysis_run r SET status=CASE WHEN v.cancel_requested_at IS NULL THEN 'failed' ELSE 'cancelled' END,error='LEASE_OR_QUEUE_EXPIRED',finished_at=now(),lease_until=NULL
    FROM v1_run v WHERE v.run_id=r.id AND ((r.status='running' AND (r.lease_until<=now() OR r.started_at<now()-interval '30 minutes')) OR (r.status='queued' AND r.created_at<now()-interval '24 hours'))`);
}
async function target(c:PoolClient,actor:Principal,runnerId:string,sourceId:string,agent:string,secret?:string){
  const r=await deviceAccess(c,actor,runnerId,secret);await sourceAccess(c,actor,sourceId,true);
  if(!r.agents.includes(agent)||!(await c.query('SELECT 1 FROM runner_source WHERE runner_id=$1 AND source_id=$2',[runnerId,sourceId])).rowCount)throw new ApiError(403,'RUNNER_SOURCE_DENIED');
  return r;
}
async function row(c:PoolClient,actor:Principal,id:string,write=false){
  const r=(await c.query(`SELECT r.*,v.*,m.mail_id,m.message_id,m.subject,m.handled_at,r.lease_until>now() AND r.started_at>now()-interval '30 minutes' AS valid
    FROM analysis_run r JOIN v1_run v ON v.run_id=r.id JOIN mail_identity m ON m.id=r.mail_key WHERE r.id=$1`,[id])).rows[0];
  if(!r)throw new ApiError(404,'RUN_NOT_FOUND');await sourceAccess(c,actor,r.source_id,write);return r;
}
async function owned(c:PoolClient,actor:Principal,id:string,input:unknown,device:string){
  const b=leaseSchema.parse(input),r=await row(c,actor,id,true);
  await target(c,actor,b.runnerId,r.source_id,r.agent,device);
  if(r.target_runner_id!==b.runnerId||r.generation!==b.generation||!secretMatches(r.owner_hash??'',digest(b.leaseToken)))throw new ApiError(409,'LEASE_CONFLICT');
  return r;
}
function active(r:any){if(r.status!=='running'||!r.valid)throw new ApiError(409,'LEASE_EXPIRED');}
export class Runs {
  async sweep(){return transaction(async c=>{await lock(c);await expire(c);});}
  async start(actor:Principal,input:RunInput){
    const b=runInput.parse(input),hash=digest(JSON.stringify(b));
    return transaction(async c=>{
      await lock(c);const s=await sourceAccess(c,actor,b.sourceId,true);
      await target(c,actor,b.runnerId,b.sourceId,b.agent);await expire(c);
      const prior=(await c.query('SELECT r.*,v.requested_by FROM analysis_run r JOIN v1_run v ON v.run_id=r.id WHERE request_id=$1',[b.requestId])).rows[0];
      if(prior){if(prior.request_hash!==hash||prior.requested_by!==actor.userId)throw new ApiError(409,'REQUEST_CONFLICT');return {id:prior.id,status:prior.status};}
      if(Math.abs(Date.now()-Date.parse(b.verifiedAt))>300000)throw new ApiError(400,'STALE_MAIL_PROOF');
      let mail=(await c.query('SELECT * FROM mail_identity WHERE store_id=$1 AND mail_id=$2',[s.store_id,b.mailId])).rows[0];
      if(mail&&mail.message_id!==b.messageId)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');
      if(mail?.handled_at)throw new ApiError(409,'MAIL_HANDLED');
      if(!mail)mail=(await c.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),s.store_id,b.mailId,b.messageId,b.subject])).rows[0];
      if(b.parentId){const parent=await row(c,actor,b.parentId,true);if(parent.mail_key!==mail.id)throw new ApiError(409,'PARENT_MISMATCH');if(parent.status==='needs_input'&&!b.answer?.trim())throw new ApiError(400,'ANSWER_REQUIRED');}
      const id=randomUUID();
      await c.query("INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status,parent_id,answer) VALUES($1,$2,'direct',$3,$4,'queued',$5,$6)",[id,mail.id,b.requestId,hash,b.parentId??null,b.answer??null]);
      await c.query('INSERT INTO v1_run(run_id,source_id,requested_by,target_runner_id,agent,executor_kind,verified_at,verified_by) VALUES($1,$2,$3,$4,$5,$6,$7,$4)',[id,b.sourceId,actor.userId,b.runnerId,b.agent,b.executorKind,b.verifiedAt]);
      return {id,status:'queued'};
    });
  }
  async get(actor:Principal,id:string){return new SharedHistory().get(actor,id);}
  async list(actor:Principal,sourceId:string,offset=0,mailId?:number,query=''){return new SharedHistory().list(actor,sourceId,offset,mailId,query);}
  async claim(actor:Principal,runnerId:string,requestId:string,device:string){return transaction(async c=>{
    await lock(c);const r=await deviceAccess(c,actor,runnerId,device);const m=await member(c,actor);await expire(c);
    let job=(await c.query(`SELECT a.*,v.* FROM v1_run v JOIN analysis_run a ON a.id=v.run_id WHERE v.claim_request_id=$1`,[requestId])).rows[0];
    if(job&&(job.target_runner_id!==runnerId||job.status!=='running'))throw new ApiError(409,'CLAIM_CONFLICT');
    if(!job){
      const count=(await c.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE v.target_runner_id=$1)::int AS owned
        FROM analysis_run a JOIN v1_run v ON v.run_id=a.id JOIN source s ON s.id=v.source_id WHERE a.status='running' AND s.team_id=$2`,[runnerId,m.team_id])).rows[0];
      if(count.owned||count.total>=2)return null;
      job=(await c.query(`SELECT a.*,v.* FROM analysis_run a JOIN v1_run v ON v.run_id=a.id JOIN source s ON s.id=v.source_id
        LEFT JOIN source_access acl ON acl.source_id=s.id AND acl.user_id=$2
        WHERE a.status='queued' AND v.target_runner_id=$1 AND s.active AND s.team_id=$3 AND (s.owner_user_id=$2 OR acl.can_write)
        ORDER BY a.created_at,a.id FOR UPDATE OF a SKIP LOCKED LIMIT 1`,[runnerId,actor.userId,m.team_id])).rows[0];
    }
    if(!job)return null;
    await target(c,actor,runnerId,job.source_id,job.agent,device);
    const token=randomBytes(32).toString('base64url');
    const updated=(await c.query(`UPDATE analysis_run SET status='running',started_at=coalesce(started_at,now()),heartbeat_at=now(),lease_until=LEAST(now()+interval '120 seconds',coalesce(started_at,now())+interval '30 minutes'),owner_hash=$2 WHERE id=$1 RETURNING lease_until`,[job.id,digest(token)])).rows[0];
    await c.query('UPDATE v1_run SET claim_request_id=$2,generation=generation+1 WHERE run_id=$1',[job.id,requestId]);
    await c.query('UPDATE runner SET seen_at=now() WHERE id=$1',[r.id]);
    return {id:job.id,runnerId,sourceId:job.source_id,agent:job.agent,leaseToken:token,generation:job.generation+1,leaseUntil:updated.lease_until};
  });}
  async heartbeat(actor:Principal,id:string,input:unknown,device:string){return transaction(async c=>{
    await lock(c);const r=await owned(c,actor,id,input,device);active(r);
    const saved=(await c.query("UPDATE analysis_run SET heartbeat_at=now(),lease_until=LEAST(now()+interval '120 seconds',started_at+interval '30 minutes') WHERE id=$1 RETURNING lease_until",[id])).rows[0];
    return {leaseUntil:saved.lease_until,cancelRequested:!!r.cancel_requested_at};
  });}
  async progress(actor:Principal,id:string,input:unknown,device:string){
    const b=leaseSchema.extend({event:progressSchema}).strict().parse(input);
    return transaction(async c=>{await lock(c);const r=await owned(c,actor,id,b,device);active(r);
      const events=[...r.progress_events,{...b.event,at:new Date().toISOString()}].slice(-20);
      await c.query('UPDATE analysis_run SET progress_events=$2 WHERE id=$1',[id,JSON.stringify(events)]);return {ok:true};
    });
  }
  async complete(actor:Principal,id:string,input:unknown,device:string){
    const b=completionSchema.parse(input),hash=digest(JSON.stringify(b.result));
    return transaction(async c=>{
      await lock(c);const r=await owned(c,actor,id,b,device);
      if(r.result_hash){if(r.result_hash!==hash||r.result_request_id!==b.requestId)throw new ApiError(409,'RESULT_CONFLICT');return {id,status:r.status};}
      active(r);if(r.cancel_requested_at)throw new ApiError(409,'CANCEL_REQUESTED');
      await c.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)',[id,JSON.stringify(b.result)]);
      await c.query('UPDATE v1_run SET result_hash=$2,result_request_id=$3 WHERE run_id=$1',[id,hash,b.requestId]);
      await c.query('UPDATE analysis_run SET status=$2,finished_at=now(),lease_until=NULL WHERE id=$1',[id,b.result.outcome]);return {id,status:b.result.outcome};
    });
  }
  async recover(actor:Principal,id:string,input:unknown,device:string){
    const b=completionSchema.extend({verifiedAt:z.string().datetime(),messageId:z.string().max(2000).nullable()}).strict().parse(input);
    return transaction(async c=>{await lock(c);const old=await owned(c,actor,id,b,device);
      const requestHash=digest(JSON.stringify({from:id,result:b.result,messageId:b.messageId}));
      const previous=(await c.query('SELECT r.id,r.status,r.request_hash,v.requested_by FROM analysis_run r JOIN v1_run v ON v.run_id=r.id WHERE r.request_id=$1',[b.requestId])).rows[0];
      if(previous){if(previous.request_hash!==requestHash||previous.requested_by!==actor.userId)throw new ApiError(409,'REQUEST_CONFLICT');return {id:previous.id,status:previous.status,recoveredFrom:id};}
      if(old.result_hash||old.status==='running'&&old.valid)throw new ApiError(409,'ORIGINAL_RUN_NOT_RECOVERABLE');
      if(Math.abs(Date.now()-Date.parse(b.verifiedAt))>300000||b.messageId!==old.message_id)throw new ApiError(409,'MAIL_REVALIDATION_REQUIRED');
      if(old.handled_at)throw new ApiError(409,'MAIL_HANDLED');await expire(c);
      if((await c.query("SELECT 1 FROM analysis_run WHERE mail_key=$1 AND status IN ('queued','running')",[old.mail_key])).rowCount)throw new ApiError(409,'RUN_ACTIVE');
      const nextId=randomUUID();
      await c.query(`INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status,parent_id,started_at,finished_at) VALUES($1,$2,'direct',$3,$4,$5,$6,now(),now())`,[nextId,old.mail_key,b.requestId,requestHash,b.result.outcome,id]);
      await c.query(`INSERT INTO v1_run(run_id,source_id,requested_by,target_runner_id,agent,executor_kind,verified_at,verified_by,result_hash,result_request_id) VALUES($1,$2,$3,$4,$5,'local',$6,$4,$7,$8)`,[nextId,old.source_id,actor.userId,b.runnerId,old.agent,b.verifiedAt,digest(JSON.stringify(b.result)),b.requestId]);
      await c.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)',[nextId,JSON.stringify(b.result)]);
      await c.query("INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,'run.recover',$2)",[actor.userId,nextId]);return {id:nextId,status:b.result.outcome,recoveredFrom:id};
    });
  }
  async cancel(actor:Principal,id:string){return transaction(async c=>{
    await lock(c);const r=await row(c,actor,id,true);
    if(!['queued','running'].includes(r.status))return {id,status:r.status};
    await c.query('UPDATE v1_run SET cancel_requested_at=coalesce(cancel_requested_at,now()) WHERE run_id=$1',[id]);
    if(r.status==='queued')await c.query("UPDATE analysis_run SET status='cancelled',finished_at=now() WHERE id=$1",[id]);return {id,cancelRequested:true};
  });}
  async fail(actor:Principal,id:string,input:unknown,device:string){
    const b=leaseSchema.extend({code:runFailureCode}).strict().parse(input);
    return transaction(async c=>{await lock(c);const r=await owned(c,actor,id,b,device);active(r);
      await c.query('UPDATE analysis_run SET status=$2,error=$3,finished_at=now(),lease_until=NULL WHERE id=$1',[id,b.code==='CANCELLED'?'cancelled':'failed',b.code]);return {ok:true};
    });
  }
}
