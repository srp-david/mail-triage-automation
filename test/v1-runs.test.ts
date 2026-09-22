import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {HistoryClient} from '../packages/history-client/src/index.js';
import {createHistoryApp,errors} from '../apps/history-api/src/app.js';
import {directoryRoutes} from '../apps/history-api/src/directory-routes.js';
import {runRoutes} from '../apps/history-api/src/run-routes.js';
import {sharedHistoryRoutes} from '../apps/history-api/src/shared-history-routes.js';
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
  const app=createHistoryApp(runs,async token=>token==='a'?a:b);directoryRoutes(app,d);runRoutes(app,runs);sharedHistoryRoutes(app);
  const server=errors(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
    const base='http://127.0.0.1:'+(server.address() as any).port,client=new HistoryClient(base,async()=>'a');
    const start=input(1),job=await client.start(start);assert.equal((await client.start(start)).id,job.id);
    const claim=await client.request('/runners/'+ra.id+'/claim',{requestId:randomUUID()},ra.credential);
    const lease={runnerId:ra.id,leaseToken:claim.leaseToken,generation:claim.generation},requestId=randomUUID();
    await client.complete(job.id,lease,requestId,result,ra.credential);await client.complete(job.id,lease,requestId,result,ra.credential);
    assert.equal((await client.get(job.id)).result.report,result.report);
    await client.request('/runs/'+job.id+'/reviews',{requestId:randomUUID(),body:'Synthetic review export'});
    const exported=await fetch(base+'/api/v1/runs/'+job.id+'/export',{headers:{authorization:'Bearer a','x-contract-version':'1'}}),body=await exported.text();
    assert.equal(exported.status,200);assert.ok(body.includes('a@example.test'));assert.ok(body.includes('Synthetic review export'));assert.equal(exported.headers.get('X-Report-SHA256'),createHash('sha256').update(body).digest('hex'));
    await assert.rejects(new HistoryClient(base,async()=>'b').get(job.id),/SOURCE_NOT_FOUND/);
    await assert.rejects(new HistoryClient(base,async()=>'b').request('/runs/'+job.id+'/export'),/SOURCE_NOT_FOUND/);
    await assert.rejects(client.complete(job.id,lease,requestId,{...result,report:'changed'},ra.credential),/RESULT_CONFLICT/);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('concurrent history readers share ACL lock while revocation waits for both readers',async()=>{
  const {lockShared}=await import('../apps/history-api/src/directory.js');
  const first=await pool.connect(),second=await pool.connect(),writer=await pool.connect();
  try{
    await first.query('BEGIN');await second.query('BEGIN');await writer.query('BEGIN');
    await lockShared(first);await second.query("SET LOCAL statement_timeout='1000ms'");await lockShared(second);
    const available=async()=>(await writer.query("SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema()||':v1-write',0)) AS ok")).rows[0].ok;
    assert.equal(await available(),false);await first.query('COMMIT');assert.equal(await available(),false);await second.query('COMMIT');assert.equal(await available(),true);
  }finally{for(const c of [first,second,writer]){await c.query('ROLLBACK');c.release();}}
});

test('shared history features enforce source ACL, read-only grants and immutable reports',async()=>{
  const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const h=new SharedHistory();
  const s=await d.registerSource(a,{instanceId:randomUUID(),displayName:'History fixture'});
  // A migrated v0 run has a mapped store but deliberately no invented v1 actor/agent.
  const mailKey=randomUUID(),runId=randomUUID();
  await pool.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,90,$3,$4)',[mailKey,s.id,'<fixture@test>','Private unique subject']);
  await pool.query("INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status) VALUES($1,$2,'direct',$3,'fixture','completed')",[runId,mailKey,randomUUID()]);
  await pool.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)',[runId,JSON.stringify(result)]);
  assert.equal((await runs.get(a,runId)).agent,'unknown');assert.equal((await runs.get(a,runId)).requestedBy,null);
  for(const action of [()=>h.get(b,runId),()=>h.list(b,s.id),()=>h.summaries(b,s.id,[90]),()=>h.threads(b,s.id),()=>h.review(b,runId,{requestId:randomUUID(),body:'denied'}),()=>h.handling(b,runId,true)])await assert.rejects(action,/SOURCE_NOT_FOUND/);
  await d.grant(a,s.id,{userId:b.userId,permission:'read'});
  assert.equal((await h.list(b,s.id,0,90,'unique')).length,1);assert.equal((await h.list(b,s.id,0,91)).length,0);
  assert.equal((await h.summaries(b,s.id,[90]))[0].runCount,1);
  await assert.rejects(h.handling(b,runId,true),/SOURCE_NOT_FOUND/);
  const review={requestId:randomUUID(),body:'Synthetic review'};const r=await h.review(a,runId,review);assert.equal((await h.review(a,runId,review)).id,r.id);
  await assert.rejects(h.review(a,runId,{...review,body:'changed'}),/REVIEW_CONFLICT/);
  const after=await h.get(b,runId);assert.equal(after.reviews[0].author,a.userId);assert.equal(after.result.report,result.report);
  await h.handling(a,runId,true);
  const from={id:90,messageId:'<fixture@test>',fetchedAt:'2026-09-18T00:00:00Z',subject:'Synthetic'};
  const to={...from,id:91,messageId:'<related@test>'};const verifiedAt=new Date().toISOString();
  const related=await h.related(a,runId,{mail:to,verifiedAt});assert.equal((await h.get(b,runId)).relatedMails[0].id,related.id);
  await assert.rejects(h.related(b,runId,{mail:to,verifiedAt}),/SOURCE_NOT_FOUND/);
  const edge=await h.addThread(a,s.id,{source:from,target:to,verifiedAt});
  assert.equal((await h.addThread(a,s.id,{source:to,target:from,verifiedAt})).link.id,edge.link.id);
  await assert.rejects(h.detachThread(a,s.id,{mail:{id:90,messageId:'wrong',fetchedAt:from.fetchedAt},linkIds:[edge.link.id]}),/MAIL_IDENTITY_CHANGED/);
  assert.equal((await h.threads(b,s.id)).length,1);
  await h.detachThread(a,s.id,{mail:{id:90,messageId:from.messageId,fetchedAt:from.fetchedAt},linkIds:[edge.link.id]});assert.equal((await h.threads(b,s.id)).length,0);
  await h.unlinkRelated(a,runId,related.id);assert.equal((await h.get(a,runId)).relatedMails.length,0);
  await d.grant(a,s.id,{userId:b.userId,permission:'none'});await assert.rejects(h.get(b,runId),/SOURCE_NOT_FOUND/);
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

test('legacy collections isolate search, bodies, links and counts; knowledge requires source access',async()=>{
  const {SharedArchive}=await import('../apps/history-api/src/shared-archive.js');const archive=new SharedArchive();
  const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const h=new SharedHistory();
  const {digest}=await import('../apps/history-api/src/directory.js');
  const col=await archive.create(a,{name:'Private fixture',requestId:randomUUID()}),other=await archive.create(b,{name:'Other fixture',requestId:randomUUID()});
  const body='Synthetic legacy confidential fixture',doc={namespace:'fixture',path:'report.md',hash:digest(body),kind:'report',body};
  const imported=await archive.import(a,col.id,doc);assert.equal((await archive.import(a,col.id,doc)).id,imported.id);
  await assert.rejects(archive.import(b,other.id,doc),/DOCUMENT_MAPPING_REQUIRED/);
  await assert.rejects(archive.get(b,imported.id),/COLLECTION_NOT_FOUND/);await assert.rejects(archive.list(b,col.id,0,'confidential'),/COLLECTION_NOT_FOUND/);
  const s=await d.registerSource(a,{instanceId:randomUUID(),displayName:'Legacy shared source'});await d.grant(a,s.id,{userId:b.userId,permission:'read'});
  await archive.link(a,imported.id,{sourceId:s.id,hash:doc.hash,mailId:1,messageId:'<legacy@test>',subject:'Synthetic',verifiedAt:new Date().toISOString()});
  assert.equal((await h.summaries(b,s.id,[1]))[0].legacyCount,0);assert.equal((await archive.mailDocuments(b,s.id,1)).length,0);
  await archive.grant(a,col.id,{userId:b.userId,permission:'read'});assert.equal((await archive.get(b,imported.id)).body,body);assert.equal((await archive.list(b,col.id,0,'confidential')).length,1);
  assert.equal((await h.summaries(b,s.id,[1]))[0].legacyCount,1);assert.equal((await archive.mailDocuments(b,s.id,1))[0].id,imported.id);
  await assert.rejects(archive.import(b,col.id,{...doc,path:'new.md'}),/COLLECTION_NOT_FOUND/);
  // Unassigned migration rows cannot be claimed by re-importing matching bytes.
  const unassigned=randomUUID();await pool.query("INSERT INTO legacy_document(id,namespace,source_path,source_hash,kind,body) VALUES($1,'unassigned','old.md',$2,'report',$3)",[unassigned,doc.hash,body]);
  await assert.rejects(archive.get(a,unassigned),/DOCUMENT_NOT_FOUND/);await assert.rejects(archive.import(a,col.id,{...doc,namespace:'unassigned',path:'old.md'}),/DOCUMENT_MAPPING_REQUIRED/);
  const mail=(await pool.query('SELECT id FROM mail_identity WHERE store_id=$1',[s.id])).rows[0],id=randomUUID();
  await pool.query("INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status) VALUES($1,$2,'direct',$3,'fixture','completed')",[id,mail.id,randomUUID()]);
  await pool.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)',[id,JSON.stringify({...result,knowledge:'Synthetic proposal only'})]);
  const proposal={runId:id,namespace:'fixture',target:'erp/gg/docs/synthetic.md',baseHash:digest('base'),reportHash:digest(result.report),nextHash:digest('next')};
  const k=await archive.prepareKnowledge(a,proposal);assert.equal((await archive.prepareKnowledge(a,proposal)).id,k.id);assert.equal(k.owner_hash,undefined);
  await assert.rejects(archive.prepareKnowledge(b,proposal),/SOURCE_NOT_FOUND/);assert.equal((await archive.knowledge(b,k.id)).id,k.id);
  await d.grant(a,s.id,{userId:b.userId,permission:'none'});await assert.rejects(archive.knowledge(b,k.id),/SOURCE_NOT_FOUND/);
  await archive.grant(a,col.id,{userId:b.userId,permission:'none'});await assert.rejects(archive.get(b,imported.id),/COLLECTION_NOT_FOUND/);
});

