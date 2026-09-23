import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const planSchema=z.object({actorId:uuid,teamId:uuid,sources:z.array(z.object({sourceId:uuid,storeId:z.string().min(1).max(120)}).strict()).max(100),documents:z.array(z.object({documentId:uuid,collectionId:uuid,sourceHash:hash}).strict()).max(10000)}).strict();
const historical=['mail_identity','analysis_run','report_version','review','sync_run','legacy_document','legacy_link','related_mail','knowledge_proposal','manual_thread_link'];
const digest=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function snapshots(c:PoolClient){
  const result:Record<string,unknown>={};
  for(const table of historical)result[table]=(await c.query(`SELECT count(*)::int AS count,encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS hash FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${table} t) x`)).rows[0];
  return result;
}
// Operator-only migration connection; never mounted on the runtime HTTP API.
export async function mapLegacy(c:PoolClient,input:unknown,confirm?:string){
  const plan=planSchema.parse(input);
  if(!plan.sources.length&&!plan.documents.length)throw new Error('EMPTY_MAPPING');
  for(const ids of [plan.sources.map(s=>s.sourceId),plan.sources.map(s=>s.storeId),plan.documents.map(d=>d.documentId)])if(new Set(ids).size!==ids.length)throw new Error('DUPLICATE_MAPPING');
  await c.query('BEGIN');
  try{
    await c.query('SET LOCAL lock_timeout = \'5s\'');
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':v1-write',0))");
    // v0 writers do not use the v1 lock. Freeze all affected tables for this short transaction.
    await c.query('LOCK TABLE '+[...historical,'source','source_access','legacy_collection','legacy_collection_access','legacy_collection_document','membership','app_user'].join(',')+' IN SHARE MODE');
    if(!(await c.query("SELECT 1 FROM membership m JOIN app_user u ON u.id=m.user_id WHERE m.user_id=$1 AND m.team_id=$2 AND m.active AND u.active AND m.role='admin'",[plan.actorId,plan.teamId])).rowCount)throw new Error('MAPPING_ADMIN_REQUIRED');
    if((await c.query("SELECT 1 FROM analysis_run WHERE status IN ('queued','running') UNION ALL SELECT 1 FROM sync_run WHERE status IN ('queued','running','retrying') LIMIT 1")).rowCount)throw new Error('WRITERS_NOT_QUIESCENT');
    const bindings:unknown[]=[];
    for(const item of plan.sources){
      const s=(await c.query('SELECT s.* FROM source s JOIN membership m ON m.user_id=s.owner_user_id AND m.team_id=s.team_id JOIN app_user u ON u.id=m.user_id WHERE s.id=$1 AND s.team_id=$2 AND s.active AND m.active AND u.active',[item.sourceId,plan.teamId])).rows[0];
      if(!s)throw new Error('SOURCE_MAPPING_DENIED');
      if((await c.query('SELECT 1 FROM source_access WHERE source_id=$1',[s.id])).rowCount)throw new Error('PRIVATE_SOURCE_REQUIRED');
      if(s.store_id!==item.storeId&&(await c.query('SELECT 1 FROM mail_identity WHERE store_id=$1 UNION ALL SELECT 1 FROM manual_thread_link WHERE store_id=$1 UNION ALL SELECT 1 FROM related_mail WHERE store_id=$1 LIMIT 1',[s.store_id])).rowCount)throw new Error('TARGET_SOURCE_NOT_EMPTY');
      if((await c.query('SELECT 1 FROM source WHERE store_id=$1 AND id<>$2',[item.storeId,s.id])).rowCount)throw new Error('STORE_ALREADY_MAPPED');
      if(!(await c.query('SELECT 1 FROM mail_identity WHERE store_id=$1 LIMIT 1',[item.storeId])).rowCount)throw new Error('LEGACY_STORE_NOT_FOUND');
      bindings.push(s);
    }
    for(const item of plan.documents){
      const d=(await c.query('SELECT d.source_hash,cd.collection_id FROM legacy_document d LEFT JOIN legacy_collection_document cd ON cd.document_id=d.id WHERE d.id=$1',[item.documentId])).rows[0];
      if(!d||d.source_hash!==item.sourceHash||d.collection_id&&d.collection_id!==item.collectionId)throw new Error('DOCUMENT_MAPPING_CONFLICT');
      const collection=(await c.query('SELECT lc.* FROM legacy_collection lc JOIN membership m ON m.user_id=lc.owner_user_id JOIN app_user u ON u.id=m.user_id WHERE lc.id=$1 AND m.team_id=$2 AND m.active AND u.active',[item.collectionId,plan.teamId])).rows[0];
      if(!collection||(await c.query('SELECT 1 FROM legacy_collection_access WHERE collection_id=$1',[item.collectionId])).rowCount)throw new Error('PRIVATE_COLLECTION_REQUIRED');
      bindings.push({documentId:item.documentId,...d,collection});
    }
    const before=await snapshots(c),preview={plan,bindings,historical:before},previewHash=digest(preview);
    if(confirm){
      if(confirm!==previewHash)throw new Error('MAPPING_PREVIEW_CHANGED');
      for(const s of plan.sources)await c.query('UPDATE source SET store_id=$2 WHERE id=$1',[s.sourceId,s.storeId]);
      for(const d of plan.documents)await c.query('INSERT INTO legacy_collection_document(collection_id,document_id) VALUES($1,$2) ON CONFLICT(document_id) DO NOTHING',[d.collectionId,d.documentId]);
      if(digest(await snapshots(c))!==digest(before))throw new Error('HISTORICAL_DATA_CHANGED');
      await c.query("INSERT INTO audit_event(actor_id,action) VALUES($1,'migration.mapping')",[plan.actorId]);
    }
    await c.query('COMMIT');return {applied:!!confirm,previewHash,sourceCount:plan.sources.length,documentCount:plan.documents.length,historical:before};
  }catch(error){await c.query('ROLLBACK');throw error;}
}
