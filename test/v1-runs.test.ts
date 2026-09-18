import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {HistoryClient} from '../packages/history-client/src/index.js';
import {createHistoryApp,errors} from '../apps/history-api/src/app.js';
import {directoryRoutes} from '../apps/history-api/src/directory-routes.js';
import {runRoutes} from '../apps/history-api/src/run-routes.js';
process.env.NODE_ENV='test';
const schema='triage_test_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw new Error('Dedicated test database required');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool}=await import('../apps/history-api/src/db.js');
const {migrateVersioned}=await import('../apps/history-api/src/migrations.js');await migrateVersioned();
const {Directory}=await import('../apps/history-api/src/directory.js');
const {Runs}=await import('../apps/history-api/src/runs.js');
const team=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[team,'Synthetic']);
const d=new Directory(team),runs=new Runs();
const a=await d.login({issuer:'https://test/',subject:'a',email:'a@example.test'}),b=await d.login({issuer:'https://test/',subject:'b',email:'b@example.test'});
const sourceA=await d.registerSource(a,{instanceId:randomUUID(),displayName:'A'}),sourceB=await d.registerSource(b,{instanceId:randomUUID(),displayName:'B'});
const ra=await d.registerRunner(a,{requestId:randomUUID(),displayName:'A',agents:['codex'],sourceIds:[sourceA.id]}),rb=await d.registerRunner(b,{requestId:randomUUID(),displayName:'B',agents:['claude'],sourceIds:[sourceB.id]});
const input=(mailId:number,other=false)=>({sourceId:other?sourceB.id:sourceA.id,mailId,messageId:'<same@example.test>',subject:'Synthetic',requestId:randomUUID(),runnerId:other?rb.id:ra.id,agent:other?'claude' as const:'codex' as const,executorKind:'local' as const,verifiedAt:new Date().toISOString()});
const result={outcome:'completed',project:'unknown',report:'Synthetic immutable report',question:'',knowledge:'',evidence:[]};
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
test('HTTP DB-free client registers, claims, saves and reads same report with ACL enforced',async()=>{
  const app=createHistoryApp(runs,async token=>token==='a'?a:b);directoryRoutes(app,d);runRoutes(app,runs);
  const server=errors(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
    const base='http://127.0.0.1:'+(server.address() as any).port,client=new HistoryClient(base,async()=>'a');
    const start=input(1),job=await client.start(start);assert.equal((await client.start(start)).id,job.id);
    const claim=await client.request('/runners/'+ra.id+'/claim',{requestId:randomUUID()},ra.credential);
    const lease={runnerId:ra.id,leaseToken:claim.leaseToken,generation:claim.generation},requestId=randomUUID();
    await client.complete(job.id,lease,requestId,result,ra.credential);await client.complete(job.id,lease,requestId,result,ra.credential);
    assert.equal((await client.get(job.id)).result.report,result.report);
    await assert.rejects(new HistoryClient(base,async()=>'b').get(job.id),/SOURCE_NOT_FOUND/);
    await assert.rejects(new HistoryClient(base,async()=>'b').request('/runs/'+job.id+'/export'),/SOURCE_NOT_FOUND/);
    await assert.rejects(client.complete(job.id,lease,requestId,{...result,report:'changed'},ra.credential),/RESULT_CONFLICT/);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('source-local numeric and Message-ID collisions remain distinct; admission/claim are exclusive',async()=>{
  const start=input(2),admission=await Promise.allSettled([runs.start(a,start),runs.start(a,{...start,requestId:randomUUID()})]);
  assert.equal(admission.filter(x=>x.status==='fulfilled').length,1);
  const other=await runs.start(b,input(2,true));
  const claims=await Promise.all([runs.claim(a,ra.id,randomUUID(),ra.credential),runs.claim(a,ra.id,randomUUID(),ra.credential)]);assert.equal(claims.filter(Boolean).length,1);
  const c=claims.find(Boolean)!;assert.notEqual(c.id,other.id);
  await assert.rejects(runs.claim(b,ra.id,randomUUID(),ra.credential),/RUNNER_DENIED/);
  const cb=await runs.claim(b,rb.id,randomUUID(),rb.credential);assert.equal(cb!.id,other.id);
  for(const [actor,claim,device] of [[a,c,ra.credential],[b,cb!,rb.credential]] as const)await runs.complete(actor,claim.id,{runnerId:claim.runnerId,leaseToken:claim.leaseToken,generation:claim.generation,requestId:randomUUID(),result},device);
});
test('lost claim response rotates generation; cancellation, expiry and ACL revocation fence late results',async()=>{
  const job=await runs.start(a,input(3)),requestId=randomUUID();
  const c1=(await runs.claim(a,ra.id,requestId,ra.credential))!,c2=(await runs.claim(a,ra.id,requestId,ra.credential))!;
  assert.equal(c1.id,c2.id);assert.equal(c2.generation,c1.generation+1);
  const lease=(c:any)=>({runnerId:ra.id,leaseToken:c.leaseToken,generation:c.generation});
  await assert.rejects(runs.heartbeat(a,job.id,lease(c1),ra.credential),/LEASE_CONFLICT/);
  await runs.cancel(a,job.id);assert.equal((await runs.heartbeat(a,job.id,lease(c2),ra.credential)).cancelRequested,true);
  await assert.rejects(runs.complete(a,job.id,{...lease(c2),requestId:randomUUID(),result},ra.credential),/CANCEL_REQUESTED/);
  await runs.fail(a,job.id,{...lease(c2),code:'CANCELLED'},ra.credential);
  const exp=await runs.start(a,input(4)),ce=(await runs.claim(a,ra.id,randomUUID(),ra.credential))!;
  await pool.query("UPDATE analysis_run SET lease_until=now()-interval '1 second' WHERE id=$1",[exp.id]);
  await assert.rejects(runs.complete(a,exp.id,{...lease(ce),requestId:randomUUID(),result},ra.credential),/LEASE_EXPIRED/);
  await runs.sweep();assert.equal((await runs.get(a,exp.id)).status,'failed');
  await d.grant(a,sourceA.id,{userId:b.userId,permission:'write'});
  const shared=await d.registerRunner(b,{requestId:randomUUID(),displayName:'B shared',agents:['codex'],sourceIds:[sourceA.id]});
  const sharedRun=await runs.start(b,{...input(5),runnerId:shared.id});const cs=(await runs.claim(b,shared.id,randomUUID(),shared.credential))!;
  await d.grant(a,sourceA.id,{userId:b.userId,permission:'none'});
  await assert.rejects(runs.heartbeat(b,sharedRun.id,{runnerId:shared.id,leaseToken:cs.leaseToken,generation:cs.generation},shared.credential),/SOURCE_NOT_FOUND/);
});
test('source sync serializes batches, preserves idempotent counts and pauses uncertain expired work',async()=>{
  const {SourceSync}=await import('../apps/history-api/src/source-sync.js');const sync=new SourceSync();
  const job=await sync.start(a,{sourceId:sourceA.id,runnerId:ra.id,requestId:randomUUID()});
  await assert.rejects(sync.start(a,{sourceId:sourceA.id,runnerId:ra.id,requestId:randomUUID()}),/SYNC_BUSY/);
  const claim=await sync.claim(a,job.id,randomUUID(),ra.credential),lease={runnerId:ra.id,leaseToken:claim.leaseToken,generation:claim.generation};
  for(let i=0;i<32;i++){
    const batchId=randomUUID();await sync.beginBatch(a,job.id,{...lease,batchId},ra.credential);
    const body={...lease,batchId,response:{status:i===31?'success':'partial',saved:100,failed:0,remaining:3100-i*100,errors:[]}};
    await sync.batch(a,job.id,body,ra.credential);await sync.batch(a,job.id,body,ra.credential);
  }
  assert.equal((await sync.get(a,job.id)).saved,3200);assert.equal((await sync.get(a,job.id)).status,'completed');
  const uncertain=await sync.start(a,{sourceId:sourceA.id,runnerId:ra.id,requestId:randomUUID()});
  const c=await sync.claim(a,uncertain.id,randomUUID(),ra.credential),l={runnerId:ra.id,leaseToken:c.leaseToken,generation:c.generation};
  await sync.beginBatch(a,uncertain.id,{...l,batchId:randomUUID()},ra.credential);
  await assert.rejects(sync.beginBatch(a,uncertain.id,{...l,batchId:randomUUID()},ra.credential),/UNCERTAIN/);
  await pool.query("UPDATE v1_sync SET lease_until=now()-interval '1 second' WHERE id=$1",[uncertain.id]);
  await sync.start(a,{sourceId:sourceA.id,runnerId:ra.id,requestId:randomUUID()});
  const old=await sync.get(a,uncertain.id);assert.equal(old.status,'paused');assert.equal(old.uncertain,true);assert.equal(old.saved,0);
});