test('expired result recovery creates one new immutable version after identity revalidation',async()=>{
  const s=await d.registerSource(a,{instanceId:randomUUID(),displayName:'Recovery fixture'}),runner=await d.registerRunner(a,{requestId:randomUUID(),displayName:'Recovery',agents:['codex'],sourceIds:[s.id]});
  const old=await runs.start(a,{...input(100),sourceId:s.id,runnerId:runner.id});const claim=(await runs.claim(a,runner.id,randomUUID(),runner.credential))!;
  const body={runnerId:runner.id,leaseToken:claim.leaseToken,generation:claim.generation,requestId:randomUUID(),result,verifiedAt:new Date().toISOString(),messageId:'<same@example.test>'};
  await assert.rejects(runs.recover(a,old.id,body,runner.credential),/ORIGINAL_RUN_NOT_RECOVERABLE/);
  await pool.query("UPDATE analysis_run SET lease_until=now()-interval '1 second' WHERE id=$1",[old.id]);
  await assert.rejects(runs.recover(a,old.id,{...body,messageId:'changed'},runner.credential),/MAIL_REVALIDATION_REQUIRED/);
  const restored=await runs.recover(a,old.id,body,runner.credential);assert.notEqual(restored.id,old.id);assert.equal((await runs.recover(a,old.id,body,runner.credential)).id,restored.id);
  assert.equal((await runs.get(a,old.id)).result,null);assert.equal((await runs.get(a,restored.id)).result.report,result.report);assert.equal((await runs.get(a,restored.id)).parentId,old.id);
  await assert.rejects(runs.recover(a,old.id,{...body,result:{...result,report:'different'}},runner.credential),/REQUEST_CONFLICT/);
});

