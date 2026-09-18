import {createHash} from 'node:crypto';
import pg from 'pg';
const [command,database='triage']=process.argv.slice(2);
if(!['triage','restored'].includes(database))throw new Error('Invalid fixture database');
const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;process.env.DATABASE_URL=url.toString();
if(command==='migrate'){
  const {migrateVersioned,schemaReady}=await import('../apps/history-api/src/migrations.ts');await migrateVersioned();await schemaReady();
  const {pool}=await import('../apps/history-api/src/db.ts');await pool.end();console.log(JSON.stringify({migrated:true}));
}else{
  const db=new pg.Client({connectionString:process.env.DATABASE_URL});await db.connect();
  try{
    const tables=['mail_identity','analysis_run','report_version','review','sync_run','worker_state','related_mail','legacy_document','legacy_link','knowledge_proposal','manual_thread_link'];
    const output={};
    for(const table of tables){
      const rows=(await db.query(`SELECT to_jsonb(t)::text AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
      output[table]={count:rows.length,hash:createHash('sha256').update(rows.map(r=>r.value).join('\n')).digest('hex')};
    }
    console.log(JSON.stringify(output));
  }finally{await db.end();}
}
