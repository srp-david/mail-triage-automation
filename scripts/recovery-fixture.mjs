// Runs only inside the isolated recovery Compose project. No mail/ERP/MCP calls.
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
const [command,label='kill']=process.argv.slice(2);
if(process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('recovery-fixture-only@db:'))throw new Error('Isolated recovery fixture only');
const {pool,migrate}=await import('../dist/db.js');
const h=await import('../dist/history.js'),a=await import('../dist/archive.js');
const result={outcome:'completed',project:'unknown',report:'Restore fixture report',question:'',knowledge:'',evidence:[]};
const input=id=>({storeId:'recovery-fixture',mailId:id,messageId:'<recovery-'+id+'@example.test>',subject:'Synthetic recovery',source:'direct',requestId:randomUUID()});
try{
 if(command==='seed'){
   await migrate();await pool.query('CREATE TABLE recovery_fixture (label text PRIMARY KEY, payload jsonb NOT NULL)');
   const run=await h.startRun(input(1));await h.finishRun(run.id,run.ownerToken,result);
   await a.importLegacy({namespace:'fixture',path:'erp/gg/reports/fixture.md',body:'Original legacy fixture',hash:h.digest('Original legacy fixture'),kind:'report'});
   console.log(JSON.stringify({seeded:true}));
 }else if(command==='compare'){
   const other=new pg.Client({connectionString:process.env.DATABASE_URL.replace(/\/triage$/,'/restored')});await other.connect();
   try{
     const tables=['mail_identity','analysis_run','report_version','review','legacy_document','legacy_link','knowledge_proposal'];
     let rows=0;
     for(const table of tables){
       const sql='SELECT to_jsonb(t) AS value FROM '+table+' t ORDER BY to_jsonb(t)::text';
       const one=(await pool.query(sql)).rows,two=(await other.query(sql)).rows;
       const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
       if(hash(one)!==hash(two))throw new Error('Backup mismatch: '+table);rows+=one.length;
     }
     console.log(JSON.stringify({backupRestoreMatch:true,tables:tables.length,rows}));
   }finally{await other.end();}
 }else if(command==='hold'){
   const lock=await pool.connect();lock.on('error',()=>process.exit(23));
   if(!(await lock.query('SELECT pg_try_advisory_lock(702603) AS locked')).rows[0].locked)throw new Error('Fixture worker lock unavailable');
   const base=label==='kill'?10:20;
   const queued=await h.startRun({...input(base),source:'web'});const active=await h.claimRun();
   const pending=await h.startRun({...input(base+1),source:'web'});
   const syncId=randomUUID();await pool.query("INSERT INTO sync_run(id,status) VALUES($1,'running')",[syncId]);
   await pool.query('INSERT INTO recovery_fixture(label,payload) VALUES($1,$2)',[label,JSON.stringify({active,pending,syncId})]);
   console.log(JSON.stringify({holding:true,label}));await new Promise(()=>{});
 }else if(command==='ready'){
   const row=(await pool.query('SELECT label FROM recovery_fixture WHERE label=$1',[label])).rows[0];
   if(!row)process.exitCode=2;else console.log(JSON.stringify({ready:true,label}));
 }else if(command==='recover'){
   const fixture=(await pool.query('SELECT payload FROM recovery_fixture WHERE label=$1',[label])).rows[0].payload;
   const lock=await pool.connect();
   if(!(await lock.query('SELECT pg_try_advisory_lock(702603) AS locked')).rows[0].locked)throw new Error('Singleton lock was not released');
   await lock.query('SELECT pg_advisory_unlock(702603)');lock.release();
   // Advance only this synthetic lease, so the test does not wait the production 15 minutes.
   await pool.query("UPDATE analysis_run SET lease_until=now()-interval '1 second' WHERE id=$1",[fixture.active.id]);await h.expireRuns();
   let staleRejected=false;try{await h.finishRun(fixture.active.id,fixture.active.ownerToken,result);}catch{staleRejected=true;}
   if(!staleRejected)throw new Error('Stale owner was accepted');
   const job=await h.claimRun();if(job?.id!==fixture.pending.id)throw new Error('Queued run was lost');
   await h.finishRun(job.id,job.ownerToken,result);
   const {recoverSync}=await import('../dist/sync.js');await recoverSync();
   if((await pool.query('SELECT status FROM sync_run WHERE id=$1',[fixture.syncId])).rows[0].status!=='paused')throw new Error('Interrupted sync was not recovered');
   console.log(JSON.stringify({label,singletonReleased:true,staleRejected,queuedCompleted:true,syncRecovered:true}));
 }else throw new Error('Unknown recovery fixture command');
}finally{await pool.end();}
