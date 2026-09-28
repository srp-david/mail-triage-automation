import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {uuid} from '../../../packages/contracts/src/v1.js';
import {mailEvidence} from '../../../packages/contracts/src/mail-identity.js';
import {bindCommonMail} from './common-mail.js';
import {lock,digest} from './directory.js';
export const historyTables=['mail_identity','analysis_run','report_version','review','legacy_document','legacy_link','related_mail','manual_thread_link','knowledge_proposal'] as const;
const row=z.record(z.string(),z.unknown());
export const historyBundle=z.object({format:z.literal(1),tables:z.object(Object.fromEntries(historyTables.map(name=>[name,z.array(row).max(100000)])) as Record<typeof historyTables[number],z.ZodArray<typeof row>>).strict()}).strict();
const planSchema=z.object({ownerId:uuid,teamId:uuid,collectionId:uuid,permission:z.enum(['read','write']),sources:z.array(z.object({storeId:z.string().min(1).max(120),sourceId:uuid,instanceId:uuid,displayName:z.string().min(1).max(200)}).strict()).min(1),proofs:z.array(z.object({storeId:z.string(),mailId:z.number().int().positive().safe(),evidence:mailEvidence}).strict()).max(100000)}).strict();
function canonical(x:any):string{return JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);}
function stableId(value:string){const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
// Operator only. Uses a migration connection; never mounted as a runtime endpoint.
export async function importHistory(c:PoolClient,input:unknown,options:unknown,confirm?:string){
 const bundle=historyBundle.parse(input),plan=planSchema.parse(options);
 if(new Set(plan.sources.map(s=>s.storeId)).size!==plan.sources.length||new Set(plan.sources.map(s=>s.sourceId)).size!==plan.sources.length)throw Error('DUPLICATE_SOURCE_MAPPING');
 if(bundle.tables.analysis_run.some(r=>['queued','running'].includes(String(r.status)))||bundle.tables.knowledge_proposal.some(r=>r.status==='applying'))throw Error('SOURCE_WRITERS_ACTIVE');
 if(bundle.tables.mail_identity.some(r=>!plan.sources.some(s=>s.storeId===r.store_id)))throw Error('UNMAPPED_SOURCE');
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await lock(c);
  await c.query('LOCK TABLE '+historyTables.join(',')+' IN SHARE ROW EXCLUSIVE MODE');
  const owner=(await c.query('SELECT u.id,u.active,m.role,m.active AS member_active FROM app_user u JOIN membership m ON m.user_id=u.id WHERE u.id=$1 AND m.team_id=$2',[plan.ownerId,plan.teamId])).rows[0];
  if(!owner?.active||!owner.member_active||owner.role!=='admin')throw Error('IMPORT_OWNER_REQUIRED');
  const existingSources=(await c.query('SELECT id,store_id,owner_user_id,team_id,instance_id FROM source WHERE id=ANY($1::uuid[]) OR store_id=ANY($2::text[])',[plan.sources.map(s=>s.sourceId),plan.sources.map(s=>s.storeId)])).rows;
  for(const source of existingSources)if(!plan.sources.some(s=>s.sourceId===source.id&&s.storeId===source.store_id&&s.instanceId===source.instance_id&&source.owner_user_id===plan.ownerId&&source.team_id===plan.teamId))throw Error('SOURCE_MAPPING_CONFLICT');
  const collection=(await c.query('SELECT owner_user_id FROM legacy_collection WHERE id=$1',[plan.collectionId])).rows[0];if(collection&&collection.owner_user_id!==plan.ownerId)throw Error('COLLECTION_MAPPING_CONFLICT');
  const pending:Record<string,any[]>={},counts:Record<string,{total:number;insert:number}>={};
  for(const table of historyTables){
   const columns=(await c.query('SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',[table])).rows.map(r=>r.column_name);
   const key=table==='report_version'?'run_id':table==='legacy_link'?'document_id':'id';pending[table]=[];
   if(new Set(bundle.tables[table].map(r=>r[key])).size!==bundle.tables[table].length)throw Error('DUPLICATE_RECORD');
   for(const value of bundle.tables[table]){
    if(!uuid.safeParse(value[key]).success||Object.keys(value).some(k=>!columns.includes(k)))throw Error('INVALID_HISTORY_RECORD');
    const previous=(await c.query(`SELECT to_jsonb(t) AS value FROM ${table} t WHERE ${key}=$1`,[value[key]])).rows[0]?.value;
    if(previous){const selected=Object.fromEntries(Object.keys(value).map(k=>[k,previous[k]]));if(canonical(selected)!==canonical(value))throw Error('HISTORY_RECORD_CONFLICT');}
    else pending[table].push(value);
   }
   counts[table]={total:bundle.tables[table].length,insert:pending[table].length};
  }
  const previewHash=digest(canonical({bundle,plan,counts,existingSources,collection:collection??null,owner}));
  const preview={previewHash,counts,proofs:plan.proofs.length,unlinkedDocuments:bundle.tables.legacy_document.filter(d=>!bundle.tables.legacy_link.some(l=>l.document_id===d.id)).length};
  if(!confirm){await c.query('ROLLBACK');return {...preview,applied:false};}
  if(confirm!==previewHash)throw Error('IMPORT_PREVIEW_CHANGED');
  for(const s of plan.sources)await c.query('INSERT INTO source(id,team_id,owner_user_id,instance_id,display_name,store_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[s.sourceId,plan.teamId,plan.ownerId,s.instanceId,s.displayName,s.storeId]);
  await c.query("INSERT INTO legacy_collection(id,owner_user_id,name) VALUES($1,$2,'이관한 기존 분석') ON CONFLICT(id) DO NOTHING",[plan.collectionId,plan.ownerId]);
  for(const table of historyTables)if(pending[table].length)await c.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(pending[table])]);
  for(const d of bundle.tables.legacy_document)await c.query('INSERT INTO legacy_collection_document(collection_id,document_id) VALUES($1,$2) ON CONFLICT(document_id) DO NOTHING',[plan.collectionId,d.id]);
  const sharedIds=bundle.tables.report_version.map(r=>r.run_id);
  // Linked Markdown reports get a reproducible analysis wrapper; original documents stay intact.
  for(const d of bundle.tables.legacy_document.filter(d=>d.kind==='report')){
   const link=bundle.tables.legacy_link.find(l=>l.document_id===d.id);if(!link)continue;
   const id=stableId('legacy-report:'+d.id),requestId=stableId('legacy-request:'+d.id);
   const existing=(await c.query('SELECT p.result FROM report_version p WHERE run_id=$1',[id])).rows[0];
   if(existing&&existing.result.report!==d.body)throw Error('LEGACY_WRAPPER_CONFLICT');
   await c.query("INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status,created_at,finished_at) VALUES($1,$2,'direct',$3,$4,'completed',$5,$5) ON CONFLICT(id) DO NOTHING",[id,link.mail_key,requestId,digest(String(d.body)),d.imported_at]);
   await c.query('INSERT INTO report_version(run_id,result,created_at) VALUES($1,$2,$3) ON CONFLICT(run_id) DO NOTHING',[id,JSON.stringify({outcome:'completed',project:'unknown',report:d.body,question:'',knowledge:'',evidence:[]}),d.imported_at]);sharedIds.push(id);
  }
  for(const proof of plan.proofs){const source=plan.sources.find(s=>s.storeId===proof.storeId);if(!source)throw Error('PROOF_SOURCE_MISMATCH');await bindCommonMail(c,{userId:plan.ownerId},source.sourceId,{mailId:proof.mailId,evidence:proof.evidence,verifiedAt:new Date().toISOString()});}
  for(const id of sharedIds)await c.query('INSERT INTO report_share(run_id,team_id,permission,published_by) VALUES($1,$2,$3,$4) ON CONFLICT(run_id) DO NOTHING',[id,plan.teamId,plan.permission,plan.ownerId]);
  for(const mail of bundle.tables.mail_identity)if(mail.handled_at)await c.query('INSERT INTO personal_mail_handling(mail_key,user_id,handled_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[mail.id,plan.ownerId,mail.handled_at]);
  await c.query("INSERT INTO audit_event(actor_id,action) VALUES($1,'history.import')",[plan.ownerId]);
  await c.query('COMMIT');return {...preview,applied:true,sharedReports:sharedIds.length};
 }catch(error){await c.query('ROLLBACK');throw error;}
}
