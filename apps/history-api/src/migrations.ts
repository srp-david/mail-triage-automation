import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pool,transaction} from './db.js';
const directory=new URL('../migrations/',import.meta.url);
export async function migrateVersioned(){
  const files=(await readdir(directory)).filter(x=>/^\d{3}_[a-z_]+\.sql$/.test(x)).sort();
  return transaction(async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema()||':v1-migration',0))");
    await c.query('CREATE TABLE IF NOT EXISTS schema_migration (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const name of ['000_baseline.sql',...files]){
      const text=await readFile(name==='000_baseline.sql'?new URL('../../../src/migration.sql',import.meta.url):new URL(name,directory),'utf8');
      const hash=createHash('sha256').update(text).digest('hex');
      const prior=(await c.query('SELECT checksum FROM schema_migration WHERE id=$1',[name])).rows[0];
      if(prior){if(prior.checksum!==hash)throw new Error('MIGRATION_CHECKSUM_MISMATCH: '+name);continue;}
      await c.query(text);await c.query('INSERT INTO schema_migration(id,checksum) VALUES($1,$2)',[name,hash]);
    }
  });
}
export async function schemaReady(){
  const files=['000_baseline.sql',...(await readdir(directory)).filter(x=>/^\d{3}_[a-z_]+\.sql$/.test(x))];
  const rows=await transaction(async c=>(await c.query('SELECT id,checksum FROM schema_migration')).rows);
  for(const name of files){
    const content=await readFile(name==='000_baseline.sql'?new URL('../../../src/migration.sql',import.meta.url):new URL(name,directory),'utf8');
    if(!rows.some(row=>row.id===name&&row.checksum===createHash('sha256').update(content).digest('hex')))throw new Error('SCHEMA_NOT_READY');
  }
}