test('v1 sync retries only confirmed transient responses with bounded delays and enforces one source',async()=>{
  const {SourceSync}=await import('../apps/history-api/src/source-sync.js');const sync=new SourceSync();
  const s=await d.registerSource(a,{instanceId:randomUUID(),displayName:'Retry fixture'}),runner=await d.registerRunner(a,{requestId:randomUUID(),displayName:'Retry',agents:['codex'],sourceIds:[s.id]});
  const job=await sync.start(a,{sourceId:s.id,runnerId:runner.id,requestId:randomUUID()});assert.equal((await sync.next(a,runner.id,runner.credential)).id,job.id);
  const claim=await sync.claim(a,job.id,randomUUID(),runner.credential),lease={runnerId:runner.id,leaseToken:claim.leaseToken,generation:claim.generation};
  for(let i=0;i<4;i++){
    const batchId=randomUUID();await sync.beginBatch(a,job.id,{...lease,batchId},runner.credential);
    const outcome=await sync.batch(a,job.id,{...lease,batchId,response:{status:'error',saved:0,failed:0,remaining:null,errors:['POP3_TIMEOUT']}},runner.credential);
    assert.equal(outcome.status,i<3?'retrying':'failed');
    if(i<3){assert.ok(outcome.nextAttemptAt);await assert.rejects(sync.beginBatch(a,job.id,{...lease,batchId:randomUUID()},runner.credential),/RETRY_NOT_DUE/);await assert.rejects(sync.start(a,{sourceId:s.id,runnerId:runner.id,requestId:randomUUID()}),/SYNC_BUSY/);await pool.query("UPDATE sync_run SET next_attempt_at=now()-interval '1 second' WHERE id=$1",[job.id]);}
  }
  assert.equal((await sync.get(a,job.id)).retry_count,3);
  const partial=await sync.start(a,{sourceId:s.id,runnerId:runner.id,requestId:randomUUID()}),partialClaim=await sync.claim(a,partial.id,randomUUID(),runner.credential),batchId=randomUUID(),partialLease={runnerId:runner.id,leaseToken:partialClaim.leaseToken,generation:partialClaim.generation};
  await sync.beginBatch(a,partial.id,{...partialLease,batchId},runner.credential);
  assert.equal((await sync.batch(a,partial.id,{...partialLease,batchId,response:{status:'error',saved:1,failed:1,remaining:10,errors:['POP3_TIMEOUT']}},runner.credential)).status,'failed');assert.equal((await sync.get(a,partial.id)).retry_count,0);
});

