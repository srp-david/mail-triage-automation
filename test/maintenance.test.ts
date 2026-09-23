import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='maintenance-fixture-token-'.repeat(4);
const schema='triage_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool,migrate}=await import('../src/db.js');await migrate();
const h=await import('../src/history.js'),a=await import('../src/archive.js');
const {createApp}=await import('../src/server.js');
const result={outcome:'completed',project:'unknown',report:'Synthetic report',question:'',knowledge:'Synthetic verified knowledge.',evidence:[]};
const input=(id:number)=>({storeId:'local-mail-v1',mailId:id,messageId:'<fixture-'+id+'@example.test>',subject:'Fixture',source:'direct',requestId:randomUUID()});
const server=createApp(async(_name,args)=>({id:args.id,messageId:'<fixture-'+args.id+'@example.test>',subject:'Fixture'})).listen(0,'127.0.0.1');
await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
async function api(endpoint:string,body?:unknown){const response=await fetch(base+'/api'+endpoint,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+process.env.TRIAGE_TOKEN,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!response.ok)throw new Error('HTTP '+response.status);return response.json();}
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});

test('legacy import is immutable, hash checked, concurrent idempotent and only explicitly linked',async()=>{
 const body='# Existing report\nOriginal status retained.';
 const data={namespace:'fixture',path:'erp/gg/reports/old.md',hash:h.digest(body),kind:'report',body};
 const copies=await Promise.all([a.importLegacy(data),a.importLegacy(data)]);
 assert.equal(copies[0].id,copies[1].id);assert.equal(copies.filter(x=>x.imported).length,1);
 await assert.rejects(a.importLegacy({...data,body:'Changed'}));
 const newer=await a.importLegacy({...data,body:'Changed',hash:h.digest('Changed')});assert.notEqual(newer.id,copies[0].id);
 assert.equal((await a.getLegacy(copies[0].id)).body,body);
 assert.equal((await a.listLegacy('local-mail-v1',7101)).length,0);
 await assert.rejects(api('/legacy/'+copies[0].id+'/link',{hash:data.hash,storeId:'local-mail-v1',mailId:7101,messageId:'wrong',verifiedBy:'fixture'}));
 await api('/legacy/'+copies[0].id+'/link',{hash:data.hash,storeId:'local-mail-v1',mailId:7101,messageId:'<fixture-7101@example.test>',verifiedBy:'fixture'});
 assert.equal((await a.listLegacy('local-mail-v1',7101)).length,1);
 await assert.rejects(api('/legacy/'+copies[0].id+'/link',{hash:data.hash,storeId:'local-mail-v1',mailId:7102,messageId:'<fixture-7102@example.test>',verifiedBy:'fixture'}));
 const log=await a.importLegacy({...data,path:'.claude/mail/triage-log.md',kind:'log'});
 await assert.rejects(a.linkLegacy(log.id,data.hash,{storeId:'local-mail-v1',mailId:7101,messageId:'<fixture-7101@example.test>',subject:'Fixture'},'fixture'));
});

test('Outlook identity is mailbox scoped and never invents an MCP numeric id',async()=>{
 const input={namespace:'fixture',mailbox:'mailbox-A',entryId:'outlook-entry',messageId:'<same@example.test>',subject:'External fixture',sourceHash:h.digest('original')};
 const one=await a.registerExternal(input),same=await a.registerExternal(input),two=await a.registerExternal({...input,mailbox:'mailbox-B'});
 assert.equal(one.id,same.id);assert.notEqual(one.id,two.id);
 await assert.rejects(a.registerExternal({...input,sourceHash:h.digest('different')}));
 const run=await api('/external-mails/'+one.id+'/runs',{requestId:randomUUID()});
 await h.finishRun(run.id,run.ownerToken,result);
 const stored=await h.getRun(run.id);assert.equal(stored.mail_id,null);assert.equal(stored.identity_kind,'outlook');assert.equal(stored.source,'direct');assert.equal(stored.result.report,result.report);
 assert.equal(await h.claimRun(),null);
});

test('expired results require ownership and explicit revalidation, then retry one new immutable version',async()=>{
 const data=input(7201),run=await h.startRun(data);
 await pool.query("UPDATE analysis_run SET lease_until=now()-interval '1 second' WHERE id=$1",[run.id]);await h.expireRuns();
 const requestId=randomUUID();
 await assert.rejects(api('/runs/'+run.id+'/recover-result',{ownerToken:run.ownerToken,requestId,result}));
 await assert.rejects(h.recoverResult(run.id,'invalid',result,requestId));
 const saved=await api('/runs/'+run.id+'/recover-result',{ownerToken:run.ownerToken,requestId,result,revalidated:true});
 const retry=await api('/runs/'+run.id+'/recover-result',{ownerToken:run.ownerToken,requestId,result,revalidated:true});
 assert.equal(saved.id,retry.id);assert.notEqual(saved.id,run.id);assert.equal((await h.getRun(run.id)).status,'failed');
 assert.equal((await h.getRun(saved.id)).result.report,result.report);
 await assert.rejects(api('/runs/'+run.id+'/recover-result',{ownerToken:run.ownerToken,requestId,result:{...result,report:'Changed'},revalidated:true}));
});

