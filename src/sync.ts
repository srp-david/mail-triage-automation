import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { callMail } from './mcp.js';
import { HttpError } from './config.js';
export function syncDecision(result: any): 'complete'|'continue'|'partial' {
  if(!Number.isSafeInteger(result.saved)||result.saved<0||!Number.isSafeInteger(result.failed)||result.failed<0||!Number.isSafeInteger(result.remaining)||result.remaining<0)return 'partial';
  if (result.status !== 'success' || result.failed !== 0 || !Array.isArray(result.errors) || result.errors.length || result.remaining == null) return 'partial';
  if (result.remaining === 0) return 'complete';
  return result.remaining > 0 && result.saved > 0 ? 'continue' : 'partial';
}
export async function startSync(syncCall=callMail) {
  const c = await pool.connect();
  const locked = (await c.query('SELECT pg_try_advisory_lock(702602) AS locked')).rows[0].locked;
  if (!locked) { c.release(); throw new HttpError(409,'이미 동기화 중입니다.'); }
  const id = randomUUID();
  try {
    await c.query("UPDATE sync_run SET status='failed',finished_at=now() WHERE status='running'");
    await c.query("INSERT INTO sync_run(id,status) VALUES($1,'running')",[id]);
  } catch(e) { await c.query('SELECT pg_advisory_unlock(702602)'); c.release(); throw e; }
  void (async () => {
    let saved=0, failed=0, warnings=0;
    try {
      for(let batch=0;batch<30;batch++) {
        const r = await syncCall('sync',{max_messages:100});
        saved += r.saved ?? 0; failed += r.failed ?? 0; warnings += r.parseWarnings ?? 0;
        const decision = syncDecision(r);
        const status = decision === 'complete' ? 'completed' : decision === 'partial' || batch === 29 ? 'partial' : 'running';
        await c.query(`UPDATE sync_run SET status=$2,saved=$3,failed=$4,remaining=$5,warnings=$6,detail=$7,
          finished_at=CASE WHEN $2='running' THEN NULL ELSE now() END WHERE id=$1`,
          [id,status,saved,failed,r.remaining??null,warnings,JSON.stringify({codes:(r.errors??[]).map((x:any)=>x.code),batch:batch+1,upstreamStatus:r.status})]);
        if(status !== 'running') break;
      }
    } catch {
      await c.query("UPDATE sync_run SET status='failed',finished_at=now(),detail=$2 WHERE id=$1",[id,JSON.stringify({message:'MCP 동기화 실패. 기존 조회 데이터는 사용할 수 있습니다.'})]).catch(()=>{});
    } finally { await c.query('SELECT pg_advisory_unlock(702602)').catch(()=>{}); c.release(); }
  })();
  return {id,status:'running'};
}

export async function recoverSync() {
  const c=await pool.connect();
  try {
    const locked=(await c.query('SELECT pg_try_advisory_lock(702602) AS locked')).rows[0].locked;
    if(!locked)return;
    try { await c.query("UPDATE sync_run SET status='failed',finished_at=now(),detail=$1 WHERE status='running'", [JSON.stringify({message:'API 재시작으로 동기화 결과 확인이 중단되었습니다. 재동기화로 확인하세요.'})]); }
    finally { await c.query('SELECT pg_advisory_unlock(702602)'); }
  } finally { c.release(); }
}
