import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction} from '../../../src/db.js';
import {config,HttpError} from '../../../src/config.js';

const address=z.object({address:z.string().max(1000),name:z.string().max(1000).optional()});
const mailSchema=z.object({id:z.coerce.number().int().positive(),messageId:z.string().min(1).max(4000),
  subject:z.string().max(10000),from:z.array(address).max(1000).default([]),to:z.array(address).max(1000).default([]),
  sentAt:z.string().max(100).nullable().optional()});
export async function listRelatedMails(mailKey:string){
  return (await pool.query('SELECT id,store_id,mail_id,message_id,metadata,linked_at FROM related_mail WHERE mail_key=$1 ORDER BY linked_at,id',[mailKey])).rows
    .map(row=>({...row,available:row.store_id===config.store}));
}
export async function relatedSource(runId:string){
  const source=(await pool.query('SELECT m.* FROM mail_identity m JOIN analysis_run r ON r.mail_key=m.id WHERE r.id=$1',[runId])).rows[0];
  if(!source)throw new HttpError(404,'분석을 찾을 수 없습니다.');
  return source;
}
export async function addRelatedMail(runId:string,storeId:string,mailId:number,messageId:string,mail:unknown){
  if(storeId!==config.store)throw new HttpError(409,'현재 MCP 저장소가 아닙니다.');
  const target=mailSchema.parse(mail);
  if(target.id!==mailId||target.messageId!==messageId)throw new HttpError(409,'선택한 메일의 식별자가 변경되었습니다. 다시 조회하세요.');
  const source=await relatedSource(runId);
  return transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[source.identity_kind==='outlook'?source.id:source.store_id+':'+source.mail_id]);
    const current=(await c.query('SELECT handled_at FROM mail_identity WHERE id=$1',[source.id])).rows[0];
    if(source.store_id!==storeId)throw new HttpError(409,'분석 메일과 현재 MCP 저장소가 다릅니다.');
    if(!current.handled_at)throw new HttpError(409,'처리 완료한 뒤 관련 메일을 연결하세요.');
    if(source.identity_kind==='mcp'&&Number(source.mail_id)===mailId)throw new HttpError(409,'같은 메일을 자기 자신에게 연결할 수 없습니다.');
    await c.query(`INSERT INTO related_mail(id,mail_key,store_id,mail_id,message_id,metadata) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(mail_key,store_id,mail_id) DO NOTHING`,[randomUUID(),source.id,storeId,mailId,messageId,JSON.stringify(target)]);
    const linked=(await c.query('SELECT * FROM related_mail WHERE mail_key=$1 AND store_id=$2 AND mail_id=$3',[source.id,storeId,mailId])).rows[0];
    if(linked.message_id!==messageId)throw new HttpError(409,'기존 연결의 메일 식별자가 다릅니다. 기존 연결을 해제한 뒤 다시 선택하세요.');
    return linked;
  });
}
export async function getRelatedMail(runId:string,linkId:string){
  const source=await relatedSource(runId);
  const link=(await pool.query('SELECT * FROM related_mail WHERE id=$1 AND mail_key=$2',[linkId,source.id])).rows[0];
  if(!link)throw new HttpError(404,'연결된 메일을 찾을 수 없습니다.');
  if(link.store_id!==config.store)throw new HttpError(409,'연결 당시 MCP 저장소와 현재 저장소가 다릅니다.');
  return link;
}
export async function unlinkRelatedMail(runId:string,linkId:string){
  const source=await relatedSource(runId);
  // Removing a relation also works after handling is undone or the MCP store changes.
  await pool.query('DELETE FROM related_mail WHERE id=$1 AND mail_key=$2',[linkId,source.id]);
  return {ok:true};
}
