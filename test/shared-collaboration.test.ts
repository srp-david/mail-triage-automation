import {test,afterAll,expect} from 'vitest';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
process.env.NODE_ENV='test';
const schema='triage_test_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw Error('Dedicated test database required');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool}=await import('../apps/history-api/src/db.js');
const {migrateVersioned}=await import('../apps/history-api/src/migrations.js');await migrateVersioned();
const {Directory}=await import('../apps/history-api/src/directory.js');
const {bindMail}=await import('../apps/history-api/src/common-mail.js');
const team=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[team,'Synthetic']);
const directory=new Directory(team);
const a=await directory.login({issuer:'https://test/',subject:'a',email:'a@example.test'}),b=await directory.login({issuer:'https://test/',subject:'b',email:'b@example.test'});
const sa=await directory.registerSource(a,{instanceId:randomUUID(),displayName:'A'}),sb=await directory.registerSource(b,{instanceId:randomUUID(),displayName:'B'});
const evidence={messageId:'<shared@example.test>',subject:'Synthetic shared mail',from:[{address:'sender@example.test'}],sentAt:'2026-09-28T00:00:00Z'};
const proof=(mailId:number)=>({mailId,evidence,verifiedAt:new Date().toISOString()});
afterAll(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
test('cross-source identity is team-scoped, idempotent, and grants no source access',async()=>{
 const [x,y]=await Promise.all([bindMail(a,sa.id,proof(123)),bindMail(b,sb.id,proof(789))]);
 expect(x.commonId).toBe(y.commonId);expect((await bindMail(a,sa.id,proof(123))).commonId).toBe(x.commonId);
 await expect(bindMail(b,sa.id,proof(123))).rejects.toThrow('SOURCE_NOT_FOUND');
 await expect(bindMail(a,sa.id,{...proof(123),evidence:{...evidence,subject:'Changed'}})).rejects.toThrow('COMMON_MAIL_IDENTITY_CHANGED');
 expect((await bindMail(a,sa.id,{...proof(124),evidence:{...evidence,messageId:null}})).matched).toBe(false);
 const otherTeam=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[otherTeam,'Other']);
 const d=new Directory(otherTeam),u=await d.login({issuer:'https://test/',subject:'c',email:'c@example.test'}),s=await d.registerSource(u,{instanceId:randomUUID(),displayName:'C'});
 expect((await bindMail(u,s.id,proof(123))).commonId).not.toBe(x.commonId);
});
test('two mailboxes admit one analysis and team reports need no per-report sharing',async()=>{
 const {Runs}=await import('../apps/history-api/src/runs.js');const runs=new Runs();
 const {SharedReports}=await import('../apps/history-api/src/shared-reports.js');const reports=new SharedReports();
 const ra=await directory.registerRunner(a,{requestId:randomUUID(),displayName:'A',agents:['codex'],sourceIds:[sa.id]});
 const rb=await directory.registerRunner(b,{requestId:randomUUID(),displayName:'B',agents:['codex'],sourceIds:[sb.id]});
 const input=(sourceId:string,mailId:number,runnerId:string)=>({sourceId,mailId,runnerId,messageId:evidence.messageId,subject:evidence.subject,mailEvidence:evidence,requestId:randomUUID(),agent:'codex' as const,executorKind:'local' as const,verifiedAt:new Date().toISOString()});
 const ia=input(sa.id,123,ra.id),ib=input(sb.id,789,rb.id);
 const results=await Promise.allSettled([runs.start(a,ia),runs.start(b,ib)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(r=>r.status==='rejected').map(r=>String(r.reason))).toEqual(['Error: COMMON_MAIL_BUSY']);
 const first=results[0].status==='fulfilled',owner=first?a:b,reader=first?b:a,runner=first?ra:rb,req=first?ia:ib;
 const job=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;
 expect((await runs.start(owner,req)).id).toBe(job.id);
 const claim=(await runs.claim(owner,runner.id,randomUUID(),runner.credential))!;
 await runs.complete(owner,job.id,{runnerId:runner.id,leaseToken:claim.leaseToken,generation:claim.generation,requestId:randomUUID(),result:{outcome:'completed',project:'unknown',report:'Shared synthetic report',question:'',knowledge:'',evidence:[]}},runner.credential);
 const read=await reports.get(reader,job.id);expect(read.report).toBe('Shared synthetic report');expect(read.canEdit).toBe(true);expect(read.canShare).toBe(false);
 expect(read).not.toHaveProperty('source_id');expect(read).not.toHaveProperty('relatedMails');
 expect(await reports.list(reader,first?sb.id:sa.id,first?789:123)).toHaveLength(1);
 await expect(reports.share(owner,job.id,{permission:'none'})).rejects.toThrow('TEAM_SHARING_REQUIRED');
 expect((await reports.get(reader,job.id)).report).toBe(read.report);
 const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const history=new SharedHistory();
 await directory.grant(owner,first?sa.id:sb.id,{userId:reader.userId,permission:'write'});
 await history.handling(owner,job.id,true);
 expect((await history.get(owner,job.id)).handledAt).toBeTruthy();
 expect((await history.get(reader,job.id)).handledAt).toBeNull();
 await directory.grant(owner,first?sa.id:sb.id,{userId:reader.userId,permission:'none'});
});
test('revision CAS, exact retries, immutable history and conversation ACL',async()=>{
 const {SharedReports}=await import('../apps/history-api/src/shared-reports.js');const reports=new SharedReports();
 const {ReportCollaboration}=await import('../apps/history-api/src/report-collaboration.js');const collaboration=new ReportCollaboration();
 const row=(await pool.query('SELECT r.run_id AS id,s.owner_user_id FROM report_version r JOIN analysis_run a ON a.id=r.run_id JOIN mail_identity m ON m.id=a.mail_key JOIN source s ON s.store_id=m.store_id')).rows[0];
 const owner=row.owner_user_id===a.userId?a:b,other=owner===a?b:a,id=row.id;

 const input=(report:string)=>({requestId:randomUUID(),expectedVersion:1,report,changeNote:'Synthetic correction',evidence:'Synthetic evidence'}),one=input('Version A'),two=input('Version B');
 const attempts=await Promise.allSettled([collaboration.save(owner,id,one),collaboration.save(other,id,two)]);
 expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 expect(attempts.filter(x=>x.status==='rejected').map(x=>String(x.reason))).toEqual(['Error: REPORT_VERSION_CONFLICT']);
 const won=attempts[0].status==='fulfilled',actor=won?owner:other,request=won?one:two;
 expect(await collaboration.save(actor,id,request)).toEqual({version:2});
 await expect(collaboration.save(actor,id,{...request,report:'Changed retry'})).rejects.toThrow('REQUEST_CONFLICT');
 expect((await collaboration.revision(owner,id,1)).report).toBe('Shared synthetic report');
 expect((await collaboration.get(other,id)).version).toBe(2);
 await expect(pool.query('UPDATE report_revision SET report=$1 WHERE run_id=$2',['overwrite',id])).rejects.toThrow('IMMUTABLE_COLLABORATION_RECORD');
 const message={requestId:randomUUID(),kind:'decision',body:'Synthetic decision',evidence:'Proof'};
 const saved=await collaboration.message(other,id,message);expect(await collaboration.message(other,id,message)).toEqual(saved);
 expect((await collaboration.get(owner,id)).messages).toHaveLength(1);
 expect((await collaboration.get(owner,id)).version).toBe(2);
 await expect(reports.share(owner,id,{permission:'none'})).rejects.toThrow('TEAM_SHARING_REQUIRED');
 expect((await collaboration.revision(other,id,1)).report).toBe('Shared synthetic report');
 expect((await collaboration.get(other,id)).version).toBe(2);
});
test('AI questions freeze report version, enforce runner limits and preserve report until explicit save',async()=>{
 const {ReportQuestions}=await import('../apps/history-api/src/report-questions.js');const questions=new ReportQuestions();
 const {ReportCollaboration}=await import('../apps/history-api/src/report-collaboration.js');const collaboration=new ReportCollaboration();
 const row=(await pool.query('SELECT r.run_id AS id,s.owner_user_id,s.id AS source_id FROM report_version r JOIN analysis_run a ON a.id=r.run_id JOIN mail_identity m ON m.id=a.mail_key JOIN source s ON s.store_id=m.store_id')).rows[0];
 const owner=row.owner_user_id===a.userId?a:b;
 const runner=await directory.registerRunner(owner,{requestId:randomUUID(),displayName:'Report reader',agents:['codex'],sourceIds:[row.source_id]});
 const input={requestId:randomUUID(),runnerId:runner.id,agent:'codex',expectedVersion:2,question:'Explain this report',allowEvidence:false};
 const job=await questions.start(owner,row.id,input,runner.credential);expect(job.execute).toBe(true);expect(job.context.version).toBe(2);
 expect((await questions.start(owner,row.id,input,runner.credential)).execute).toBe(false);
 await expect(questions.start(owner,row.id,{...input,requestId:randomUUID()},runner.credential)).rejects.toThrow('REPORT_AGENT_BUSY');
 const result={outcome:'completed',project:'unknown',report:'Synthetic AI answer',question:'',knowledge:'',evidence:[]};
 await questions.complete(owner,job.id,{result},runner.credential);await questions.complete(owner,job.id,{result},runner.credential);
 const after=await collaboration.get(owner,row.id);expect(after.version).toBe(2);expect(after.messages.filter(m=>m.kind==='answer')).toHaveLength(1);
 await expect(questions.complete(owner,job.id,{result:{...result,report:'Changed'}},runner.credential)).rejects.toThrow('RESULT_CONFLICT');
});
test('operator import previews, preserves originals, replays and rejects altered records atomically',async()=>{
 const {importHistory,historyTables}=await import('../apps/history-api/src/import-history.js');
 const owner=await directory.login({issuer:'https://test/',subject:'importer',email:'importer@example.test'});await pool.query("UPDATE membership SET role='admin' WHERE user_id=$1",[owner.userId]);
 const mailId=randomUUID(),runId=randomUUID();
 const tables:any=Object.fromEntries(historyTables.map(t=>[t,[]]));
 tables.mail_identity=[{id:mailId,store_id:'import-fixture',mail_id:42,message_id:evidence.messageId,subject:evidence.subject,created_at:'2026-09-28T00:00:00+00:00',identity_kind:'mcp'}];
 tables.analysis_run=[{id:runId,mail_key:mailId,source:'direct',request_id:randomUUID(),request_hash:'fixture',status:'completed',created_at:'2026-09-28T00:00:00+00:00',progress_events:[]}];
 tables.report_version=[{run_id:runId,result:{report:'Original import'},created_at:'2026-09-28T00:00:00+00:00'}];
 const bundle={format:1,tables},plan={ownerId:owner.userId,teamId:team,collectionId:randomUUID(),permission:'read',sources:[{storeId:'import-fixture',sourceId:randomUUID(),instanceId:randomUUID(),displayName:'Import fixture'}],proofs:[{storeId:'import-fixture',mailId:42,evidence}]};
 const c=await pool.connect();try{
  const preview=await importHistory(c,bundle,plan);expect(preview.applied).toBe(false);
  await expect(importHistory(c,bundle,plan,'0'.repeat(64))).rejects.toThrow('IMPORT_PREVIEW_CHANGED');
  expect((await c.query('SELECT 1 FROM mail_identity WHERE id=$1',[mailId])).rowCount).toBe(0);
  expect((await importHistory(c,bundle,plan,preview.previewHash)).applied).toBe(true);
  const retry=await importHistory(c,bundle,plan);expect(retry.counts.report_version.insert).toBe(0);
  await importHistory(c,bundle,plan,retry.previewHash);
  tables.report_version[0].result.report='Changed';await expect(importHistory(c,bundle,plan)).rejects.toThrow('HISTORY_RECORD_CONFLICT');
  expect((await c.query('SELECT result FROM report_version WHERE run_id=$1',[runId])).rows[0].result.report).toBe('Original import');
 }finally{c.release();}
});


test('team history, original-free access, viewer edits and other-team isolation',async()=>{
 const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const history=new SharedHistory();
 const {SharedReports}=await import('../apps/history-api/src/shared-reports.js');const reports=new SharedReports();
 const {ReportCollaboration}=await import('../apps/history-api/src/report-collaboration.js');const collaboration=new ReportCollaboration();
 const reader=await directory.login({issuer:'https://test/',subject:'team-viewer',email:'viewer@example.test'});
 await pool.query("UPDATE membership SET role='viewer' WHERE user_id=$1",[reader.userId]);
 const all=await history.list(reader);expect(all.length).toBeGreaterThan(0);
 const row=all.find(r=>r.subject===evidence.subject)!;
 expect((await reports.get(reader,row.id)).canEdit).toBe(false);
 expect((await history.get(reader,row.id)).result).toBeTruthy();
 await expect(collaboration.message(reader,row.id,{requestId:randomUUID(),kind:'note',body:'denied',evidence:''})).rejects.toThrow('REPORT_NOT_FOUND');
 expect(await history.list(reader,undefined,0,undefined,'does-not-exist')).toHaveLength(0);
 expect((await history.list(reader,undefined,0,undefined,'',{status:'completed'})).every(r=>r.status==='completed')).toBe(true);
 expect(await history.list(reader,undefined,0,undefined,'',{from:'2099-01-01T00:00:00Z'})).toHaveLength(0);
 const otherTeam=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[otherTeam,'Other reports']);
 const outsider=await new Directory(otherTeam).login({issuer:'https://test/',subject:'outsider',email:'outsider@example.test'});
 expect(await history.list(outsider)).toHaveLength(0);
 await expect(history.get(outsider,row.id)).rejects.toThrow('SOURCE_NOT_FOUND');
 await expect(reports.get(outsider,row.id)).rejects.toThrow('REPORT_NOT_FOUND');
 await expect(history.list(outsider,row.sourceId)).rejects.toThrow('SOURCE_NOT_FOUND');
 await pool.query('UPDATE membership SET active=false WHERE user_id=$1',[reader.userId]);
 await expect(history.list(reader)).rejects.toThrow('MEMBERSHIP_DISABLED');
});

