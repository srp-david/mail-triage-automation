import { randomUUID, createHmac } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction } from '../../../src/db.js';
import { config, HttpError } from '../../../src/config.js';
import { digest, getRun } from '../../../src/history.js';

export const hashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const namespaceSchema=z.string().min(1).max(200);
const relativePath=z.string().min(1).max(1000).refine(x=>!x.startsWith('/')&&!x.includes('\\')&&!x.includes(':')&&!x.split('/').some(p=>p==='..'||p==='.'||!p));
export const legacySchema=z.object({namespace:namespaceSchema,path:relativePath,hash:hashSchema,
  kind:z.enum(['report','log']),body:z.string().min(1).max(1_000_000)});

export async function importLegacy(input:unknown) {
  const data=legacySchema.parse(input);
  if(digest(data.body)!==data.hash)throw new HttpError(409,'원본 해시가 본문과 일치하지 않습니다.');
  return transaction(async c=>{
    const r=await c.query(`INSERT INTO legacy_document(id,namespace,source_path,source_hash,kind,body) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(namespace,source_path,source_hash) DO NOTHING RETURNING id`,[randomUUID(),data.namespace,data.path,data.hash,data.kind,data.body]);
    const id=r.rows[0]?.id??(await c.query('SELECT id FROM legacy_document WHERE namespace=$1 AND source_path=$2 AND source_hash=$3',[data.namespace,data.path,data.hash])).rows[0].id;
    return {id,imported:!!r.rowCount,hash:data.hash};
  });
}
export async function listLegacy(storeId?:string,mailId?:number,offset=0) {
  return (await pool.query(`SELECT d.id,d.namespace,d.source_path,d.source_hash,d.kind,d.imported_at,l.mail_key,
    m.store_id,m.mail_id FROM legacy_document d LEFT JOIN legacy_link l ON l.document_id=d.id
    LEFT JOIN mail_identity m ON m.id=l.mail_key
    WHERE ($1::text IS NULL OR m.store_id=$1) AND ($2::bigint IS NULL OR m.mail_id=$2)
    ORDER BY d.imported_at DESC,d.id LIMIT 100 OFFSET $3`,[storeId??null,mailId??null,offset])).rows;
}
export async function getLegacy(id:string) {
  const row=(await pool.query('SELECT * FROM legacy_document WHERE id=$1',[id])).rows[0];
  if(!row)throw new HttpError(404,'과거 문서를 찾을 수 없습니다.');return row;
}
export async function linkLegacy(id:string, hash:string, mail:{storeId:string;mailId:number;messageId:string;subject:string}, verifiedBy:string) {
  return transaction(async c=>{
    const doc=(await c.query('SELECT * FROM legacy_document WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!doc||doc.source_hash!==hash)throw new HttpError(409,'검토한 원본 버전이 다릅니다.');
    if(doc.kind!=='report')throw new HttpError(400,'여러 메일이 섞인 전체 로그는 한 메일에 연결할 수 없습니다.');
    const proof={...mail,verifiedBy,sourceHash:hash};
    const old=(await c.query('SELECT * FROM legacy_link WHERE document_id=$1',[id])).rows[0];
    if(old){
      if(JSON.stringify(old.proof)!==JSON.stringify(JSON.parse(JSON.stringify(proof)))){
        if(old.proof.storeId!==mail.storeId||Number(old.proof.mailId)!==mail.mailId||old.proof.messageId!==mail.messageId)
          throw new HttpError(409,'이미 다른 메일과 연결되어 있습니다.');
      }
      return {id,linked:true};
    }
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[mail.storeId+':'+mail.mailId]);
    let identity=(await c.query('SELECT * FROM mail_identity WHERE store_id=$1 AND mail_id=$2',[mail.storeId,mail.mailId])).rows[0];
    if(identity&&identity.message_id!==mail.messageId)throw new HttpError(409,'메일 식별자가 변경되었습니다.');
    if(!identity)identity=(await c.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [randomUUID(),mail.storeId,mail.mailId,mail.messageId,mail.subject])).rows[0];
    await c.query('INSERT INTO legacy_link(document_id,mail_key,proof) VALUES($1,$2,$3)',[id,identity.id,JSON.stringify(proof)]);
    return {id,linked:true};
  });
}

