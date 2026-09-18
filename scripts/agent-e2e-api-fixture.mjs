import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {createHistoryApp,errors} from '../apps/history-api/src/app.ts';
import {directoryRoutes} from '../apps/history-api/src/directory-routes.ts';
import {runRoutes} from '../apps/history-api/src/run-routes.ts';
import {ApiError} from '../packages/contracts/src/v1.ts';
if(process.env.NODE_ENV!=='test'||!process.env.TRIAGE_FIXTURE_TOKEN)throw new Error('SYNTHETIC_ONLY');
const schema='triage_e2e_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool}=await import('../apps/history-api/src/db.ts'),{migrateVersioned}=await import('../apps/history-api/src/migrations.ts'),{Directory}=await import('../apps/history-api/src/directory.ts'),{Runs}=await import('../apps/history-api/src/runs.ts');
let server;const stop=async()=>{if(server)await new Promise(r=>server.close(r));await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();};
try{
  await migrateVersioned();const team=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[team,'Synthetic agent E2E']);const directory=new Directory(team),actor=await directory.login({issuer:'https://fixture.invalid/',subject:'synthetic',email:'synthetic@example.test'}),runs=new Runs();
  const app=createHistoryApp(runs,async token=>{if(token!==process.env.TRIAGE_FIXTURE_TOKEN)throw new ApiError(401,'UNAUTHENTICATED');return actor;});directoryRoutes(app,directory);runRoutes(app,runs);
  server=errors(app).listen(4000,'0.0.0.0');process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
}catch(e){await stop();throw e;}
