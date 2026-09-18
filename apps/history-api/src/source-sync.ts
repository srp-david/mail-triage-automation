import {randomUUID,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {transaction} from './db.js';
import {lock,sourceAccess,deviceAccess,digest,secretMatches} from './directory.js';
import {ApiError,uuid,leaseSchema,type Principal} from '../../../packages/contracts/src/v1.js';
import {syncResponse as responseSchema,retryableSyncCodes} from '../../../packages/contracts/src/sync.js';
async function expire(c:PoolClient){await c.query(`UPDATE sync_run s SET status='paused',uncertain=EXISTS(SELECT 1 FROM v1_sync_batch b WHERE b.sync_id=s.id AND b.result IS NULL),finished_at=now()
 FROM v1_sync v WHERE v.id=s.id AND s.status IN ('running','retrying') AND v.lease_until<=now()`);}
async function owned(c:PoolClient,actor:Principal,id:string,b:z.infer<typeof leaseSchema>,secret:string){
  const row=(await c.query('SELECT s.*,v.*,v.lease_until>now() AS valid FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE s.id=$1',[id])).rows[0];
  if(!row)throw new ApiError(404,'SYNC_NOT_FOUND');
  await sourceAccess(c,actor,row.source_id,true);await deviceAccess(c,actor,b.runnerId,secret);
  if(row.runner_id!==b.runnerId||row.generation!==b.generation||!secretMatches(row.owner_hash??'',digest(b.leaseToken)))throw new ApiError(409,'SYNC_LEASE_CONFLICT');return row;
}
export class SourceSync {
  async next(actor:Principal,runnerId:string,device:string){return transaction(async c=>{await lock(c);await deviceAccess(c,actor,runnerId,device);await expire(c);const r=(await c.query("SELECT s.id,v.source_id FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE v.runner_id=$1 AND s.status='queued' AND NOT v.stop_requested ORDER BY s.started_at,s.id LIMIT 1",[runnerId])).rows[0];if(r)await sourceAccess(c,actor,r.source_id,true);return r??null;});}
  async latest(actor:Principal,sourceId:string){return transaction(async c=>{await lock(c);await sourceAccess(c,actor,sourceId);return (await c.query('SELECT s.*,v.source_id,v.runner_id,v.stop_requested FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE v.source_id=$1 ORDER BY s.started_at DESC,s.id DESC LIMIT 1',[sourceId])).rows[0]??null;});}
  async sweep(){return transaction(async c=>{await lock(c);await expire(c);});}
  async start(actor:Principal,input:unknown){
    const b=z.object({sourceId:uuid,runnerId:uuid,requestId:uuid}).strict().parse(input),hash=digest(JSON.stringify(b));
    return transaction(async c=>{
      await lock(c);await sourceAccess(c,actor,b.sourceId,true);await deviceAccess(c,actor,b.runnerId);await expire(c);
      if(!(await c.query('SELECT 1 FROM runner_source WHERE runner_id=$1 AND source_id=$2',[b.runnerId,b.sourceId])).rowCount)throw new ApiError(403,'RUNNER_SOURCE_DENIED');
      const prior=(await c.query('SELECT * FROM v1_sync WHERE request_id=$1',[b.requestId])).rows[0];
      if(prior){if(prior.request_hash!==hash||prior.requested_by!==actor.userId)throw new ApiError(409,'REQUEST_CONFLICT');return {id:prior.id};}
      if((await c.query("SELECT 1 FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE v.source_id=$1 AND s.status IN ('queued','running','retrying')",[b.sourceId])).rowCount)throw new ApiError(409,'SYNC_BUSY');
      const id=randomUUID();await c.query("INSERT INTO sync_run(id,status) VALUES($1,'queued')",[id]);await c.query('INSERT INTO v1_sync(id,source_id,runner_id,requested_by,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6)',[id,b.sourceId,b.runnerId,actor.userId,b.requestId,hash]);return {id};
    });
  }
  async get(actor:Principal,id:string){return transaction(async c=>{
    const r=(await c.query('SELECT s.*,v.source_id,v.runner_id,v.stop_requested FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE s.id=$1',[id])).rows[0];
    if(!r)throw new ApiError(404,'SYNC_NOT_FOUND');await sourceAccess(c,actor,r.source_id);return r;
  });}
  async claim(actor:Principal,id:string,requestId:string,device:string){return transaction(async c=>{
    await lock(c);await expire(c);
    const r=(await c.query('SELECT s.status,v.* FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE s.id=$1',[id])).rows[0];
    if(!r)throw new ApiError(404,'SYNC_NOT_FOUND');await sourceAccess(c,actor,r.source_id,true);await deviceAccess(c,actor,r.runner_id,device);
    if(r.stop_requested||r.status!=='queued'&&!(r.status==='running'&&r.claim_request_id===requestId))throw new ApiError(409,'SYNC_CLAIM_CONFLICT');
    const token=randomBytes(32).toString('base64url');
    await c.query("UPDATE sync_run SET status='running' WHERE id=$1",[id]);
    const lease=(await c.query("UPDATE v1_sync SET generation=generation+1,owner_hash=$2,claim_request_id=$3,lease_until=now()+interval '120 seconds' WHERE id=$1 RETURNING generation,lease_until",[id,digest(token),requestId])).rows[0];
    return {id,runnerId:r.runner_id,leaseToken:token,generation:lease.generation,leaseUntil:lease.lease_until};
  });}
  async heartbeat(actor:Principal,id:string,input:unknown,device:string){return transaction(async c=>{
    await lock(c);const r=await owned(c,actor,id,leaseSchema.parse(input),device);if(!r.valid||!['running','retrying'].includes(r.status))throw new ApiError(409,'SYNC_EXPIRED');
    const lease=(await c.query("UPDATE v1_sync SET lease_until=now()+interval '120 seconds' WHERE id=$1 RETURNING lease_until",[id])).rows[0];
    if(r.stop_requested&&!(await c.query('SELECT 1 FROM v1_sync_batch WHERE sync_id=$1 AND result IS NULL',[id])).rowCount)await c.query("UPDATE sync_run SET status='paused',finished_at=now() WHERE id=$1",[id]);
    return {leaseUntil:lease.lease_until,stopRequested:r.stop_requested,nextAttemptAt:r.next_attempt_at};
  });}
  async beginBatch(actor:Principal,id:string,input:unknown,device:string){
    const b=leaseSchema.extend({batchId:uuid}).strict().parse(input);
    return transaction(async c=>{
      await lock(c);const r=await owned(c,actor,id,b,device);
      if(!r.valid||!['running','retrying'].includes(r.status)||r.stop_requested)throw new ApiError(409,'SYNC_STOPPED');
      if(r.next_attempt_at&&new Date(r.next_attempt_at).getTime()>Date.now())throw new ApiError(409,'RETRY_NOT_DUE');
      if((await c.query('SELECT 1 FROM v1_sync_batch WHERE sync_id=$1 AND result IS NULL',[id])).rowCount)throw new ApiError(409,'BATCH_OUTCOME_UNCERTAIN');
      await c.query('INSERT INTO v1_sync_batch(id,sync_id) VALUES($1,$2)',[b.batchId,id]);return {ok:true};
    });
  }
  async batch(actor:Principal,id:string,input:unknown,device:string){
    const b=leaseSchema.extend({batchId:uuid,response:responseSchema}).strict().parse(input);
    return transaction(async c=>{
      await lock(c);const r=await owned(c,actor,id,b,device);
      const prior=(await c.query('SELECT * FROM v1_sync_batch WHERE id=$1 AND sync_id=$2',[b.batchId,id])).rows[0];
      if(!prior)throw new ApiError(409,'BATCH_NOT_STARTED');
      if(prior.result){if(JSON.stringify(responseSchema.parse(prior.result))!==JSON.stringify(b.response))throw new ApiError(409,'BATCH_CONFLICT');return {status:r.status,nextAttemptAt:r.next_attempt_at};}
      if(!r.valid||!['running','retrying'].includes(r.status))throw new ApiError(409,'SYNC_EXPIRED');
      const x=b.response;
      // Without per-message receipt IDs, a partially processed batch must not be
      // retried automatically: failed counts and side effects could be repeated.
      const canRetry=x.saved===0&&x.failed===0&&x.errors.length>0&&x.errors.every(code=>retryableSyncCodes.has(code))&&r.retry_count<3;
      const status=r.stop_requested?'paused':canRetry?'retrying':x.status==='error'||x.failed||x.errors.length?'failed':x.remaining===0?'completed':x.remaining!==null&&x.saved>0?'running':'paused';
      // Store counts and error category only, never MCP error text containing customer data.
      await c.query('UPDATE v1_sync_batch SET result=$2,finished_at=now() WHERE id=$1',[b.batchId,JSON.stringify(x)]);
      const updated=(await c.query(`UPDATE sync_run SET saved=saved+$2,failed=failed+$3,remaining=$4,batch_count=batch_count+1,status=$5,
        retry_count=CASE WHEN $5='retrying' THEN retry_count+1 WHEN $5='running' THEN 0 ELSE retry_count END,
        next_attempt_at=CASE WHEN $5='retrying' THEN now()+$6*interval '1 second' ELSE NULL END,
        finished_at=CASE WHEN $5 IN ('running','retrying') THEN NULL ELSE now() END WHERE id=$1 RETURNING next_attempt_at`,[id,x.saved,x.failed,x.remaining,status,[5,15,30][r.retry_count]??30])).rows[0];return {status,nextAttemptAt:updated.next_attempt_at};
    });
  }
  async stop(actor:Principal,id:string){return transaction(async c=>{
    await lock(c);const r=(await c.query('SELECT s.status,v.* FROM sync_run s JOIN v1_sync v ON v.id=s.id WHERE s.id=$1',[id])).rows[0];
    if(!r)throw new ApiError(404,'SYNC_NOT_FOUND');await sourceAccess(c,actor,r.source_id,true);
    await c.query('UPDATE v1_sync SET stop_requested=true WHERE id=$1',[id]);if(r.status==='queued')await c.query("UPDATE sync_run SET status='paused',finished_at=now() WHERE id=$1",[id]);return {ok:true};
  });}
}