test('independently synced mailbox binds headers before badges and shows team reports without share grants',async()=>{
 const express=(await import('express')).default;
 const {createHistoryApp,errors}=await import('../apps/history-api/src/app.js');
 const {Runs}=await import('../apps/history-api/src/runs.js');
 const {runRoutes}=await import('../apps/history-api/src/run-routes.js');
 const {sharedHistoryRoutes}=await import('../apps/history-api/src/shared-history-routes.js');
 const {collaborationRoutes}=await import('../apps/history-api/src/collaboration-routes.js');
 const {localUiRoutes}=await import('../apps/local-app/src/ui-routes.js');
 const {HistoryClient}=await import('../packages/history-client/src/index.js');
 const {requestContext,finishRoutes}=await import('../packages/contracts/src/http.js');
 const user=await directory.login({issuer:'https://test/',subject:'new-mailbox',email:'new@example.test'});
 const source=await directory.registerSource(user,{instanceId:randomUUID(),displayName:'New mailbox'});
 const runs=new Runs(),remote=createHistoryApp(runs,async()=>user);runRoutes(remote,runs);sharedHistoryRoutes(remote);collaborationRoutes(remote);
 const server=errors(remote).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const client=new HistoryClient('http://127.0.0.1:'+(server.address() as any).port,async()=>'test');
 let selected=true,originalCalls=0;
 const local=express();local.use(requestContext);local.use(express.json());
 localUiRoutes(local,client,{async selection(){return {sourceId:selected?source.id:'',agent:'codex',cacheScope:user.userId,original:selected?{async call(_name:string,args:any){originalCalls++;return {id:args.id,...evidence,fetchedAt:new Date().toISOString(),...(args.id===901?{messageId:null}:{})};}}:undefined};}} as any);
 const web=finishRoutes(local).listen(0,'127.0.0.1');await new Promise<void>(r=>web.once('listening',r));const base='http://127.0.0.1:'+(web.address() as any).port;
 try{
   const response=await fetch(base+'/api/mail-analysis?mailIds=900,901');expect(response.status).toBe(200);
   const summary=await response.json();expect(summary.find((r:any)=>Number(r.mailId)===900).completedCount).toBeGreaterThan(0);
   expect(summary.find((r:any)=>Number(r.mailId)===901)?.runCount??0).toBe(0);
   const listed=await (await fetch(base+'/api/runs?mailId=900')).json();expect(listed.length).toBeGreaterThan(0);
   const report=listed.find((r:any)=>r.subject===evidence.subject);expect(report.originalAvailable).toBe(false);
   const shared=await fetch(base+'/api/mails/900/shared-reports',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
   expect(shared.status).toBe(200);expect((await shared.json()).reports.some((r:any)=>r.id===report.id)).toBe(true);
   const detail=await (await fetch(base+'/api/reports/'+report.id)).json();expect(detail.canEdit).toBe(true);
   const queries=originalCalls;await fetch(base+'/api/mail-analysis?mailIds=900');expect(originalCalls).toBe(queries);
   const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const history=new SharedHistory();
   await history.handling(user,report.id,true);
   expect((await history.summaries(user,source.id,[900]))[0].handledAt).toBeTruthy();
   await history.handling(user,report.id,false);expect((await history.summaries(user,source.id,[900]))[0].handledAt).toBeNull();
   selected=false;
   const all=await fetch(base+'/api/runs');expect(all.status).toBe(200);expect((await all.json()).length).toBeGreaterThan(0);
   expect((await fetch(base+'/api/runs/'+report.id)).status).toBe(200);
 }finally{await new Promise<void>(r=>web.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));}
});


