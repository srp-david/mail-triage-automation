import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { pool, transaction } from './db.js';
import { config, HttpError } from './config.js';
import { startSchema, resultSchema } from './schema.js';
export const digest = (x: string) => createHash('sha256').update(x).digest('hex');
export function sameSecret(a: string, b: string) { return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b))); }
function directToken(id: string) { return createHmac('sha256', config.token).update(id).digest('hex'); }
export async function expireRuns() {
  await pool.query("UPDATE analysis_run SET status='failed',error='실행 연결이 만료되었습니다. 새 실행으로 재시도하세요.',finished_at=now() WHERE status='running' AND lease_until < now()");
}
export async function startRun(input: unknown) {
  return admitRun(startSchema.parse(input));
}
export async function startExternalRun(externalId: string, requestId: string, parentId?: string, answer?: string) {
  const mail=(await pool.query("SELECT * FROM mail_identity WHERE id=$1 AND identity_kind='outlook'",[externalId])).rows[0];
  if(!mail)throw new HttpError(404,'Outlook 예외 메일을 찾을 수 없습니다.');
  return admitRun({storeId:mail.store_id,mailId:null,messageId:mail.message_id,subject:mail.subject,source:'direct',requestId,parentId,answer},mail.id);
}
async function admitRun(data: Omit<ReturnType<typeof startSchema.parse>,'mailId'> & {mailId:number|null}, externalId?: string) {
  const requestHash = digest(JSON.stringify({...data,externalId}));
  return transaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [externalId??data.storeId + ':' + data.mailId]);
    const prior = (await c.query('SELECT * FROM analysis_run WHERE request_id=$1', [data.requestId])).rows[0];
    if (prior) {
      if (prior.request_hash !== requestHash) throw new HttpError(409, '같은 요청 ID에 다른 입력이 전달되었습니다.');
      return { id: prior.id, status: prior.status, ownerToken: prior.source === 'direct' ? directToken(prior.id) : undefined };
    }
    let mail = externalId ? (await c.query('SELECT * FROM mail_identity WHERE id=$1',[externalId])).rows[0]
      : (await c.query('SELECT * FROM mail_identity WHERE store_id=$1 AND mail_id=$2', [data.storeId, data.mailId])).rows[0];
    if (mail && mail.message_id !== data.messageId) throw new HttpError(409, '메일 식별자가 변경되었습니다. MCP 저장소 식별자를 점검하세요.');
    if (!mail) mail = (await c.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [randomUUID(), data.storeId, data.mailId, data.messageId, data.subject])).rows[0];
    await c.query("UPDATE analysis_run SET status='failed',error='실행 연결 만료',finished_at=now() WHERE mail_key=$1 AND status='running' AND lease_until < now()", [mail.id]);
    const active = (await c.query("SELECT id FROM analysis_run WHERE mail_key=$1 AND status IN ('queued','running')", [mail.id])).rows[0];
    if (active) throw new HttpError(409, '이미 진행 중인 분석이 있습니다: ' + active.id);
    if (data.parentId) {
      const parent = (await c.query('SELECT mail_key,status FROM analysis_run WHERE id=$1', [data.parentId])).rows[0];
      if (!parent || parent.mail_key !== mail.id) throw new HttpError(409, '이전 분석의 메일이 다릅니다.');
      if (parent.status === 'needs_input' && !data.answer?.trim()) throw new HttpError(400, '질문에 대한 답변을 입력하세요.');
    }
    const id = randomUUID(); const direct = data.source === 'direct'; const ownerToken = direct ? directToken(id) : undefined;
    await c.query(`INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status,owner_hash,lease_until,started_at,parent_id,answer)
      VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now()+interval '15 minutes' ELSE NULL END,CASE WHEN $8 THEN now() ELSE NULL END,$9,$10)`,
      [id,mail.id,data.source,data.requestId,requestHash,direct?'running':'queued',ownerToken?digest(ownerToken):null,direct,data.parentId??null,data.answer??null]);
    return { id, status: direct?'running':'queued', ownerToken };
  });
}
export async function claimRun() {
  return transaction(async c => {
    const run = (await c.query("SELECT * FROM analysis_run WHERE status='queued' AND source='web' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if (!run) return null;
    const ownerToken = randomUUID();
    await c.query("UPDATE analysis_run SET status='running',started_at=now(),lease_until=now()+interval '15 minutes',owner_hash=$2 WHERE id=$1", [run.id,digest(ownerToken)]);
    return { ...run, ownerToken };
  });
}
export async function heartbeat(id: string, token: string) {
  const r = await pool.query("UPDATE analysis_run SET lease_until=now()+interval '15 minutes' WHERE id=$1 AND owner_hash=$2 AND status='running' AND lease_until>now()", [id,digest(token)]);
  if (!r.rowCount) throw new HttpError(409,'실행 소유권 또는 유효 시간이 만료되었습니다.');
}
export async function finishRun(id: string, token: string, input: unknown) {
  const result = resultSchema.parse(input);
  return transaction(async c => {
    const row = (await c.query('SELECT *,lease_until>now() AS valid FROM analysis_run WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!row || !sameSecret(row.owner_hash ?? '', digest(token))) throw new HttpError(409,'실행 소유권이 일치하지 않습니다.');
    const previous = (await c.query('SELECT result FROM report_version WHERE run_id=$1', [id])).rows[0];
    if (previous) {
      if (JSON.stringify(resultSchema.parse(previous.result)) !== JSON.stringify(result)) throw new HttpError(409,'저장된 결과와 다릅니다. 새 분석을 시작하세요.');
      return { id, status: row.status };
    }
    if (row.status !== 'running' || !row.valid) throw new HttpError(409,'종료되었거나 만료된 실행입니다.');
    await c.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)', [id,JSON.stringify(result)]);
    await c.query('UPDATE analysis_run SET status=$2,finished_at=now(),lease_until=NULL WHERE id=$1', [id,result.outcome]);
    return { id, status: result.outcome };
  });
}
export async function failRun(id: string, token: string, message: string) {
  const r = await pool.query("UPDATE analysis_run SET status='failed',error=$3,finished_at=now(),lease_until=NULL WHERE id=$1 AND owner_hash=$2 AND status='running' AND lease_until>now()", [id,digest(token),message.slice(0,2000)]);
  if (!r.rowCount) throw new HttpError(409,'유효한 실행 소유권이 없습니다.');
}
export async function getRun(id: string) {
  const run = (await pool.query(`SELECT r.id,r.source,r.status,r.parent_id,r.answer,r.error,r.created_at,r.started_at,r.finished_at,
    m.store_id,m.mail_id,m.message_id,m.subject,m.identity_kind,m.id AS mail_key,p.result FROM analysis_run r JOIN mail_identity m ON m.id=r.mail_key
    LEFT JOIN report_version p ON p.run_id=r.id WHERE r.id=$1`, [id])).rows[0];
  if (!run) throw new HttpError(404,'분석을 찾을 수 없습니다.');
  const reviews = (await pool.query('SELECT id,author,body,created_at FROM review WHERE run_id=$1 ORDER BY created_at', [id])).rows;
  return {...run,reviews,reportHash:run.result?digest(run.result.report):null};
}

export async function recoverResult(id:string, ownerToken:string, result:unknown, requestId:string) {
  const parsed=resultSchema.parse(result);
  const old=(await pool.query('SELECT *,lease_until>now() AS valid FROM analysis_run WHERE id=$1',[id])).rows[0];
  if(!old||!sameSecret(old.owner_hash??'',digest(ownerToken)))throw new HttpError(409,'복구 실행 소유권이 일치하지 않습니다.');
  if(old.status==='completed'||old.status==='needs_input'||old.status==='running'&&old.valid)return finishRun(id,ownerToken,parsed);
  const run=await getRun(id);
  const recovered=run.identity_kind==='outlook'
    ? await startExternalRun(run.mail_key,requestId,id)
    : await startRun({storeId:run.store_id,mailId:Number(run.mail_id),messageId:run.message_id,subject:run.subject,source:'direct',requestId,parentId:id});
  await finishRun(recovered.id,recovered.ownerToken!,parsed);
  return {id:recovered.id,status:parsed.outcome,recoveredFrom:id};
}
export async function listRuns(store?: string, mailId?: number, offset=0) {
  return (await pool.query(`SELECT r.id,r.source,r.status,r.error,r.created_at,r.finished_at,m.store_id,m.mail_id,m.subject,m.identity_kind
    FROM analysis_run r JOIN mail_identity m ON m.id=r.mail_key
    WHERE ($1::text IS NULL OR m.store_id=$1) AND ($2::bigint IS NULL OR m.mail_id=$2)
    ORDER BY r.created_at DESC,r.id DESC LIMIT 100 OFFSET $3`, [store??null,mailId??null,offset])).rows;
}
export async function addReview(id: string, requestId: string, author: string, body: string) {
  await getRun(id);
  const previous = (await pool.query('SELECT * FROM review WHERE request_id=$1',[requestId])).rows[0];
  if (previous) {
    if (previous.run_id !== id || previous.author !== author || previous.body !== body) throw new HttpError(409,'리뷰 요청 ID가 이미 사용되었습니다.');
    return previous.id;
  }
  const reviewId = randomUUID();
  await pool.query('INSERT INTO review(id,run_id,request_id,author,body) VALUES($1,$2,$3,$4,$5)',[reviewId,id,requestId,author,body]);
  return reviewId;
}
