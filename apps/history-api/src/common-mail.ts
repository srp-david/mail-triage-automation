import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {ApiError,type Principal} from '../../../packages/contracts/src/v1.js';
import {mailEvidence,mailFingerprint} from '../../../packages/contracts/src/mail-identity.js';
import {sourceAccess,lock} from './directory.js';
import {transaction} from './db.js';
export const identityProof=z.object({mailId:z.number().int().positive().safe(),evidence:mailEvidence,verifiedAt:z.string().datetime()}).strict();

export async function bindCommonMail(c:PoolClient,actor:Principal,sourceId:string,input:unknown){
 const b=identityProof.parse(input),s=await sourceAccess(c,actor,sourceId,true);
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