test('team search filters current report text, author, source, dates and stable pagination',async()=>{
 const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const history=new SharedHistory();
 const source=await directory.registerSource(a,{instanceId:randomUUID(),displayName:'Pagination source'});
 const key=randomUUID();await pool.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,1,$3,$4)',[key,source.id,'<pagination@example.test>','Pagination fixture']);
 const ids=Array.from({length:103},()=>randomUUID());
 for(const id of ids)await pool.query("INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status,created_at) VALUES($1,$2,'direct',$3,'fixture','completed','2026-09-20T00:00:00Z')",[id,key,randomUUID()]);
 const first=await history.list(b,source.id),last=await history.list(b,source.id,100);
 expect(first).toHaveLength(100);expect(last).toHaveLength(3);
 expect(new Set([...first,...last].map(r=>r.id)).size).toBe(103);
 expect(await history.list(b,source.id,0,undefined,'',{authorId:b.userId})).toHaveLength(0);
 expect(await history.list(b,source.id,0,undefined,'',{authorId:a.userId,from:'2026-09-19T00:00:00Z',to:'2026-09-21T00:00:00Z'})).toHaveLength(100);
 expect(await history.list(b,source.id,0,undefined,'',{status:'failed'})).toHaveLength(0);
 const {ReportCollaboration}=await import('../apps/history-api/src/report-collaboration.js');const collaboration=new ReportCollaboration();
 await pool.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)',[ids[0],{report:'original unique text'}]);
 await collaboration.save(b,ids[0],{requestId:randomUUID(),expectedVersion:1,report:'revised unique text',changeNote:'Update',evidence:''});
 expect(await history.list(b,undefined,0,undefined,'revised unique text')).toHaveLength(1);
 expect(await history.list(b,undefined,0,undefined,'original unique text')).toHaveLength(0);
});

