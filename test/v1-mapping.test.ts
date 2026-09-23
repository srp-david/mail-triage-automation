import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mapLegacy} from '../apps/history-api/src/mapping.js';
process.env.NODE_ENV='test';
const schema='triage_test_'+randomUUID().replaceAll('-',''),role='triage_role_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw new Error('Dedicated test database required');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool}=await import('../apps/history-api/src/db.js');const {migrateVersioned}=await import('../apps/history-api/src/migrations.js');await migrateVersioned();
const {Directory}=await import('../apps/history-api/src/directory.js'),{SharedArchive}=await import('../apps/history-api/src/shared-archive.js');
const team=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[team,'Synthetic']);const directory=new Directory(team,'mapper'),actor=await directory.login({issuer:'https://test/',subject:'mapper',email:'mapping@example.test'});
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.query('DROP OWNED BY '+role).catch(()=>{});await admin.query('DROP ROLE IF EXISTS '+role);await admin.end();});
test('explicit mapping requires unchanged preview and preserves all historical content and unresolved links',async()=>{
  const source=await directory.registerSource(actor,{instanceId:randomUUID(),displayName:'Private migration'}),collection=await new SharedArchive().create(actor,{requestId:randomUUID(),name:'Private archive'});
  const mail=randomUUID(),doc=randomUUID(),body='Synthetic unmapped report',hash=createHash('sha256').update(body).digest('hex');
  await pool.query("INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,'old-store',1,'<old@fixture>','Synthetic')",[mail]);
  await pool.query("INSERT INTO legacy_document(id,namespace,source_path,source_hash,kind,body) VALUES($1,'old','report.md',$2,'report',$3)",[doc,hash,body]);
  const plan={actorId:actor.userId,teamId:team,sources:[{sourceId:source.id,storeId:'old-store'}],documents:[{documentId:doc,collectionId:collection.id,sourceHash:hash}]};
  const c=await pool.connect();try{
    const preview=await mapLegacy(c,plan);assert.equal(preview.applied,false);assert.equal((await pool.query('SELECT store_id FROM source WHERE id=$1',[source.id])).rows[0].store_id,source.id);
    const syncId=randomUUID();await pool.query("INSERT INTO sync_run(id,status) VALUES($1,'queued')",[syncId]);await assert.rejects(mapLegacy(c,plan),/WRITERS_NOT_QUIESCENT/);await pool.query('DELETE FROM sync_run WHERE id=$1',[syncId]);
    await pool.query("UPDATE mail_identity SET subject='Changed preview' WHERE id=$1",[mail]);await assert.rejects(mapLegacy(c,plan,preview.previewHash),/MAPPING_PREVIEW_CHANGED/);
    const current=await mapLegacy(c,plan),applied=await mapLegacy(c,plan,current.previewHash);assert.deepEqual(applied.historical,current.historical);
    assert.equal((await pool.query('SELECT store_id FROM source WHERE id=$1',[source.id])).rows[0].store_id,'old-store');assert.equal((await pool.query('SELECT * FROM legacy_link WHERE document_id=$1',[doc])).rowCount,0);
    assert.equal((await new SharedArchive().get(actor,doc)).body,body);
    await assert.rejects(mapLegacy(c,{...plan,documents:[{...plan.documents[0],sourceHash:'0'.repeat(64)}]}),/DOCUMENT_MAPPING_CONFLICT/);
  }finally{c.release();}
});
test('runtime grants allow application DML but reject DDL and migration ledger writes',async()=>{
  await admin.query('CREATE ROLE '+role+' NOLOGIN');
  const database=(await admin.query('SELECT current_database() AS name')).rows[0].name;assert.match(database,/^[a-zA-Z0-9_]+$/);
  const sql=(await readFile(new URL('../deploy/runtime-grants.sql',import.meta.url),'utf8')).replaceAll('triage_runtime',role).replace('DATABASE triage','DATABASE '+database).replaceAll('SCHEMA public','SCHEMA '+schema);
  const c=await pool.connect();try{
    await c.query(sql);await c.query('SET ROLE '+role);
    assert.ok((await c.query('SELECT * FROM source')).rowCount);await c.query("INSERT INTO audit_event(actor_id,action) VALUES($1,'synthetic.runtime')",[actor.userId]);
    await assert.rejects(c.query('CREATE TABLE prohibited(id int)'),/permission denied/);
    await assert.rejects(c.query("UPDATE schema_migration SET checksum='changed'"),/permission denied/);
    await assert.rejects(c.query('ALTER TABLE source ADD COLUMN prohibited text'),/must be owner/);
    await assert.rejects(c.query('DELETE FROM audit_event'),/permission denied/);
    await assert.rejects(c.query('UPDATE report_version SET result=result'),/permission denied/);
    await assert.rejects(c.query('DELETE FROM analysis_run'),/permission denied/);
  }finally{await c.query('RESET ROLE');c.release();}
});