test('transport and app interruption remain failed while explicit cancellation is cancelled',async()=>{
  for(const [i,code] of ['NETWORK_ERROR','AUTH_REJECTED','APP_STOPPED','LEASE_EXPIRED','TIMEOUT','CANCELLED'].entries()){
    const job=await runs.start(a,input(600+i)),claim=(await runs.claim(a,ra.id,randomUUID(),ra.credential))!;
    assert.equal(claim.id,job.id);
    await runs.fail(a,job.id,{runnerId:ra.id,leaseToken:claim.leaseToken,generation:claim.generation,code},ra.credential);
    const saved=(await pool.query('SELECT status,error FROM analysis_run WHERE id=$1',[job.id])).rows[0];
    assert.equal(saved.status,code==='CANCELLED'?'cancelled':'failed');assert.equal(saved.error,code);
  }
});

test('HTTP sync runner processes 3200 synthetic mails without DB credentials or duplicate batches',async()=>{
  const {SourceSync}=await import('../apps/history-api/src/source-sync.js'),{syncRoutes}=await import('../apps/history-api/src/sync-routes.js'),{SyncRunner}=await import('../packages/runner/src/sync-runner.js');const sync=new SourceSync();
  const s=await d.registerSource(a,{instanceId:randomUUID(),displayName:'Sync loop'}),r=await d.registerRunner(a,{requestId:randomUUID(),displayName:'Loop',agents:['codex'],sourceIds:[s.id]});
  const job=await sync.start(a,{sourceId:s.id,runnerId:r.id,requestId:randomUUID()});
  const app=createHistoryApp(runs,async()=>a);syncRoutes(app,sync);const server=errors(app).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const records=new Map<string,any>(),store={async read(key:string){if(!records.has(key))throw Object.assign(new Error(),{code:'ENOENT'});return structuredClone(records.get(key));},async write(key:string,v:any){records.set(key,structuredClone(v));}};let count=0;
  try{
    const client=new HistoryClient('http://127.0.0.1:'+(server.address() as any).port,async()=>'a');
    const driver=new SyncRunner(client,store,r.id,r.credential,async(source,limit)=>{assert.equal(source,s.id);assert.equal(limit,100);count++;return {status:count===32?'success':'partial',saved:100,failed:0,remaining:3200-count*100,errors:[]};});
    for(let i=0;i<32;i++)await driver.tick(new AbortController().signal);
    assert.equal(await driver.tick(new AbortController().signal),null);assert.equal(count,32);assert.equal((await sync.get(a,job.id)).saved,3200);assert.equal((await sync.get(a,job.id)).status,'completed');
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