test('persistent identity checks avoid header rereads above 1000 mails, survive restart and recheck failures',async()=>{
 const express=(await import('express')).default;
 const {createHistoryApp,errors}=await import('../apps/history-api/src/app.js');
 const {Runs}=await import('../apps/history-api/src/runs.js');
 const {sharedHistoryRoutes}=await import('../apps/history-api/src/shared-history-routes.js');
 const {collaborationRoutes}=await import('../apps/history-api/src/collaboration-routes.js');
 const {localUiRoutes}=await import('../apps/local-app/src/ui-routes.js');
 const {HistoryClient}=await import('../packages/history-client/src/index.js');
 const {requestContext,finishRoutes}=await import('../packages/contracts/src/http.js');
 const {ApiError}=await import('../packages/contracts/src/v1.js');
 const user=await directory.login({issuer:'https://test/',subject:'bulk-mailbox',email:'bulk@example.test'});
 const source=await directory.registerSource(user,{instanceId:randomUUID(),displayName:'Bulk mailbox'});
 const remote=createHistoryApp(new Runs(),async()=>user);sharedHistoryRoutes(remote);collaborationRoutes(remote);
 const server=errors(remote).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const client=new HistoryClient('http://127.0.0.1:'+(server.address() as any).port,async()=>'test');
 let headerCalls=0,size=1100,scope='bulk-user:instance:endpoint',fail=false,changed=false;
 const original={async call(name:string,args:any){
   if(name==='search_emails')return {emails:Array.from({length:Math.min(args.limit,size-args.offset)},(_,i)=>({id:args.offset+i+1})),nextOffset:args.offset+args.limit<size?args.offset+args.limit:null};
   expect(name).toBe('get_email');headerCalls++;
   if(fail)throw new ApiError(502,'LOCAL_MCP_UNAVAILABLE');
   return {id:args.id,...evidence,messageId:args.id===1?evidence.messageId:args.id===2?null:`<bulk-${args.id}@example.test>`,...(changed?{subject:'Changed identity'}:{}),fetchedAt:'2026-09-28T00:00:00Z'};
 }};
 const open=async()=>{
   const app=express();app.use(requestContext);app.use(express.json());
   localUiRoutes(app,client,{async selection(){return {sourceId:source.id,agent:'codex',cacheScope:scope,original};}} as any);
   const web=finishRoutes(app).listen(0,'127.0.0.1');await new Promise<void>(r=>web.once('listening',r));return web;
 };
 let web=await open();
 const request=(path:string)=>fetch('http://127.0.0.1:'+(web.address() as any).port+path);
 const read=async(path='/api/mails?analysis_status=unanalysed&limit=30')=>{const response=await request(path);expect(response.status).toBe(200);return response.json();};
 try{
   const first=await read();expect(first.total).toBe(1099);expect(first.emails).toHaveLength(30);expect(headerCalls).toBe(1100);
   expect((await read('/api/mails?analysis_status=unanalysed&limit=30&refresh=1')).total).toBe(first.total);expect(headerCalls).toBe(1100);
   await new Promise<void>(r=>web.close(()=>r()));web=await open();
   await read();expect(headerCalls).toBe(1100);
   size++;expect((await read()).total).toBe(1100);expect(headerCalls).toBe(1101);
   // A successful incomplete-header check is reused too; only its retry window expires.
   await pool.query("UPDATE mail_identity_check SET verified_at=now()-interval '25 hours' WHERE source_id=$1 AND mail_id=2",[source.id]);
   await read();expect(headerCalls).toBe(1102);
   const badge=await read('/api/mail-analysis?mailIds=1');expect(badge[0].completedCount).toBeGreaterThan(0);expect(headerCalls).toBe(1102);
   scope='bulk-user:instance:other-endpoint';await read('/api/mail-analysis?mailIds=1');expect(headerCalls).toBe(1103);
   // A failed forced check must not make a later normal request reuse the old success.
   fail=true;expect((await request('/api/mail-analysis?mailIds=1&refresh=1')).status).toBe(502);
   expect((await request('/api/mail-analysis?mailIds=1')).status).toBe(502);expect(headerCalls).toBe(1105);
   fail=false;await read('/api/mail-analysis?mailIds=1');expect(headerCalls).toBe(1106);
   changed=true;expect((await request('/api/mail-analysis?mailIds=1&refresh=1')).status).toBe(409);
   expect((await request('/api/mail-analysis?mailIds=1')).status).toBe(409);
   changed=false;await read('/api/mail-analysis?mailIds=1');
   const before=headerCalls;await read('/api/mail-analysis?mailIds=1');expect(headerCalls).toBe(before);
   expect((await request('/api/mails?refresh=invalid')).status).toBe(400);
 }finally{await new Promise<void>(r=>web.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));}
},60000);