export const externalMailSchema=z.object({namespace:namespaceSchema,mailbox:z.string().min(1).max(2000),
  entryId:z.string().min(1).max(4000),messageId:z.string().max(2000).nullable().default(null),subject:z.string().max(2000),
  sourceHash:hashSchema});
export async function registerExternal(input:unknown) {
  const data=externalMailSchema.parse(input);
  // EntryID is scoped to a mailbox. Internet Message-ID alone never joins identities.
  const key=digest(JSON.stringify([data.mailbox,data.entryId]));
  const store='outlook:'+data.namespace;
  return transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[store+':'+key]);
    const old=(await c.query('SELECT * FROM mail_identity WHERE store_id=$1 AND external_key=$2',[store,key])).rows[0];
    if(old){if(old.message_id!==data.messageId||old.external_source_hash!==data.sourceHash)throw new HttpError(409,'같은 Outlook 식별자의 원본 또는 Message-ID가 다릅니다.');return {id:old.id,kind:'outlook'};}
    const id=randomUUID();
    await c.query(`INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject,identity_kind,external_key,external_source_hash)
      VALUES($1,$2,NULL,$3,$4,'outlook',$5,$6)`,[id,store,data.messageId,data.subject,key,data.sourceHash]);
    return {id,kind:'outlook'};
  });
}

export const proposalSchema=z.object({runId:z.string().uuid(),namespace:namespaceSchema,
  target:relativePath.refine(x=>/^erp\/(gg|gg-fac|d-code)\/docs\/.+\.md$/.test(x)),
  baseHash:hashSchema,reportHash:hashSchema,nextHash:hashSchema});
export function knowledgeAddition(runId:string,reportHash:string,knowledge:string) {
  return `\n\n<!-- triage-knowledge:${runId}:${reportHash} -->\n${knowledge.trim()}\n`;
}
export async function prepareKnowledge(input:unknown) {
  const data=proposalSchema.parse(input),run=await getRun(data.runId);
  if(!run.result?.knowledge?.trim()||run.reportHash!==data.reportHash)throw new HttpError(409,'지식 제안 또는 보고서 버전을 확인하세요.');
  const addition=knowledgeAddition(run.id,run.reportHash,run.result.knowledge);
  const r=await pool.query(`INSERT INTO knowledge_proposal(id,run_id,namespace,target_path,base_hash,report_hash,addition,next_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(run_id,namespace,target_path,base_hash) DO NOTHING RETURNING *`,
    [randomUUID(),data.runId,data.namespace,data.target,data.baseHash,data.reportHash,addition,data.nextHash]);
  const row=r.rows[0]??(await pool.query('SELECT * FROM knowledge_proposal WHERE run_id=$1 AND namespace=$2 AND target_path=$3 AND base_hash=$4',
    [data.runId,data.namespace,data.target,data.baseHash])).rows[0];
  if(row.next_hash!==data.nextHash||row.report_hash!==data.reportHash)throw new HttpError(409,'동일 제안에 다른 버전이 전달되었습니다.');
  const {owner_hash,...safe}=row;return safe;
}
export async function getKnowledge(id:string) {
  const row=(await pool.query('SELECT * FROM knowledge_proposal WHERE id=$1',[id])).rows[0];
  if(!row)throw new HttpError(404,'지식 제안을 찾을 수 없습니다.');
  const {owner_hash,...safe}=row;return safe;
}
export async function claimKnowledge(id:string) {
  return transaction(async c=>{
    const row=(await c.query('SELECT * FROM knowledge_proposal WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!row)throw new HttpError(404,'지식 제안을 찾을 수 없습니다.');
    if(row.status==='applied')return {status:'applied'};
    const ownerToken=createHmac('sha256',config.token).update('knowledge:'+id).digest('hex');
    await c.query("UPDATE knowledge_proposal SET status='applying',owner_hash=$2 WHERE id=$1",[id,digest(ownerToken)]);
    return {status:'applying',ownerToken};
  });
}
export async function completeKnowledge(id:string,token:string,hash:string) {
  const r=await pool.query(`UPDATE knowledge_proposal SET status='applied',applied_at=coalesce(applied_at,now())
    WHERE id=$1 AND owner_hash=$2 AND next_hash=$3 AND status IN ('applying','applied') RETURNING id`,[id,digest(token),hash]);
  if(!r.rowCount)throw new HttpError(409,'지식 반영 소유권 또는 결과 해시가 일치하지 않습니다.');
  return {id,status:'applied'};
}
