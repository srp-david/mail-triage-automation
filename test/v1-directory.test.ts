import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
process.env.NODE_ENV='test';
const schema='triage_test_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw new Error('Dedicated test database required');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);
process.env.PGOPTIONS='-c search_path='+schema;
const {pool}=await import('../apps/history-api/src/db.js');
const {migrateVersioned,schemaReady}=await import('../apps/history-api/src/migrations.js');
const {Directory,sourceAccess,deviceAccess}=await import('../apps/history-api/src/directory.js');
await migrateVersioned();
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
test('numbered migrations replay safely and detect changed ledger',async()=>{
  await migrateVersioned();await schemaReady();
  await pool.query("UPDATE schema_migration SET checksum='changed' WHERE id='001_identity.sql'");
  await assert.rejects(migrateVersioned(),/CHECKSUM/);await assert.rejects(schemaReady(),/SCHEMA/);
  const {readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
  const hash=createHash('sha256').update(await readFile(new URL('../apps/history-api/migrations/001_identity.sql',import.meta.url))).digest('hex');
  await pool.query("UPDATE schema_migration SET checksum=$1 WHERE id='001_identity.sql'",[hash]);
});
test('private sources, same instance conflicts, grants, revoked devices and disabled users fail closed',async()=>{
  const team=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[team,'Synthetic']);
  const dir=new Directory(team,'admin');
  const login=(subject:string)=>dir.login({issuer:'https://fixture.test/',subject,email:subject+'@company.test'});
  const a=await login('admin'),b=await login('analyst');
  const instanceId=randomUUID(),source=await dir.registerSource(a,{instanceId,displayName:'Private'});
  assert.deepEqual(await dir.sources(b),[]);
  await assert.rejects(dir.registerSource(b,{instanceId,displayName:'Hijack'}),/SOURCE_NOT_FOUND/);
  await dir.grant(a,source.id,{userId:b.userId,permission:'read'});assert.equal((await dir.sources(b)).length,1);
  const c=await pool.connect();
  try{await assert.rejects(sourceAccess(c,b,source.id,true),/SOURCE_NOT_FOUND/);}finally{c.release();}
  await dir.grant(a,source.id,{userId:b.userId,permission:'write'});
  const runner=await dir.registerRunner(b,{requestId:randomUUID(),displayName:'PC B',agents:['claude'],sourceIds:[source.id]});
  const connection=await pool.connect();try{await deviceAccess(connection,b,runner.id,runner.credential);await assert.rejects(deviceAccess(connection,a,runner.id,runner.credential),/RUNNER_DENIED/);}finally{connection.release();}
  await dir.revoke(b,runner.id);
  const revoked=await pool.connect();try{await assert.rejects(deviceAccess(revoked,b,runner.id,runner.credential),/RUNNER_DENIED/);}finally{revoked.release();}
  await dir.disable(a,b.userId);await assert.rejects(login('analyst'),/MEMBERSHIP_DISABLED/);
  assert.equal((await pool.query('SELECT count(*) FROM legacy_collection_document')).rows[0].count,'0');
});
