import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {ApiError,uuid,type Principal} from '../../../packages/contracts/src/v1.js';
import {transaction} from './db.js';
import {lock,lockShared,digest} from './directory.js';
import {reportAccess} from './shared-reports.js';
export async function reportSnapshot(c:PoolClient,id:string,original:string){
 const current=(await c.query('SELECT r.* FROM report_head h JOIN report_revision r ON r.run_id=h.run_id AND r.version=h.version WHERE h.run_id=$1',[id])).rows[0];
 return current??{version:1,report:original,report_hash:digest(original),author_id:null,change_note:'최초 분석',evidence:''};
}
export class ReportCollaboration {
 async get(actor:Principal,id:string){return transaction(async c=>{await lockShared(c);const r=await reportAccess(c,actor,id),head=await reportSnapshot(c,id,r.result.report);
   const revisions=(await c.query('SELECT version,report_hash AS hash,author_id AS "authorId",change_note AS "changeNote",created_at AS "createdAt" FROM report_revision WHERE run_id=$1 ORDER BY version DESC',[id])).rows;
   const messages=(await c.query(`SELECT m.id,m.kind,m.body,m.evidence,m.author_id AS "authorId",coalesce(u.display_name,u.username,'사용자') AS author,m.created_at AS "createdAt"
     FROM report_message m JOIN app_user u ON u.id=m.author_id WHERE m.run_id=$1 ORDER BY m.created_at,m.id`,[id])).rows;
   return {version:head.version,report:head.report,hash:head.report_hash,canEdit:r.canEdit,revisions:revisions.length?revisions:[{version:1,hash:head.report_hash,authorId:null,changeNote:'최초 분석',createdAt:r.created_at}],messages};
 });}
 async revision(actor:Principal,id:string,version:number){return transaction(async c=>{await lockShared(c);const r=await reportAccess(c,actor,id);
   const revision=(await c.query('SELECT version,report,report_hash AS hash,change_note AS "changeNote",evidence,author_id AS "authorId",created_at AS "createdAt" FROM report_revision WHERE run_id=$1 AND version=$2',[id,version])).rows[0];
   if(revision)return revision;if(version===1)return {version,report:r.result.report,hash:digest(r.result.report),changeNote:'최초 분석',evidence:'',authorId:null,createdAt:r.created_at};throw new ApiError(404,'REVISION_NOT_FOUND');
 });}
 async save(actor:Principal,id:string,input:unknown){
   const b=z.object({requestId:uuid,expectedVersion:z.number().int().positive(),report:z.string().min(1).max(500000),changeNote:z.string().trim().min(1).max(4000),evidence:z.string().max(20000).default('')}).strict().parse(input),hash=digest(JSON.stringify(b));
   return transaction(async c=>{await lock(c);const r=await reportAccess(c,actor,id,true);
     const prior=(await c.query('SELECT run_id,version,author_id,request_hash FROM report_revision WHERE request_id=$1',[b.requestId])).rows[0];
     if(prior){if(prior.run_id!==id||prior.author_id!==actor.userId||prior.request_hash!==hash)throw new ApiError(409,'REQUEST_CONFLICT');return {version:prior.version};}
     const head=await reportSnapshot(c,id,r.result.report);if(head.version!==b.expectedVersion)throw new ApiError(409,'REPORT_VERSION_CONFLICT');
     await c.query("INSERT INTO report_revision(run_id,version,report,report_hash,change_note) VALUES($1,1,$2,$3,'최초 분석') ON CONFLICT DO NOTHING",[id,r.result.report,digest(r.result.report)]);
     const version=head.version+1;
     await c.query('INSERT INTO report_revision(run_id,version,report,report_hash,author_id,change_note,evidence,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,version,b.report,digest(b.report),actor.userId,b.changeNote,b.evidence,b.requestId,hash]);
     await c.query('INSERT INTO report_head(run_id,version) VALUES($1,$2) ON CONFLICT(run_id) DO UPDATE SET version=$2',[id,version]);
     await c.query("INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,'report.revision',$2)",[actor.userId,id]);return {version};
   });
 }
 async message(actor:Principal,id:string,input:unknown){
   const b=z.object({requestId:uuid,kind:z.enum(['question','note','decision','unresolved','reply_draft']),body:z.string().trim().min(1).max(20000),evidence:z.string().max(20000).default('')}).strict().parse(input),hash=digest(JSON.stringify(b));
   return transaction(async c=>{await lock(c);await reportAccess(c,actor,id,true);
     const prior=(await c.query('SELECT id,run_id,author_id,request_hash FROM report_message WHERE request_id=$1',[b.requestId])).rows[0];
     if(prior){if(prior.run_id!==id||prior.author_id!==actor.userId||prior.request_hash!==hash)throw new ApiError(409,'REQUEST_CONFLICT');return {id:prior.id};}
     const messageId=randomUUID();await c.query('INSERT INTO report_message(id,run_id,author_id,kind,body,evidence,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[messageId,id,actor.userId,b.kind,b.body,b.evidence,b.requestId,hash]);return {id:messageId};
   });
 }
}