test('identity verification cache enforces user/source ACL, negative expiry and sync invalidation',async()=>{
 const {bindMails,checkedMails}=await import('../apps/history-api/src/common-mail.js');
 const {SourceSync}=await import('../apps/history-api/src/source-sync.js');
 const source=await directory.registerSource(a,{instanceId:randomUUID(),displayName:'Check invalidation'});
 const scopeHash='a'.repeat(64),request={scopeHash,mailIds:[1,2]};
 const bind=()=>bindMails(a,source.id,{scopeHash,mails:[proof(1),{...proof(2),evidence:{...evidence,messageId:null}}]});
 await bind();expect(await checkedMails(a,source.id,request)).toHaveLength(2);
 await expect(checkedMails(b,source.id,request)).rejects.toThrow('SOURCE_NOT_FOUND');
 await directory.grant(a,source.id,{userId:b.userId,permission:'read'});
 expect(await checkedMails(b,source.id,request)).toHaveLength(0);
 expect(await checkedMails(a,source.id,{...request,scopeHash:'b'.repeat(64)})).toHaveLength(0);
 const other=await directory.registerSource(a,{instanceId:randomUUID(),displayName:'Other checks'});
 expect(await checkedMails(a,other.id,request)).toHaveLength(0);
 const runner=await directory.registerRunner(a,{requestId:randomUUID(),displayName:'Sync checker',agents:['codex'],sourceIds:[source.id]});
 const sync=new SourceSync(),job=await sync.start(a,{sourceId:source.id,runnerId:runner.id,requestId:randomUUID()});
 const lease=await sync.claim(a,job.id,randomUUID(),runner.credential),batchId=randomUUID();
 const credentials={runnerId:runner.id,leaseToken:lease.leaseToken,generation:lease.generation};
 await sync.beginBatch(a,job.id,{...credentials,batchId},runner.credential);
 await sync.batch(a,job.id,{...credentials,batchId,response:{status:'success',saved:1,failed:0,remaining:0,errors:[]}},runner.credential);
 expect(await checkedMails(a,source.id,request)).toHaveLength(0);
 await bind();expect(await checkedMails(a,source.id,request)).toHaveLength(2);
 await directory.grant(a,source.id,{userId:b.userId,permission:'none'});
 await expect(checkedMails(b,source.id,request)).rejects.toThrow('SOURCE_NOT_FOUND');
});

