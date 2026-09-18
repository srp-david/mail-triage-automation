import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool,transaction} from './db.js';
import {HttpError} from './config.js';

export const threadMailIdentity=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  messageId:z.string().max(4000).nullable(),fetchedAt:z.string().min(1).max(100)}).strict();
export type ThreadMailIdentity=z.infer<typeof threadMailIdentity>;
type Endpoint=ThreadMailIdentity&{subject:string};
export type ThreadLink={id:string;storeId:string;source:Endpoint;target:Endpoint;createdAt:string};
const same=(a:ThreadMailIdentity,b:ThreadMailIdentity)=>a.id===b.id&&a.messageId===b.messageId&&a.fetchedAt===b.fetchedAt;

export function verifyThreadMail(expected:ThreadMailIdentity,mail:any):Endpoint{
  const current=threadMailIdentity.parse({id:Number(mail.id),messageId:mail.messageId??null,fetchedAt:mail.fetchedAt});
  if(!same(expected,current))throw new HttpError(409,'메일 식별자가 변경되었습니다. 목록을 새로 조회한 뒤 다시 묶어 주세요.');
  return {...current,subject:z.string().max(10000).parse(mail.subject??'')};
}
function rowLink(row:any):ThreadLink{
  return {id:row.id,storeId:row.store_id,createdAt:new Date(row.created_at).toISOString(),
    source:{id:Number(row.source_id),messageId:row.source_message_id,fetchedAt:row.source_fetched_at,subject:row.source_subject},
    target:{id:Number(row.target_id),messageId:row.target_message_id,fetchedAt:row.target_fetched_at,subject:row.target_subject}};
}
export async function listThreadLinks(storeId:string):Promise<ThreadLink[]>{
  return (await pool.query('SELECT * FROM manual_thread_link WHERE store_id=$1 ORDER BY created_at DESC,id',[storeId])).rows.map(rowLink);
}
export async function addThreadLink(storeId:string,source:Endpoint,target:Endpoint){
  if(source.id===target.id)throw new HttpError(400,'같은 메일에 연결할 수 없습니다.');
  // Canonical pairs make reversed drops and response-loss retries idempotent.
  if(source.id>target.id)[source,target]=[target,source];
  return transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['manual-thread:'+storeId]);
    const inserted=await client.query(`INSERT INTO manual_thread_link
      (id,store_id,source_id,source_message_id,source_fetched_at,source_subject,target_id,target_message_id,target_fetched_at,target_subject)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(store_id,source_id,target_id) DO NOTHING RETURNING *`,
      [randomUUID(),storeId,source.id,source.messageId,source.fetchedAt,source.subject,target.id,target.messageId,target.fetchedAt,target.subject]);
    const row=inserted.rows[0]??(await client.query('SELECT * FROM manual_thread_link WHERE store_id=$1 AND source_id=$2 AND target_id=$3',[storeId,source.id,target.id])).rows[0];
    const link=rowLink(row);
    if(!same(source,link.source)||!same(target,link.target))throw new HttpError(409,'기존 수동 연결의 메일 식별자가 다릅니다. 연결 관리에서 해제한 뒤 다시 묶어 주세요.');
    return {link,created:inserted.rows.length>0};
  });
}
export async function removeThreadLink(storeId:string,id:string){
  return transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['manual-thread:'+storeId]);
    await client.query('DELETE FROM manual_thread_link WHERE id=$1 AND store_id=$2',[id,storeId]);
    return {ok:true};
  });
}
export async function detachThreadMail(storeId:string,mail:ThreadMailIdentity,linkIds:string[]){
  return transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['manual-thread:'+storeId]);
    const rows=(await client.query('SELECT * FROM manual_thread_link WHERE store_id=$1 AND id=ANY($2::uuid[])',[storeId,linkIds])).rows;
    // Validate every surviving edge before deleting any. Missing edges make retries safe.
    for(const row of rows){const link=rowLink(row);
      if(!same(mail,link.source)&&!same(mail,link.target))throw new HttpError(409,'메일의 연결 정보가 변경되었습니다. 목록을 다시 조회하세요.');
    }
    const result=await client.query('DELETE FROM manual_thread_link WHERE store_id=$1 AND id=ANY($2::uuid[])',[storeId,linkIds]);
    return {ok:true,removed:result.rowCount??0};
  });
}
export const threadLinkStore={list:listThreadLinks,add:addThreadLink,remove:removeThreadLink,detach:detachThreadMail};