test('Worker leaves queued analyses untouched while the shared API is unavailable',async()=>{
 const {createServer}=await import('node:http');
 const {claimWhenApiReady}=await import('../src/worker-gate.js');
 let healthy=false;
 const fake=createServer((_req,res)=>{res.writeHead(healthy?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:healthy}));}).listen(0,'127.0.0.1');
 await new Promise<void>(r=>fake.once('listening',r));
 const url='http://127.0.0.1:'+(fake.address() as any).port;
 try{
   const run=await h.startRun({...input(7251),source:'web'});
   assert.equal(await claimWhenApiReady(url),null);assert.equal((await h.getRun(run.id)).status,'queued');
   healthy=true;const job=await claimWhenApiReady(url);assert.equal(job.id,run.id);await h.finishRun(job.id,job.ownerToken,result);
 }finally{await new Promise<void>(r=>fake.close(()=>r()));}
});

test('knowledge writer uses source/report hashes, one owner, append-only markers and replay after lost completion',async()=>{
 // @ts-ignore Standalone maintenance CLI is intentionally plain JavaScript.
 const {applyProposal,additionFor}=await import('../scripts/knowledge-writer.mjs');
 // @ts-ignore
 const {namespaceFor,sha256}=await import('../scripts/admin-client.mjs');
 const dir=await mkdtemp(join(tmpdir(),'triage-knowledge-'));
 try{
   const target='erp/gg/docs/fixture.md';await mkdir(join(dir,'erp/gg/docs'),{recursive:true});
   const original='Original knowledge\n';await writeFile(join(dir,target),original);
   const run=await h.startRun(input(7301));await h.finishRun(run.id,run.ownerToken!,result);const stored=await h.getRun(run.id);
   const addition=additionFor(run.id,stored.reportHash,result.knowledge),namespace=await namespaceFor(dir);
   const proposal=await a.prepareKnowledge({runId:run.id,namespace,target,baseHash:sha256(original),reportHash:stored.reportHash,nextHash:sha256(original+addition)});
   await assert.rejects(a.prepareKnowledge({runId:run.id,namespace,target,baseHash:sha256(original),reportHash:h.digest('wrong'),nextHash:sha256(original+addition)}));
   let failed=false;
   await assert.rejects(applyProposal(async(endpoint:string,body:unknown)=>{
     if(endpoint.endsWith('/complete')&&!failed){failed=true;throw new Error('Simulated API outage after file write');}
     return api(endpoint,body);
   },dir,proposal.id));
   assert.equal(await readFile(join(dir,target),'utf8'),original+addition);assert.equal((await a.getKnowledge(proposal.id)).status,'applying');
   await applyProposal(api,dir,proposal.id);await applyProposal(api,dir,proposal.id);
   assert.equal(await readFile(join(dir,target),'utf8'),original+addition);
   assert.equal((await a.getKnowledge(proposal.id)).status,'applied');
   await writeFile(join(dir,target),'Concurrent edit');await assert.rejects(applyProposal(api,dir,proposal.id));
   assert.equal(await readFile(join(dir,target),'utf8'),'Concurrent edit');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('legacy CLI previews and imports only unchanged source files, preserving original bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'triage-legacy-'));
 const run=promisify(execFile);
 try{
   await mkdir(join(dir,'erp/gg/reports'),{recursive:true});await mkdir(join(dir,'.claude/mail'),{recursive:true});
   const file=join(dir,'erp/gg/reports/fixture.md');await writeFile(file,'\ufeff# 원본 합성 보고서\r\n');
   await writeFile(join(dir,'.claude/mail/triage-log.md'),'# Synthetic legacy log');
   const before=await readFile(file),manifest=join(dir,'manifest.json'),configuration=join(dir,'api.json');
   await writeFile(configuration,JSON.stringify({url:base,token:process.env.TRIAGE_TOKEN,storeId:'local-mail-v1'}));
   const cli=async(...args:string[])=>JSON.parse((await run(process.execPath,[resolve('scripts/legacy-history.mjs'),...args],{env:{...process.env,TRIAGE_CONFIG:configuration}})).stdout);
   assert.equal((await cli('preview','--root',dir,'--out',manifest)).documents,2);
   assert.equal((await cli('import','--manifest',manifest)).imported,2);
   assert.equal((await cli('import','--manifest',manifest)).existing,2);
   assert.deepEqual(await readFile(file),before);
   await writeFile(file,'changed after preview');await assert.rejects(cli('import','--manifest',manifest));
 }finally{await rm(dir,{recursive:true,force:true});}
});
