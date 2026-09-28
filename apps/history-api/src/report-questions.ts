import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError,uuid,resultSchema,type Principal} from '../../../packages/contracts/src/v1.js';
import {transaction} from './db.js';
import {lock,digest,deviceAccess,member} from './directory.js';
import {reportAccess} from './shared-reports.js';
import {reportSnapshot} from './report-collaboration.js';
export class ReportQuestions {
 async start(actor:Principal,reportId:string,input:unknown,device:string){
  const b=z.object({requestId:uuid,runnerId:uuid,agent:z.enum(['codex','claude']),expectedVersion:z.number().int().positive(),question:z.string().trim().min(1).max(20000),allowEvidence:z.boolean()}).strict().parse(input),hash=digest(JSON.stringify({reportId,...b}));
  return transaction(async c=>{await lock(c);const report=await reportAccess(c,actor,reportId,true),runner=await deviceAccess(c,actor,b.runnerId,device),m=await member(c,actor);
   if(!runner.agents.includes(b.agent))throw new ApiError(403,'RUNNER_DENIED');
   await c.query("UPDATE report_question_job SET status='failed' WHERE status='running' AND expires_at<=now()");
   const old=(await c.query('SELECT * FROM report_question_job WHERE id=$1',[b.requestId])).rows[0];
   if(old){if(old.requested_by!==actor.userId||old.request_hash!==hash)throw new ApiError(409,'REQUEST_CONFLICT');return {id:old.id,status:old.status,context:old.context,execute:false};}
   const occupied=(await c.query(`SELECT count(*)::int AS count FROM (
    SELECT v.target_runner_id AS runner_id,s.team_id FROM analysis_run a JOIN v1_run v ON v.run_id=a.id JOIN source s ON s.id=v.source_id WHERE a.status='running'
    UNION ALL SELECT q.runner_id,mem.team_id FROM report_question_job q JOIN membership mem ON mem.user_id=q.requested_by AND mem.active WHERE q.status='running') work WHERE runner_id=$1 OR team_id=$2`,[runner.id,m.team_id])).rows[0];
   if(occupied.count>=2||(await c.query("SELECT 1 FROM report_question_job WHERE runner_id=$1 AND status='running' UNION ALL SELECT 1 FROM v1_run v JOIN analysis_run a ON a.id=v.run_id WHERE v.target_runner_id=$1 AND a.status='running'",[runner.id])).rowCount)throw new ApiError(409,'REPORT_AGENT_BUSY');
   const snapshot=await reportSnapshot(c,reportId,report.result.report);if(snapshot.version!==b.expectedVersion)throw new ApiError(409,'REPORT_VERSION_CONFLICT');
   const messages=(await c.query('SELECT kind,body,evidence FROM report_message WHERE run_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30',[reportId])).rows.reverse();
   const context={report:snapshot.report,version:snapshot.version,hash:snapshot.report_hash,messages};
   if(JSON.stringify(context).length>900000)throw new ApiError(413,'CONVERSATION_TOO_LARGE');
   await c.query("INSERT INTO report_question_job(id,report_id,requested_by,runner_id,agent,allow_evidence,request_hash,context,question,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'running')",[b.requestId,reportId,actor.userId,runner.id,b.agent,b.allowEvidence,hash,JSON.stringify(context),b.question]);
   await c.query("INSERT INTO report_message(id,run_id,author_id,kind,body,request_id,request_hash) VALUES($1,$2,$3,'question',$4,$5,$6)",[randomUUID(),reportId,actor.userId,b.question,b.requestId,hash]);
   return {id:b.requestId,status:'running',context,execute:true};
  });
 }
 async complete(actor:Principal,id:string,input:unknown,device:string){
  const b=z.object({result:resultSchema}).strict().parse(input),hash=digest(JSON.stringify(b.result));
  return transaction(async c=>{await lock(c);const job=(await c.query('SELECT * FROM report_question_job WHERE id=$1 AND requested_by=$2',[id,actor.userId])).rows[0];if(!job)throw new ApiError(404,'QUESTION_NOT_FOUND');
   await deviceAccess(c,actor,job.runner_id,device);await reportAccess(c,actor,job.report_id,true);
   if(job.status==='completed'){if(job.result_hash!==hash)throw new ApiError(409,'RESULT_CONFLICT');return {id,status:'completed'};}
   if(job.status!=='running'||Date.parse(job.expires_at)<=Date.now())throw new ApiError(409,'QUESTION_EXPIRED');
   await c.query("INSERT INTO report_message(id,run_id,author_id,kind,body,evidence,request_id,request_hash) VALUES($1,$2,$3,'answer',$4,$5,$6,$7)",[randomUUID(),job.report_id,actor.userId,b.result.report,JSON.stringify({agent:job.agent,version:job.context.version,allowEvidence:job.allow_evidence,evidence:b.result.evidence}),randomUUID(),hash]);
   await c.query("UPDATE report_question_job SET status='completed',result_hash=$2 WHERE id=$1",[id,hash]);return {id,status:'completed'};
  });
 }
 async fail(actor:Principal,id:string,device:string){return transaction(async c=>{await lock(c);const job=(await c.query('SELECT * FROM report_question_job WHERE id=$1 AND requested_by=$2',[id,actor.userId])).rows[0];if(!job)throw new ApiError(404,'QUESTION_NOT_FOUND');await deviceAccess(c,actor,job.runner_id,device);await c.query("UPDATE report_question_job SET status='failed' WHERE id=$1 AND status='running'",[id]);return {ok:true};});}
}
