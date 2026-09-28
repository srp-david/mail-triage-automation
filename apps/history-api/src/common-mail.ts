import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {ApiError,type Principal} from '../../../packages/contracts/src/v1.js';
import {mailEvidence,mailFingerprint} from '../../../packages/contracts/src/mail-identity.js';
import {sourceAccess,lock,lockShared} from './directory.js';
import {transaction} from './db.js';
export const identityProof=z.object({mailId:z.number().int().positive().safe(),evidence:mailEvidence,verifiedAt:z.string().datetime()}).strict();
const scopeHash=z.string().regex(/^[a-f0-9]{64}$/);

export async function checkedMails(actor:Principal,sourceId:string,input:unknown){
 const b=z.object({scopeHash,mailIds:z.array(z.number().int().positive().safe()).max(100),refresh:z.boolean().default(false)}).strict().parse(input);
 return transaction(async c=>{
   await (b.refresh?lock(c):lockShared(c));const source=await sourceAccess(c,actor,sourceId);
   if(b.refresh){
     await c.query('DELETE FROM mail_identity_check WHERE source_id=$1 AND user_id=$2 AND scope_hash=$3 AND mail_id=ANY($4::bigint[])',[sourceId,actor.userId,b.scopeHash,b.mailIds]);
     return [];
   }
   // Any completed sync batch may have changed headers, including failed/partial syncs.
   return (await c.query(`SELECT v.mail_id::text AS "mailId",v.matched FROM mail_identity_check v
     LEFT JOIN mail_identity m ON m.store_id=$5 AND m.mail_id=v.mail_id
     LEFT JOIN common_mail_link l ON l.mail_key=m.id
     WHERE v.source_id=$1 AND v.user_id=$2 AND v.scope_hash=$3 AND v.mail_id=ANY($4::bigint[])
     AND ((v.matched AND l.common_id IS NOT NULL) OR (NOT v.matched AND v.verified_at>now()-interval '24 hours'))
     AND v.verified_at>coalesce((SELECT max(b.finished_at) FROM v1_sync s JOIN v1_sync_batch b ON b.sync_id=s.id
       WHERE s.source_id=$1),'-infinity'::timestamptz)`,[sourceId,actor.userId,b.scopeHash,b.mailIds,source.store_id])).rows;
 });
}

export async function bindCommonMail(c:PoolClient,actor:Principal,sourceId:string,input:unknown){
 const b=identityProof.parse(input),s=await sourceAccess(c,actor,sourceId);
 if(Math.abs(Date.now()-Date.parse(b.verifiedAt))>300000)throw new ApiError(409,'STALE_MAIL_PROOF');
 let mail=(await c.query('SELECT * FROM mail_identity WHERE store_id=$1 AND mail_id=$2',[s.store_id,b.mailId])).rows[0];
 if(mail&&mail.message_id!==b.evidence.messageId)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');
 const fingerprint=mailFingerprint(b.evidence);
 if(!fingerprint)return {matched:false,reason:'INCOMPLETE_HEADERS',commonId:null};
 if(!mail)mail=(await c.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),s.store_id,b.mailId,b.evidence.messageId,b.evidence.subject])).rows[0];
 const common=(await c.query('INSERT INTO common_mail(id,team_id,fingerprint) VALUES($1,$2,$3) ON CONFLICT(team_id,fingerprint) DO UPDATE SET fingerprint=excluded.fingerprint RETURNING id',[randomUUID(),s.team_id,fingerprint])).rows[0];
 const old=(await c.query('SELECT common_id FROM common_mail_link WHERE mail_key=$1',[mail.id])).rows[0];
 if(old&&old.common_id!==common.id)throw new ApiError(409,'COMMON_MAIL_IDENTITY_CHANGED');
 // Binding historical active runs must not bypass the same cross-source exclusion.
 const active=(await c.query("SELECT id FROM analysis_run WHERE status IN ('queued','running') AND (common_mail_id=$1 OR mail_key=$2)",[common.id,mail.id])).rows;
 if(active.length>1)throw new ApiError(409,'COMMON_MAIL_BUSY');
 await c.query('INSERT INTO common_mail_link(mail_key,common_id,verified_by) VALUES($1,$2,$3) ON CONFLICT(mail_key) DO NOTHING',[mail.id,common.id,actor.userId]);
 await c.query('UPDATE analysis_run SET common_mail_id=$2 WHERE mail_key=$1 AND common_mail_id IS NULL',[mail.id,common.id]);
 return {matched:true,reason:null,commonId:common.id};
}
export async function bindMail(actor:Principal,sourceId:string,input:unknown){return transaction(async c=>{await lock(c);return bindCommonMail(c,actor,sourceId,input);});}
export async function bindMails(actor:Principal,sourceId:string,input:unknown){
 const b=z.object({mails:z.array(identityProof).max(100),scopeHash:scopeHash.optional()}).strict().parse(input);
 return transaction(async c=>{await lock(c);await sourceAccess(c,actor,sourceId);const results=[];
   for(const mail of b.mails){
     const result=await bindCommonMail(c,actor,sourceId,mail);
     if(b.scopeHash)await c.query(`INSERT INTO mail_identity_check(source_id,user_id,scope_hash,mail_id,matched,verified_at)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_id,user_id,scope_hash,mail_id)
       DO UPDATE SET matched=excluded.matched,verified_at=excluded.verified_at`,[sourceId,actor.userId,b.scopeHash,mail.mailId,result.matched,mail.verifiedAt]);
     results.push({mailId:mail.mailId,...result});
   }
   return results;
 });
}