test('team report detail omits related mail metadata until source access is granted',async()=>{
 const {SharedHistory}=await import('../apps/history-api/src/shared-history.js');const history=new SharedHistory();
 const source=await directory.registerSource(a,{instanceId:randomUUID(),displayName:'Private related mail'});
 const mailKey=randomUUID(),runId=randomUUID();
 await pool.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,1,$3,$4)',[mailKey,source.id,'<private-main@example.test>','Team report']);
 await pool.query("INSERT INTO analysis_run(id,mail_key,source,request_id,request_hash,status) VALUES($1,$2,'direct',$3,'fixture','completed')",[runId,mailKey,randomUUID()]);
 await pool.query('INSERT INTO report_version(run_id,result) VALUES($1,$2)',[runId,{report:'Team report'}]);
 await history.handling(a,runId,true);
 await history.related(a,runId,{mail:{id:2,messageId:'<private-related@example.test>',fetchedAt:new Date().toISOString(),subject:'Private related subject'},verifiedAt:new Date().toISOString()});
 expect((await history.get(a,runId)).relatedMails).toHaveLength(1);
 const shared=await history.get(b,runId);expect(shared.result.report).toBe('Team report');expect(shared.relatedMails).toEqual([]);
 expect(JSON.stringify(shared)).not.toContain('private-related@example.test');expect(JSON.stringify(shared)).not.toContain('Private related subject');
 await directory.grant(a,source.id,{userId:b.userId,permission:'read'});
 expect((await history.get(b,runId)).relatedMails).toHaveLength(1);
 await directory.grant(a,source.id,{userId:b.userId,permission:'none'});
 expect((await history.get(b,runId)).relatedMails).toEqual([]);
});
