import { test,afterAll as after } from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
process.env.NODE_ENV='test';
process.env.TRIAGE_TOKEN='test-token-'.repeat(8);
const schema='triage_test_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw new Error('Tests require a PostgreSQL DATABASE_URL');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
await admin.query('CREATE SCHEMA '+schema);
process.env.PGOPTIONS='-c search_path='+schema;
const {pool,migrate}=await import('../src/db.js');
const h=await import('../src/history.js');
const {syncDecision}=await import('../src/sync.js');
await migrate();
after(async()=>{await pool.end();if(!/^triage_test_[a-f0-9]+$/.test(schema))throw new Error('unsafe test schema');await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
const input=(mailId:number,source='direct')=>({storeId:'fixture-store',mailId,messageId:'<same@example.test>',subject:'Synthetic test mail',source,requestId:randomUUID()});
const result={outcome:'completed',project:'unknown',report:'Synthetic report; no customer data.',question:'',knowledge:'',evidence:[]};

test('progress is bounded, owner-protected, persistent, and independent of heartbeat and final status',async()=>{
 const job=await h.startRun(input(79001));
 await assert.rejects(h.recordProgress(job.id,'wrong',{kind:'mail_read',outcome:'completed'}),/소유권/);
 await assert.rejects(h.recordProgress(job.id,job.ownerToken!,{kind:'mail_read',outcome:'completed',text:'private'}));
 for(let i=0;i<23;i++)await h.recordProgress(job.id,job.ownerToken!,{kind:i===22?'db_tool':'mail_read',outcome:i===22?'failed':'completed'});
 const before=await h.getRun(job.id);assert.equal(before.progress_events.length,20);assert.equal(before.status,'running');
 assert.deepEqual(Object.keys(before.progress_events[0]).sort(),['at','kind','outcome']);
 assert.equal(before.progress_events.at(-1).kind,'db_tool');assert.equal(before.progress_events.at(-1).outcome,'failed');
 await h.heartbeat(job.id,job.ownerToken!);const pulse=await h.getRun(job.id);
 assert.ok(pulse.heartbeat_at);assert.deepEqual(pulse.progress_events,before.progress_events);
 await h.finishRun(job.id,job.ownerToken!,result);
 await assert.rejects(h.recordProgress(job.id,job.ownerToken!,{kind:'result_saving',outcome:'completed'}),/소유권/);
 const done=await h.getRun(job.id);assert.deepEqual(done.progress_events,before.progress_events);assert.deepEqual(done.result,result);
 const expired=await h.startRun(input(79002));await pool.query("UPDATE analysis_run SET lease_until=now()-interval '1 second' WHERE id=$1",[expired.id]);
 await assert.rejects(h.recordProgress(expired.id,expired.ownerToken!,{kind:'mail_read',outcome:'completed'}),/소유권/);
 assert.deepEqual((await h.getRun(expired.id)).progress_events,[]);
});

test('manual related mail links are shared across reports and preserve handling and report content',async()=>{
 const rel=await import('../src/related.js'),{config}=await import('../src/config.js');
 const data={...input(78001),storeId:config.store};
 const a=await h.startRun(data);await h.finishRun(a.id,a.ownerToken!,result);
 const b=await h.startRun({...data,requestId:randomUUID()});await h.finishRun(b.id,b.ownerToken!,result);
 const target={id:78002,messageId:'<related@example.test>',subject:'Synthetic related',from:[{address:'sender@example.test'}],body:'Must not be stored'};
 await assert.rejects(rel.addRelatedMail(a.id,config.store,target.id,target.messageId,target),/처리 완료/);
 const done=await h.setMailHandled(a.id,true),before=await h.getRun(a.id);
 const links=await Promise.all([rel.addRelatedMail(a.id,config.store,target.id,target.messageId,target),rel.addRelatedMail(b.id,config.store,target.id,target.messageId,target)]);
 assert.equal(links[0].id,links[1].id);
 const after=await h.getRun(b.id);assert.equal(after.relatedMails.length,1);assert.equal(after.relatedMails[0].metadata.body,undefined);
 assert.deepEqual(after.handled_at,done.handled_at);assert.equal(after.reportHash,before.reportHash);assert.deepEqual(after.result,before.result);
 assert.equal((await h.listRuns(config.store,78001)).length,2);
 await assert.rejects(rel.addRelatedMail(a.id,config.store,78001,data.messageId,{...target,id:78001,messageId:data.messageId}),/자기 자신/);
 await assert.rejects(rel.addRelatedMail(a.id,'other-store',target.id,target.messageId,target),/저장소/);
 await assert.rejects(rel.addRelatedMail(a.id,config.store,target.id,'<changed@example.test>',target),/식별자/);
 await assert.rejects(rel.addRelatedMail(a.id,config.store,target.id,'<changed@example.test>',{...target,messageId:'<changed@example.test>'}),/기존 연결/);
 const other=await h.startRun({...input(78003),storeId:config.store});await h.finishRun(other.id,other.ownerToken!,result);
 await rel.unlinkRelatedMail(other.id,links[0].id);assert.equal((await h.getRun(a.id)).relatedMails.length,1);
 await assert.rejects(rel.getRelatedMail(other.id,links[0].id),/찾을 수/);
 await h.setMailHandled(a.id,false);assert.equal((await h.getRun(a.id)).relatedMails.length,1);
 await rel.unlinkRelatedMail(b.id,links[0].id);await rel.unlinkRelatedMail(b.id,links[0].id);
 assert.equal((await h.getRun(a.id)).relatedMails.length,0);
});

test('related mail API verifies live identity and handles unavailable originals without changing records',async()=>{
 const {config}=await import('../src/config.js'),{createApp}=await import('../src/server.js');
 const job=await h.startRun({...input(78010),storeId:config.store});await h.finishRun(job.id,job.ownerToken!,result);await h.setMailHandled(job.id,true);
 let changed=false,missing=false,calls=0;
 const fixture=()=>({id:78011,messageId:changed?'<changed@example.test>':'<target@example.test>',subject:'Synthetic target',body:'<script>unsafe()</script>',from:[],to:[]});
 const server=createApp(async()=>{calls++;return fixture();},async()=>{if(missing)throw new Error('Fixture unavailable');return fixture();}).listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port,path='/api/runs/'+job.id+'/related-mails';
 const headers={authorization:'Bearer '+process.env.TRIAGE_TOKEN,'Content-Type':'application/json'};
 const options={method:'POST',headers,body:JSON.stringify({storeId:config.store,mailId:78011,messageId:'<target@example.test>'})};
 try{
  assert.equal((await fetch(base+path,{...options,headers:{'Content-Type':'application/json'}})).status,401);
  assert.equal((await fetch(base+path,{...options,headers:{...headers,origin:'https://other.invalid'}})).status,403);
  assert.equal((await fetch(base+path,{...options,body:JSON.stringify({storeId:config.store,mailId:-1,messageId:'x'})})).status,400);assert.equal(calls,0);
  const response=await fetch(base+path,options);assert.equal(response.status,200);const link=await response.json();
  assert.equal((await fetch(base+path+'/'+link.id)).status,401);
  assert.equal((await fetch(base+path+'/'+link.id,{headers})).status,200);
  changed=true;assert.equal((await fetch(base+path+'/'+link.id,{headers})).status,409);assert.equal((await fetch(base+path,options)).status,409);
  changed=false;missing=true;assert.equal((await fetch(base+path+'/'+link.id,{headers})).status,500);
  assert.equal((await h.getRun(job.id)).relatedMails.length,1);assert.ok((await h.getRun(job.id)).handled_at);
  assert.equal((await fetch(base+path+'/'+link.id+'/unlink',{method:'POST'})).status,401);
  assert.equal((await fetch(base+path+'/'+link.id+'/unlink',{method:'POST',headers})).status,200);
  assert.equal((await h.getRun(job.id)).relatedMails.length,0);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('related link admission waits for completion cancellation and rechecks its state',async()=>{
 const rel=await import('../src/related.js'),{config}=await import('../src/config.js');
 const job=await h.startRun({...input(78020),storeId:config.store});await h.finishRun(job.id,job.ownerToken!,result);await h.setMailHandled(job.id,true);
 const lock=await pool.connect();
 try{
  await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[config.store+':78020']);
  const attempt=rel.addRelatedMail(job.id,config.store,78021,'<locked@example.test>',{id:78021,messageId:'<locked@example.test>',subject:'Synthetic locked'});
  const outcome=assert.rejects(attempt,/처리 완료/);
  await lock.query('UPDATE mail_identity SET handled_at=NULL WHERE store_id=$1 AND mail_id=78020',[config.store]);await lock.query('COMMIT');
  await outcome;assert.equal((await h.getRun(job.id)).relatedMails.length,0);
 }finally{await lock.query('ROLLBACK');lock.release();}
});

test('mail handling preserves reports/questions, creates no run, and can be undone',async()=>{
 const data=input(77001),job=await h.startRun(data);
 const other=await h.startRun({...input(77001),storeId:'another-handling-store'});
 await h.finishRun(other.id,other.ownerToken!,result);
 const question={...result,outcome:'needs_input',question:'Which document?'};
 await h.finishRun(job.id,job.ownerToken!,question);
 const before=await h.getRun(job.id);
 const done=await h.setMailHandled(job.id,true);
 assert.ok(done.handled_at);
 assert.deepEqual(await h.setMailHandled(job.id,true),done);
 const after=await h.getRun(job.id);
 assert.equal(after.status,'needs_input');assert.deepEqual(after.result,before.result);assert.equal(after.reportHash,before.reportHash);
 assert.equal((await h.listRuns(data.storeId,data.mailId)).length,1);
 assert.ok((await h.listRuns(data.storeId,data.mailId))[0].handled_at);
 assert.ok((await h.mailAnalysis(data.storeId,[data.mailId]))[0].handledAt);
 assert.equal((await h.getRun(other.id)).handled_at,null);
 await assert.rejects(h.startRun({...input(77001),parentId:job.id,answer:'Already handled'}),/처리 완료/);
 assert.equal((await h.setMailHandled(job.id,false)).handled_at,null);
 const resumed=await h.startRun({...input(77001),parentId:job.id,answer:'TEST_DOCUMENT'});
 await h.finishRun(resumed.id,resumed.ownerToken!,result);
});

test('handling and analysis admission are serialized for the same mail',async()=>{
 const job=await h.startRun(input(77002));
 await assert.rejects(h.setMailHandled(job.id,true),/진행 중/);
 await h.finishRun(job.id,job.ownerToken!,result);
 const attempts=await Promise.allSettled([h.setMailHandled(job.id,true),h.startRun(input(77002))]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 if(attempts[1].status==='fulfilled')await h.finishRun(attempts[1].value.id,attempts[1].value.ownerToken!,result);
 const queued=await h.startRun(input(77003,'web'));
 await assert.rejects(h.setMailHandled(queued.id,true),/진행 중/);
 const claimed=await h.claimRun();assert.equal(claimed.id,queued.id);
 await h.finishRun(claimed.id,claimed.ownerToken,result);
});

test('handling API authenticates, validates input and does not call MCP',async()=>{
 const job=await h.startRun(input(77004));await h.finishRun(job.id,job.ownerToken!,result);
 const {createApp}=await import('../src/server.js');let calls=0;
 const server=createApp(async()=>{calls++;throw new Error('MCP must not be called');}).listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port,path='/api/runs/'+job.id+'/handling';
 const headers={authorization:'Bearer '+process.env.TRIAGE_TOKEN,'Content-Type':'application/json'};
 const options={method:'POST',headers,body:JSON.stringify({completed:true})};
 try{
  assert.equal((await fetch(base+path,{...options,headers:{'Content-Type':'application/json'}})).status,401);
  assert.equal((await fetch(base+path,{...options,headers:{...headers,origin:'https://other.invalid'}})).status,403);
  assert.equal((await fetch(base+path,{...options,body:JSON.stringify({completed:'true'})})).status,400);
  assert.equal((await fetch(base+'/api/runs/'+randomUUID()+'/handling',options)).status,404);
  const response=await fetch(base+path,options);assert.equal(response.status,200);assert.ok((await response.json()).handled_at);
  const undone=await fetch(base+path,{...options,body:JSON.stringify({completed:false})});
  assert.equal((await undone.json()).handled_at,null);assert.equal(calls,0);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('concurrent admission allows one run; retry is idempotent; completed reports remain immutable',async()=>{
 const a=input(1),b=input(1);
 const attempts=await Promise.allSettled([h.startRun(a),h.startRun(b)]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 const index=attempts.findIndex(x=>x.status==='fulfilled');const job=(attempts[index] as PromiseFulfilledResult<any>).value;
 assert.equal((await h.startRun(index===0?a:b)).id,job.id);
 await assert.rejects(h.finishRun(job.id,'wrong',result));
 await h.finishRun(job.id,job.ownerToken,result);
 await h.finishRun(job.id,job.ownerToken,result);
 await assert.rejects(h.finishRun(job.id,job.ownerToken,{...result,report:'changed'}));
 const second=await h.startRun(input(1));await h.finishRun(second.id,second.ownerToken!,result);
 assert.equal((await h.listRuns('fixture-store',1)).length,2);
 assert.equal((await h.getRun(job.id)).result.report,result.report);
 assert.ok(!('owner_hash' in await h.getRun(job.id)));
});
test('expired worker cannot commit after another run starts',async()=>{
 const job=await h.startRun(input(2));
 await pool.query("UPDATE analysis_run SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
 const replacement=await h.startRun(input(2));
 await assert.rejects(h.heartbeat(job.id,job.ownerToken!));
 await assert.rejects(h.finishRun(job.id,job.ownerToken!,result));
 await h.finishRun(replacement.id,replacement.ownerToken!,result);
});
test('Message-ID alone never merges mail and store identity changes are rejected',async()=>{
 const a=await h.startRun(input(3)),b=await h.startRun(input(4));
 assert.notEqual(a.id,b.id);
 await h.finishRun(a.id,a.ownerToken!,result);await h.finishRun(b.id,b.ownerToken!,result);
 await assert.rejects(h.startRun({...input(3),messageId:'<different@example.test>'}));
 const c=await h.startRun({...input(3),storeId:'another-store'});await h.finishRun(c.id,c.ownerToken!,result);
});
test('worker claim is exclusive and supports questions as a new run',async()=>{
 const job=await h.startRun(input(5,'web'));assert.equal(job.status,'queued');assert.equal(job.ownerToken,undefined);
 const claims=await Promise.all([h.claimRun(),h.claimRun()]);assert.equal(claims.filter(Boolean).length,1);
 const claimed=claims.find(Boolean)!;
 await h.finishRun(claimed.id,claimed.ownerToken,{...result,outcome:'needs_input',question:'Which screen?'});
 await assert.rejects(h.startRun({...input(5),parentId:job.id}));
 const next=await h.startRun({...input(5),parentId:job.id,answer:'TEST_SCREEN'});
 await h.finishRun(next.id,next.ownerToken!,result);
});
test('same request ID with changed data is rejected',async()=>{
 const data=input(6);const run=await h.startRun(data);
 await assert.rejects(h.startRun({...data,subject:'changed'}));await h.finishRun(run.id,run.ownerToken!,result);
});
test('review retries do not append duplicate content',async()=>{
 const run=await h.startRun(input(7));await h.finishRun(run.id,run.ownerToken!,result);
 const requestId=randomUUID();
 assert.equal(await h.addReview(run.id,requestId,'Claude','Review'),await h.addReview(run.id,requestId,'Claude','Review'));
 assert.equal((await h.getRun(run.id)).reviews.length,1);
});
test('sync partial errors and no progress cannot become successful completion',()=>{
 assert.equal(syncDecision({status:'success',saved:1,failed:0,remaining:0,errors:[]}),'complete');
 assert.equal(syncDecision({status:'success',saved:100,failed:0,remaining:3,errors:[]}),'continue');
 assert.equal(syncDecision({status:'partial',saved:100,failed:0,remaining:3,errors:[]}),'continue');
 assert.equal(syncDecision({status:'success',saved:0,failed:0,remaining:3,errors:[]}),'partial');
 assert.equal(syncDecision({status:'partial',saved:2,failed:1,remaining:0,errors:[]}),'partial');
 assert.equal(syncDecision({status:'success',saved:2,failed:0,remaining:null,errors:[]}),'partial');
});
test('HTTP authentication and origin checks protect shared history',async()=>{
 const {createApp}=await import('../src/server.js');
 const server=createApp().listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port;
 try{
  assert.equal((await fetch(base+'/api/runs')).status,401);
  assert.equal((await fetch(base+'/api/runs',{headers:{authorization:'Bearer '+process.env.TRIAGE_TOKEN}})).status,200);
  assert.equal((await fetch(base+'/api/runs',{headers:{authorization:'Bearer '+process.env.TRIAGE_TOKEN,origin:'https://other.invalid'}})).status,403);
  assert.equal((await fetch(base+'/api/runs/not-a-uuid',{headers:{authorization:'Bearer '+process.env.TRIAGE_TOKEN}})).status,400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('attachment downloads require authentication and return exact bytes as a named file',async()=>{
 const {createApp}=await import('../src/server.js');
 const bytes=Buffer.from([0,255,1,128]);let calls=0;
 const server=createApp(undefined,undefined,async(emailId,attachmentId)=>{
   calls++;
   if(attachmentId==='1.3')return {isError:true,structuredContent:{code:'ATTACHMENT_TOO_LARGE'},content:[]};
   return {structuredContent:{emailId,attachment:{attachmentId,filename:'자료.xlsx'}},
     content:[{type:'resource',resource:{blob:bytes.toString('base64'),mimeType:'application/octet-stream'}}]};
 }).listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port;
 const path='/api/mails/10/attachments/1.2/download';
 const headers={authorization:'Bearer '+process.env.TRIAGE_TOKEN};
 try{
   assert.equal((await fetch(base+path)).status,401);assert.equal(calls,0);
   assert.equal((await fetch(base+path,{headers:{...headers,origin:'https://other.invalid'}})).status,403);assert.equal(calls,0);
   const response=await fetch(base+path,{headers});
   assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'application/octet-stream');
   assert.ok(response.headers.get('content-disposition')?.startsWith('attachment;'));
   assert.ok(response.headers.get('content-disposition')?.includes(encodeURIComponent('자료.xlsx')));
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
   assert.equal((await fetch(base+'/api/mails/10/attachments/1.3/download',{headers})).status,413);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('MUI styles use fresh nonces while WASM remains isolated to the Office viewer',async()=>{
 const {createApp}=await import('../src/server.js');
 const server=createApp().listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port;
 try{
  const page=await fetch(base+'/');
  const viewer=await fetch(base+'/preview/');
  assert.equal(page.status,200);assert.equal(viewer.status,200);
  const mainCsp=page.headers.get('content-security-policy')!;
  const viewerCsp=viewer.headers.get('content-security-policy')!;
  const html=await page.text(),nonce=html.match(/<meta name="csp-nonce" content="([A-Za-z0-9+/=]+)">/)?.[1];
  assert.ok(nonce);assert.ok(mainCsp.includes(`style-src-elem 'self' 'nonce-${nonce}'`));
  assert.ok(mainCsp.includes("style-src-attr 'unsafe-inline'"));
  assert.ok(mainCsp.includes("script-src 'self';"));assert.ok(!mainCsp.includes('wasm-unsafe-eval'));
  assert.ok(!mainCsp.includes("style-src 'self' 'unsafe-inline'"));assert.equal(page.headers.get('cache-control'),'no-store');
  const second=await fetch(base+'/react/index.html'),secondHtml=await second.text();
  const secondNonce=secondHtml.match(/name="csp-nonce" content="([A-Za-z0-9+/=]+)"/)?.[1];
  assert.ok(secondNonce);assert.notEqual(nonce,secondNonce);assert.ok(second.headers.get('content-security-policy')!.includes(`'nonce-${secondNonce}'`));
  assert.ok(viewerCsp.includes("script-src 'self' 'wasm-unsafe-eval'"));
  assert.ok(viewerCsp.includes("connect-src 'self'"));
  assert.ok(viewerCsp.includes('img-src data: blob:'));
  assert.ok(viewerCsp.includes("frame-ancestors 'self'"));
  assert.ok(viewerCsp.includes("form-action 'none'"));
  assert.equal((await fetch(base+'/api/mails/10/attachments/1.2/download')).status,401);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('mail analysis summaries batch current-store identity, saved history and latest state without bodies',async()=>{
 const {config}=await import('../src/config.js');
 const storeId=config.store,mailId=88001;
 const first=await h.startRun({...input(mailId),storeId});await h.finishRun(first.id,first.ownerToken!,result);
 const retry=await h.startRun({...input(mailId),storeId});await h.failRun(retry.id,retry.ownerToken!,'Synthetic failure');
 await pool.query("UPDATE analysis_run SET created_at=now()+interval '1 minute' WHERE id=$1",[retry.id]);
 const other=await h.startRun({...input(mailId),storeId:'unrelated-store'});
 await h.finishRun(other.id,other.ownerToken!,result);
 const pending=await h.startRun({...input(88002,'web'),storeId});
 const needs=await h.startRun({...input(88003),storeId});await h.finishRun(needs.id,needs.ownerToken!,{...result,outcome:'needs_input',question:'Synthetic question'});
 const {importLegacy,linkLegacy}=await import('../src/archive.js');
 const body='Synthetic previous analysis';
 const doc=await importLegacy({namespace:'badge-fixture',path:'report.md',hash:h.digest(body),kind:'report',body});
 await linkLegacy(doc.id,h.digest(body),{storeId,mailId:88004,messageId:'<legacy@example.test>',subject:'Same subject'},'Synthetic verifier');
 await importLegacy({namespace:'badge-fixture',path:'unlinked.md',hash:h.digest(body),kind:'report',body});
 // More than a history page of runs must not hide the older completed result.
 const key=(await h.getRun(first.id)).mail_key;
 for(let i=0;i<101;i++)await pool.query(`INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status,created_at)
   VALUES($1,$2,'direct',$3,'synthetic','failed',now()-interval '1 day')`,[randomUUID(),key,randomUUID()]);
 const rows=await h.mailAnalysis(storeId,[mailId,88002,88003,88004,88005]);
 const byId=new Map(rows.map(r=>[r.mailId,r]));
 assert.deepEqual(byId.get(String(mailId)),{mailId:String(mailId),handledAt:null,runCount:103,completedCount:1,latestStatus:'failed',legacyCount:0});
 assert.equal(byId.get('88002')?.latestStatus,'queued');assert.equal(byId.get('88002')?.completedCount,0);
 assert.equal(byId.get('88003')?.latestStatus,'needs_input');assert.equal(byId.get('88003')?.completedCount,0);
 assert.deepEqual(byId.get('88004'),{mailId:'88004',handledAt:null,runCount:0,completedCount:0,latestStatus:null,legacyCount:1});
 assert.equal(byId.has('88005'),false);assert.deepEqual(await h.mailAnalysis(storeId,[]),[]);
 const {createApp}=await import('../src/server.js');let mailCalls=0;
 const server=createApp(async()=>{mailCalls++;throw new Error('MCP should not be called');}).listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port,headers={authorization:'Bearer '+process.env.TRIAGE_TOKEN};
 try{
   const path='/api/mail-analysis?mailIds='+mailId+','+mailId;
   assert.equal((await fetch(base+path)).status,401);
   const response=await fetch(base+path,{headers});assert.equal(response.status,200);
   assert.deepEqual(await response.json(),[byId.get(String(mailId))]);
   for(const invalid of ['', '0', '-1', 'abc', '1.5',Array(101).fill('1').join(',')])
     assert.equal((await fetch(base+'/api/mail-analysis?mailIds='+invalid,{headers})).status,400);
   assert.equal(mailCalls,0);
 }finally{
   await new Promise<void>(resolve=>server.close(()=>resolve()));
   await pool.query("UPDATE analysis_run SET status='failed' WHERE id=$1",[pending.id]);
 }
});
