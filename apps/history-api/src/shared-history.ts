import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from './db.js';
import {lockShared,lock,sourceAccess,digest} from './directory.js';
import {ApiError,uuid,type Principal} from '../../../packages/contracts/src/v1.js';

export async function historyAccess(c:PoolClient,actor:Principal,id:string,write=false){
  const r=(await c.query(`SELECT r.*,m.store_id,m.mail_id,m.message_id,m.subject,m.identity_kind,m.handled_at,s.id AS source_id
    FROM analysis_run r JOIN mail_identity m ON m.id=r.mail_key JOIN source s ON s.store_id=m.store_id WHERE r.id=$1`,[id])).rows[0];
  if(!r)throw new ApiError(404,'RUN_NOT_FOUND');await sourceAccess(c,actor,r.source_id,write);return r;
}
const mailProof=z.object({id:z.number().int().positive().safe(),messageId:z.string().max(4000).nullable(),fetchedAt:z.string().min(1).max(100),subject:z.string().max(10000)}).strict();
export const freshProof=z.string().datetime().refine(x=>Math.abs(Date.now()-Date.parse(x))<=300000,'STALE_MAIL_PROOF');
function link(row:any){return {id:row.id,storeId:row.store_id,createdAt:row.created_at,source:{id:Number(row.source_id),messageId:row.source_message_id,fetchedAt:row.source_fetched_at,subject:row.source_subject},target:{id:Number(row.target_id),messageId:row.target_message_id,fetchedAt:row.target_fetched_at,subject:row.target_subject}};}
const same=(a:any,b:any)=>a.id===b.id&&a.messageId===b.messageId&&a.fetchedAt===b.fetchedAt;

