import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { callSync } from './mcp.js';
import { HttpError } from './config.js';

const activeStatuses=['running','retrying','stopping'];
const retryDelays=[5,15,30];
const transientCodes=new Set(['SYNC_TIMEOUT','POP3_TIMEOUT','POP3_FAILED','SYNC_IN_PROGRESS','SERVER_STOPPING','MESSAGE_RETRIEVAL_FAILED','MCP_UNAVAILABLE']);
const count=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
function codes(result:any):string[]{
  return Array.isArray(result?.errors)?result.errors.map((e:any)=>typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{0,59}$/.test(e.code)?e.code:'UNKNOWN_ERROR'):['INVALID_RESPONSE'];
}
function validCounts(r:any){return count(r?.saved)&&r.saved<=100&&count(r?.failed)&&(r.remaining===null||count(r.remaining))&&(r.parseWarnings===undefined||count(r.parseWarnings));}
export function syncDecision(result:any):'complete'|'continue'|'retry'|'partial'{
  if(!validCounts(result)||!['success','partial','failed'].includes(result.status)||!Array.isArray(result.errors))return 'partial';
  const errors=codes(result);
  if(errors.length)return errors.every(code=>transientCodes.has(code))?'retry':'partial';
  if(result.failed!==0||result.remaining===null||result.status==='failed')return 'partial';
  if(result.remaining===0)return 'complete';
  return result.saved>0?'continue':'partial';
}

// Commit before HTTP 202. The scheduler owns collection, not the request handler.
export async function startSync(){
  return transaction(async c=>{
    const locked=(await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':mail-sync',0)) AS locked")).rows[0].locked;
    if(!locked||(await c.query('SELECT id FROM sync_run WHERE status=ANY($1::text[]) LIMIT 1',[activeStatuses])).rowCount)
      throw new HttpError(409,'이미 동기화 중입니다.');
    const id=randomUUID();
    await c.query("INSERT INTO sync_run(id,status) VALUES($1,'running')",[id]);
    return {id,status:'running'};
  });
}
export async function stopSync(id:string){
  const row=(await pool.query(`UPDATE sync_run SET status='stopping',next_attempt_at=NULL
    WHERE id=$1 AND status=ANY($2::text[]) RETURNING id,status`,[id,activeStatuses])).rows[0];
  if(row)return row;
  const existing=(await pool.query('SELECT id,status FROM sync_run WHERE id=$1',[id])).rows[0];
  if(!existing)throw new HttpError(404,'동기화 실행을 찾을 수 없습니다.');
  return existing;
}

// One batch per tick. Hold a dedicated connection's cross-process lock through the MCP call.
export async function processSyncBatch(syncCall=callSync){
  const c=await pool.connect();let locked=false,lost=false;
  const connectionLost=()=>{lost=true;};c.on('error',connectionLost);
  try{
    locked=(await c.query("SELECT pg_try_advisory_lock(hashtextextended(current_schema() || ':mail-sync',0)) AS locked")).rows[0].locked;
    if(!locked)return false;
    const row=(await c.query(`SELECT * FROM sync_run WHERE status=ANY($1::text[])
      AND (next_attempt_at IS NULL OR next_attempt_at<=now() OR status='stopping') ORDER BY started_at LIMIT 1`,[activeStatuses])).rows[0];
    if(!row)return false;
    if(row.status==='stopping'){
      await c.query("UPDATE sync_run SET status='paused',finished_at=now(),next_attempt_at=NULL WHERE id=$1",[row.id]);return true;
    }
    let result:any,uncertain=false;
    try{result=await syncCall('sync',{max_messages:100});}
    catch{result={status:'failed',saved:0,failed:0,remaining:null,errors:[{code:'MCP_UNAVAILABLE'}]};uncertain=true;}
    if(lost)throw new Error('Sync database lock connection lost');
    const valid=validCounts(result),decision=syncDecision(result),errors=codes(result);
    const retry=decision==='retry'&&row.retry_count<retryDelays.length;
    const state=decision==='complete'?'completed':decision==='continue'?'running':retry?'retrying':row.saved+(valid?result.saved:0)>0?'partial':'failed';
    const reason=decision==='complete'?'complete':decision==='continue'?'more':retry?'retry':decision==='retry'?'retry_exhausted':!valid?'invalid_response':!errors.length&&result.saved===0&&result.remaining>0?'no_progress':'error';
    await c.query(`UPDATE sync_run SET
      status=CASE WHEN status='stopping' AND $2<>'completed' THEN 'paused' ELSE $2 END,
      saved=saved+$3,failed=failed+$4,warnings=warnings+$5,remaining=$6,batch_count=batch_count+1,
      retry_count=$7,uncertain=uncertain OR $8,detail=$9,
      next_attempt_at=CASE WHEN status<>'stopping' AND $2='retrying' THEN now()+$10*interval '1 second' ELSE NULL END,
      finished_at=CASE WHEN status='stopping' OR $2 IN ('completed','partial','failed') THEN now() ELSE NULL END
      WHERE id=$1 AND status=ANY($11::text[])`,
      [row.id,state,valid?result.saved:0,valid?result.failed:0,valid?(result.parseWarnings??0):0,valid?result.remaining:null,
        retry?row.retry_count+1:decision==='continue'||decision==='complete'?0:row.retry_count,uncertain||!valid,
        JSON.stringify({codes:errors,reason,upstreamStatus:['success','partial','failed'].includes(result?.status)?result.status:'invalid',
          serverCount:count(result?.serverCount)?result.serverCount:null,serverStored:valid&&count(result?.existing)?result.existing+result.saved:null}),
        retry?retryDelays[row.retry_count]:0,activeStatuses]);
    return true;
  }finally{
    if(locked&&!lost)await c.query("SELECT pg_advisory_unlock(hashtextextended(current_schema() || ':mail-sync',0))").catch(()=>{lost=true;});
    c.removeListener('error',connectionLost);c.release(lost);
  }
}

// After a process restart, resume only on a new explicit user request.
export async function recoverSync(){
  return transaction(async c=>{
    const locked=(await c.query("SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || ':mail-sync',0)) AS locked")).rows[0].locked;
    if(!locked)return;
    await c.query(`UPDATE sync_run SET status='paused',finished_at=now(),next_attempt_at=NULL,uncertain=true,
      detail=jsonb_build_object('reason','interrupted','codes',jsonb_build_array()) WHERE status=ANY($1::text[])`,[activeStatuses]);
  });
}
export function startSyncScheduler(){
  let busy=false;
  const timer=setInterval(()=>{
    if(busy)return;busy=true;
    void processSyncBatch().catch(async()=>{
      console.error('sync_batch_failed');await recoverSync().catch(()=>{});
    }).finally(()=>{busy=false;});
  },1000);timer.unref();return timer;
}
