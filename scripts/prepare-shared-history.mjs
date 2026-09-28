// Rehearse in a disposable database and emit an atomic, reviewable operator SQL file.
// The output contains private reports: use a protected, Git-ignored directory.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {testDatabase} from './test-database.mjs';
const [bundlePath,planPath,output]=process.argv.slice(2);
if(!bundlePath||!planPath||!output)throw Error('Usage: node --import tsx scripts/prepare-shared-history.mjs BUNDLE PLAN OUTPUT_SQL');
const bundle=JSON.parse(await readFile(bundlePath,'utf8')),plan=JSON.parse(await readFile(planPath,'utf8'));
const hash=createHash('sha256').update(JSON.stringify({bundle,plan})).digest('hex'),quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const db=await testDatabase();process.env.DATABASE_URL=db.url;process.env.HISTORY_SCHEMA='triage_private';
let pool;
try{
 ({pool}=await import('../apps/history-api/src/db.ts'));const c=await pool.connect();
 try{
  await c.query('CREATE SCHEMA triage_private');await c.query('SET search_path TO triage_private');
  const {migrateVersioned}=await import('../apps/history-api/src/migrations.ts');await migrateVersioned();
  await c.query('INSERT INTO team VALUES($1,$2)',[plan.teamId,'Rehearsal']);
  await c.query("INSERT INTO app_user(id,issuer,subject,email) VALUES($1,'rehearsal','rehearsal','rehearsal@example.test')",[plan.ownerId]);
  await c.query("INSERT INTO membership VALUES($1,$2,'admin',true)",[plan.ownerId,plan.teamId]);
  const {importHistory}=await import('../apps/history-api/src/import-history.ts');
  const preview=await importHistory(c,bundle,plan),applied=await importHistory(c,bundle,plan,preview.previewHash);
  const retry=await importHistory(c,bundle,plan);assert.ok(Object.values(retry.counts).every(x=>x.insert===0));
  for(const original of bundle.tables.report_version)assert.deepEqual((await c.query('SELECT result FROM report_version WHERE run_id=$1',[original.run_id])).rows[0].result,original.result);
  const order=['source','legacy_collection','common_mail','mail_identity','common_mail_link','analysis_run','report_version','review','legacy_document','legacy_link','related_mail','manual_thread_link','knowledge_proposal','legacy_collection_document','report_share','personal_mail_handling'];
  const data={};for(const table of order)data[table]=(await c.query(`SELECT to_jsonb(t) AS value FROM ${table} t`)).rows.map(r=>r.value);
  let sql="BEGIN;\nSET LOCAL search_path TO triage_private;\nSET LOCAL lock_timeout='5s';\nSELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':v1-migration',0));\nSELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':v1-write',0));\n";
  sql+="DO $guard$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE id='005_username_auth.sql') THEN RAISE EXCEPTION 'EXPECTED_EXISTING_HOSTED_SCHEMA'; END IF; END $guard$;\n";
  for(const name of ['000_baseline.sql',...(await readdir('apps/history-api/migrations')).filter(x=>/^\d{3}_[a-z_]+\.sql$/.test(x)).sort()]){
   const content=await readFile(name==='000_baseline.sql'?'src/migration.sql':'apps/history-api/migrations/'+name,'utf8'),checksum=createHash('sha256').update(content).digest('hex');
   sql+=`DO $migration$ BEGIN IF EXISTS(SELECT 1 FROM schema_migration WHERE id=${quote(name)}) THEN IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE id=${quote(name)} AND checksum=${quote(checksum)}) THEN RAISE EXCEPTION 'MIGRATION_CHECKSUM_MISMATCH'; END IF; ELSE\n${content}\nINSERT INTO schema_migration(id,checksum) VALUES(${quote(name)},${quote(checksum)}); END IF; END $migration$;\n`;
  }
  sql+=await readFile('deploy/supabase/private-grants.sql','utf8');sql+='\nSET LOCAL search_path TO triage_private;\n';
  sql+=`DO $import$ BEGIN
   IF EXISTS(SELECT 1 FROM audit_event WHERE action=${quote('history.import.'+hash)}) THEN RETURN; END IF;
   IF NOT EXISTS(SELECT 1 FROM app_user u JOIN membership m ON m.user_id=u.id WHERE u.id=${quote(plan.ownerId)} AND m.team_id=${quote(plan.teamId)} AND u.active AND m.active AND m.role='admin') THEN RAISE EXCEPTION 'IMPORT_OWNER_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM analysis_run WHERE status IN ('queued','running')) THEN RAISE EXCEPTION 'TARGET_WRITERS_ACTIVE'; END IF;
  `;
  for(const table of order)if(data[table].length)sql+=`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},${quote(JSON.stringify(data[table]))}::jsonb);\n`;
  sql+=`INSERT INTO audit_event(actor_id,action) VALUES(${quote(plan.ownerId)},${quote('history.import.'+hash)}); END $import$;\nCOMMIT;\n`;
  // Execute the exact generated SQL twice against an existing, empty compatible deployment.
  await c.query('CREATE SCHEMA verify_import');
  // Use a separate database so explicit private-schema grants are also tested.
  await c.query('CREATE DATABASE verify_import');
  const pg=await import('pg'),url=new URL(db.url);url.pathname='/verify_import';const verify=new pg.default.Client({connectionString:url.href});await verify.connect();
  try{
   await verify.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE triage_runtime; CREATE SCHEMA triage_private; SET search_path TO triage_private');
   const base=await readFile('src/migration.sql','utf8');await verify.query(base);await verify.query('CREATE TABLE schema_migration(id text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz DEFAULT now())');
   const files=['000_baseline.sql',...(await readdir('apps/history-api/migrations')).filter(x=>/^00[1-5]_/.test(x)).sort()];
   for(const name of files){const content=name==='000_baseline.sql'?base:await readFile('apps/history-api/migrations/'+name,'utf8');if(name!=='000_baseline.sql')await verify.query(content);await verify.query('INSERT INTO schema_migration(id,checksum) VALUES($1,$2)',[name,createHash('sha256').update(content).digest('hex')]);}
   await verify.query('INSERT INTO team VALUES($1,$2)',[plan.teamId,'Rehearsal']);await verify.query("INSERT INTO app_user(id,issuer,subject,email) VALUES($1,'rehearsal','rehearsal','rehearsal@example.test')",[plan.ownerId]);await verify.query("INSERT INTO membership VALUES($1,$2,'admin',true)",[plan.ownerId,plan.teamId]);
   await verify.query(sql);await verify.query(sql);
   for(const table of order)assert.equal((await verify.query('SELECT count(*)::int AS n FROM triage_private.'+table)).rows[0].n,data[table].length);
  }finally{await verify.end();}
  await writeFile(output,sql,{mode:0o600});
  const result={ok:true,importHash:hash,sqlHash:createHash('sha256').update(sql).digest('hex'),sharedReports:applied.sharedReports,unlinkedDocuments:applied.unlinkedDocuments,counts:Object.fromEntries(order.map(t=>[t,data[t].length])),originalReportsPreserved:true,replayVerified:true};
  await writeFile(output+'.summary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{c.release();}
}catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'PREPARE_IMPORT_FAILED');process.exitCode=1;}finally{await pool?.end();await db.close();}