// All permissions and reads/writes share the same transaction and ACL lock.
// Never call the unauthenticated v0 repositories from the v1 boundary.
export class SharedHistory {
  async get(actor:Principal,id:string){return transaction(async c=>{
    await lockShared(c);const r=await historyAccess(c,actor,id);
    const p=(await c.query('SELECT result FROM report_version WHERE run_id=$1',[id])).rows[0];
    const v=(await c.query('SELECT * FROM v1_run WHERE run_id=$1',[id])).rows[0];
    const reviews=(await c.query(`SELECT r.id,r.author,coalesce(u.email,r.author) AS "authorDisplay",r.body,r.created_at FROM review r LEFT JOIN app_user u ON u.id::text=r.author WHERE r.run_id=$1 ORDER BY r.created_at,r.id`,[id])).rows;
    const related=(await c.query('SELECT id,store_id,mail_id,message_id,metadata,linked_at FROM related_mail WHERE mail_key=$1 AND store_id=$2 ORDER BY linked_at,id',[r.mail_key,r.store_id])).rows;
    return {id:r.id,sourceId:r.source_id,storeId:r.store_id,mailId:r.mail_id===null?null:Number(r.mail_id),messageId:r.message_id,subject:r.subject,identityKind:r.identity_kind,
      status:r.status,agent:v?.agent??'unknown',runnerId:v?.target_runner_id??null,requestedBy:v?.requested_by??null,
      progress:r.progress_events,handledAt:r.handled_at,createdAt:r.created_at,startedAt:r.started_at,finishedAt:r.finished_at,error:r.error,
      result:p?.result??null,reportHash:p?digest(p.result.report):null,reviews,relatedMails:related,
      cancelRequested:!!v?.cancel_requested_at,verifiedBy:v?.verified_by??null,verifiedAt:v?.verified_at??null,parentId:r.parent_id,answer:r.answer};
  });}
  async list(actor:Principal,sourceId:string,offset=0,mailId?:number,query=''){return transaction(async c=>{
    await lockShared(c);const s=await sourceAccess(c,actor,sourceId);
    return (await c.query(`SELECT r.id,r.status,r.created_at AS "createdAt",r.finished_at AS "finishedAt",r.error,m.mail_id AS "mailId",m.subject,m.handled_at AS "handledAt",v.agent
      FROM analysis_run r JOIN mail_identity m ON m.id=r.mail_key LEFT JOIN v1_run v ON v.run_id=r.id
      WHERE m.store_id=$1 AND ($3::bigint IS NULL OR m.mail_id=$3) AND ($4='' OR strpos(lower(m.subject),lower($4))>0)
      ORDER BY r.created_at DESC,r.id DESC LIMIT 100 OFFSET $2`,[s.store_id,offset,mailId??null,query])).rows;
  });}
  async review(actor:Principal,id:string,input:unknown){
    const b=z.object({requestId:uuid,body:z.string().trim().min(1).max(500000)}).strict().parse(input);
    return transaction(async c=>{await lock(c);await historyAccess(c,actor,id,true);
      if(!(await c.query('SELECT 1 FROM report_version WHERE run_id=$1',[id])).rowCount)throw new ApiError(409,'NO_REPORT');
      const prior=(await c.query('SELECT * FROM review WHERE request_id=$1',[b.requestId])).rows[0];
      if(prior){if(prior.run_id!==id||prior.author!==actor.userId||prior.body!==b.body)throw new ApiError(409,'REVIEW_CONFLICT');return {id:prior.id};}
      const reviewId=randomUUID();await c.query('INSERT INTO review(id,run_id,request_id,author,body) VALUES($1,$2,$3,$4,$5)',[reviewId,id,b.requestId,actor.userId,b.body]);return {id:reviewId};
    });
  }
  async handling(actor:Principal,id:string,completed:boolean){return transaction(async c=>{
    await lock(c);const r=await historyAccess(c,actor,id,true);
    if(completed&&(await c.query("SELECT 1 FROM analysis_run WHERE mail_key=$1 AND status IN ('queued','running')",[r.mail_key])).rowCount)throw new ApiError(409,'RUN_ACTIVE');
    return (await c.query('UPDATE mail_identity SET handled_at=CASE WHEN $2 THEN coalesce(handled_at,now()) ELSE NULL END WHERE id=$1 RETURNING handled_at AS "handledAt"',[r.mail_key,completed])).rows[0];
  });}
  async summaries(actor:Principal,sourceId:string,ids:number[]){return transaction(async c=>{
    await lockShared(c);const s=await sourceAccess(c,actor,sourceId);
    return (await c.query(`SELECT m.mail_id::text AS "mailId",m.handled_at AS "handledAt",a.*,l."legacyCount" FROM mail_identity m
      CROSS JOIN LATERAL (SELECT count(*)::int AS "runCount",count(*) FILTER(WHERE r.status='completed')::int AS "completedCount",(array_agg(r.status ORDER BY r.created_at DESC,r.id DESC))[1] AS "latestStatus" FROM analysis_run r WHERE r.mail_key=m.id) a
      CROSS JOIN LATERAL (SELECT count(*)::int AS "legacyCount" FROM legacy_link ll JOIN legacy_collection_document d ON d.document_id=ll.document_id JOIN legacy_collection lc ON lc.id=d.collection_id
        JOIN membership own ON own.user_id=lc.owner_user_id AND own.team_id=$4 AND own.active
        LEFT JOIN legacy_collection_access la ON la.collection_id=lc.id AND la.user_id=$3
        WHERE ll.mail_key=m.id AND (lc.owner_user_id=$3 OR la.user_id IS NOT NULL)) l
      WHERE m.store_id=$1 AND m.mail_id=ANY($2::bigint[])`,[s.store_id,ids,actor.userId,s.team_id])).rows;
  });}
  async related(actor:Principal,id:string,input:unknown){
    const b=z.object({mail:mailProof,verifiedAt:freshProof}).strict().parse(input);
    return transaction(async c=>{await lock(c);const r=await historyAccess(c,actor,id,true);
      if(!r.handled_at)throw new ApiError(409,'MAIL_NOT_HANDLED');
      if(Number(r.mail_id)===b.mail.id||!b.mail.messageId)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');
      await c.query(`INSERT INTO related_mail(id,mail_key,store_id,mail_id,message_id,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(mail_key,store_id,mail_id) DO NOTHING`,[randomUUID(),r.mail_key,r.store_id,b.mail.id,b.mail.messageId,JSON.stringify(b.mail)]);
      const row=(await c.query('SELECT id,message_id FROM related_mail WHERE mail_key=$1 AND store_id=$2 AND mail_id=$3',[r.mail_key,r.store_id,b.mail.id])).rows[0];
      if(row.message_id!==b.mail.messageId)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');return {id:row.id};
    });
  }
  async unlinkRelated(actor:Principal,id:string,linkId:string){return transaction(async c=>{
    await lock(c);const r=await historyAccess(c,actor,id,true);await c.query('DELETE FROM related_mail WHERE id=$1 AND mail_key=$2',[linkId,r.mail_key]);return {ok:true};
  });}
  async threads(actor:Principal,sourceId:string){return transaction(async c=>{
    await lockShared(c);const s=await sourceAccess(c,actor,sourceId);return (await c.query('SELECT * FROM manual_thread_link WHERE store_id=$1 ORDER BY created_at DESC,id',[s.store_id])).rows.map(link);
  });}
  async addThread(actor:Principal,sourceId:string,input:unknown){
    const b=z.object({source:mailProof,target:mailProof,verifiedAt:freshProof}).strict().parse(input);
    if(b.source.id===b.target.id)throw new ApiError(400,'SAME_MAIL');
    const [from,to]=b.source.id<b.target.id?[b.source,b.target]:[b.target,b.source];
    return transaction(async c=>{await lock(c);const s=await sourceAccess(c,actor,sourceId,true);
      const inserted=await c.query(`INSERT INTO manual_thread_link(id,store_id,source_id,source_message_id,source_fetched_at,source_subject,target_id,target_message_id,target_fetched_at,target_subject)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(store_id,source_id,target_id) DO NOTHING RETURNING *`,[randomUUID(),s.store_id,from.id,from.messageId,from.fetchedAt,from.subject,to.id,to.messageId,to.fetchedAt,to.subject]);
      const row=inserted.rows[0]??(await c.query('SELECT * FROM manual_thread_link WHERE store_id=$1 AND source_id=$2 AND target_id=$3',[s.store_id,from.id,to.id])).rows[0];const value=link(row);
      if(!same(from,value.source)||!same(to,value.target))throw new ApiError(409,'MAIL_IDENTITY_CHANGED');return {link:value,created:!!inserted.rowCount};
    });
  }
  async removeThread(actor:Principal,sourceId:string,id:string){return transaction(async c=>{
    await lock(c);const s=await sourceAccess(c,actor,sourceId,true);await c.query('DELETE FROM manual_thread_link WHERE id=$1 AND store_id=$2',[id,s.store_id]);return {ok:true};
  });}
  async detachThread(actor:Principal,sourceId:string,input:unknown){
    const b=z.object({mail:mailProof.omit({subject:true}),linkIds:z.array(uuid).min(1).max(1000)}).strict().parse(input);
    return transaction(async c=>{await lock(c);const s=await sourceAccess(c,actor,sourceId,true);
      const rows=(await c.query('SELECT * FROM manual_thread_link WHERE store_id=$1 AND id=ANY($2::uuid[])',[s.store_id,b.linkIds])).rows;
      for(const row of rows){const value=link(row);if(!same(b.mail,value.source)&&!same(b.mail,value.target))throw new ApiError(409,'MAIL_IDENTITY_CHANGED');}
      const deleted=await c.query('DELETE FROM manual_thread_link WHERE store_id=$1 AND id=ANY($2::uuid[])',[s.store_id,b.linkIds]);return {ok:true,removed:deleted.rowCount};
    });
  }
}
