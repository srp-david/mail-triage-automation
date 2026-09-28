import type {PoolClient} from 'pg';
import {z} from 'zod';
import {ApiError,type Principal} from '../../../packages/contracts/src/v1.js';
import {transaction} from './db.js';
import {lock,lockShared,member,sourceAccess} from './directory.js';

export async function reportAccess(c:PoolClient,actor:Principal,id:string,write=false){
 const membership=await member(c,actor);
 const row=(await c.query(`SELECT r.id,r.status,r.created_at,m.subject,s.owner_user_id,s.id AS source_id,
   p.result,sh.permission,u.display_name,u.username,v.requested_by,
   (s.owner_user_id=$2 OR acl.user_id IS NOT NULL) AS source_read,
   (s.owner_user_id=$2 OR acl.can_write) AS source_write
   FROM analysis_run r JOIN report_version p ON p.run_id=r.id JOIN mail_identity m ON m.id=r.mail_key
   JOIN source s ON s.store_id=m.store_id AND s.active
   JOIN membership own ON own.user_id=s.owner_user_id AND own.team_id=s.team_id AND own.active
   JOIN app_user owner_user ON owner_user.id=s.owner_user_id AND owner_user.active
   LEFT JOIN source_access acl ON acl.source_id=s.id AND acl.user_id=$2
   LEFT JOIN report_share sh ON sh.run_id=r.id AND sh.team_id=s.team_id
   LEFT JOIN v1_run v ON v.run_id=r.id LEFT JOIN app_user u ON u.id=v.requested_by
   WHERE r.id=$1 AND s.team_id=$3`,[id,actor.userId,membership.team_id])).rows[0];
 if(!row||!(row.source_read||row.permission)||write&&(membership.role==='viewer'||!(row.source_write||row.permission==='write')))throw new ApiError(404,'REPORT_NOT_FOUND');
 return {...row,canEdit:membership.role!=='viewer'&&!!(row.source_write||row.permission==='write'),canShare:row.owner_user_id===actor.userId&&membership.role!=='viewer'};
}
export class SharedReports {
 async get(actor:Principal,id:string){return transaction(async c=>{await lockShared(c);const r=await reportAccess(c,actor,id);
   return {id:r.id,subject:r.subject,status:r.status,createdAt:r.created_at,author:r.display_name??r.username??'이전 분석',report:r.result.report,permission:r.permission??'none',canEdit:r.canEdit,canShare:r.canShare};
 });}
 async share(actor:Principal,id:string,input:unknown){
   const b=z.object({permission:z.enum(['none','read','write'])}).strict().parse(input);
   return transaction(async c=>{await lock(c);const r=await reportAccess(c,actor,id);if(!r.canShare)throw new ApiError(403,'OWNER_REQUIRED');const m=await member(c,actor);
     if(b.permission==='none')await c.query('DELETE FROM report_share WHERE run_id=$1',[id]);
     else await c.query('INSERT INTO report_share(run_id,team_id,permission,published_by) VALUES($1,$2,$3,$4) ON CONFLICT(run_id) DO UPDATE SET permission=$3,published_by=$4,published_at=now()',[id,m.team_id,b.permission,actor.userId]);
     await c.query("INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,'report.share.'||$2,$3)",[actor.userId,b.permission,id]);return {ok:true};
   });
 }
 async list(actor:Principal,sourceId:string,mailId:number){return transaction(async c=>{await lockShared(c);const s=await sourceAccess(c,actor,sourceId);
   return (await c.query(`SELECT r.id,m.subject,r.created_at AS "createdAt",r.status,sh.permission,
     coalesce(u.display_name,u.username,'이전 분석') AS author
     FROM mail_identity local JOIN common_mail_link ll ON ll.mail_key=local.id
     JOIN common_mail_link other ON other.common_id=ll.common_id
     JOIN mail_identity m ON m.id=other.mail_key JOIN source origin ON origin.store_id=m.store_id AND origin.active AND origin.team_id=$3
     JOIN membership own ON own.user_id=origin.owner_user_id AND own.team_id=$3 AND own.active
     JOIN app_user owner_user ON owner_user.id=origin.owner_user_id AND owner_user.active
     JOIN analysis_run r ON r.mail_key=m.id JOIN report_share sh ON sh.run_id=r.id AND sh.team_id=$3
     LEFT JOIN v1_run v ON v.run_id=r.id LEFT JOIN app_user u ON u.id=v.requested_by
     WHERE local.store_id=$1 AND local.mail_id=$2 ORDER BY r.created_at DESC,r.id LIMIT 100`,[s.store_id,mailId,s.team_id])).rows;
 });}
}
