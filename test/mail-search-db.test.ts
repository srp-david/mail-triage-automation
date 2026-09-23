import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-search-'.repeat(4);
const schema='search_test_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw Error('Tests require a PostgreSQL DATABASE_URL');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);
process.env.PGOPTIONS='-c search_path='+schema;
const {pool,migrate}=await import('../src/db.js');await migrate();
const {config}=await import('../src/config.js'),h=await import('../src/history.js'),a=await import('../src/archive.js');
const {createApp}=await import('../src/server.js');
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});

test('API combines MCP search with latest DB state, legacy links and store-scoped identities',async()=>{
 const input=(mailId:number,storeId=config.store)=>({storeId,mailId,messageId:'<synthetic@example.test>',subject:'Synthetic',source:'direct',requestId:randomUUID()});
 const result={outcome:'completed',project:'unknown',report:'Synthetic',question:'',knowledge:'',evidence:[]};
 const complete=await h.startRun(input(101));await h.finishRun(complete.id,complete.ownerToken!,result);
 const fail=await h.startRun(input(101));await h.failRun(fail.id,fail.ownerToken!,'Synthetic failure');
 await pool.query("UPDATE analysis_run SET created_at=now()-interval '1 day' WHERE id=$1",[complete.id]);
 const handled=await h.startRun(input(102));await h.finishRun(handled.id,handled.ownerToken!,result);await h.setMailHandled(handled.id,true);
 const other=await h.startRun(input(1,'another-store'));await h.finishRun(other.id,other.ownerToken!,result);
 const body='Synthetic legacy',hash=h.digest(body),doc=await a.importLegacy({namespace:'fixture',path:'legacy.md',hash,kind:'report',body});
 await a.linkLegacy(doc.id,hash,{storeId:config.store,mailId:103,messageId:'<legacy@example.test>',subject:'Legacy'},'synthetic fixture');
 let calls=0;
 const server=createApp(async(name,args)=>{
  calls++;assert.equal(name,'search_emails');assert.equal(args.query,'Synthetic');assert.equal(args.from_address,'sender@example.test');assert.equal(args.analysis_status,undefined);
  const rows=Array.from({length:105},(_,i)=>({id:i+1,subject:'Synthetic',messageId:`<fixture-${i+1}@example.test>`,
   inReplyTo:i===101||i===102?[`<fixture-${i}@example.test>`]:[],references:[]})),offset=Number(args.offset),limit=Number(args.limit);
  return {emails:rows.slice(offset,offset+limit),total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null};
 }).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const url='http://127.0.0.1:'+address.port+'/api/mails?query=Synthetic&from_address=sender%40example.test';
 const get=async(status:string,view='individual')=>{const r=await fetch(url+'&analysis_status='+status+'&view='+view,{headers:{Authorization:'Bearer '+config.token}});assert.equal(r.status,200);return r.json();};
 try{
  const expected={completed:[102],failed:[101],handled:[102],legacy:[103],running:[],queued:[],needs_input:[]};
  for(const [status,ids] of Object.entries(expected)){const r=await get(status);assert.deepEqual(r.emails.map((x:any)=>x.id),ids);assert.equal(r.total,ids.length);}
  const fresh=await get('unanalysed');assert.equal(fresh.total,102);assert.equal(fresh.emails[0].id,1);assert.equal(fresh.nextOffset,30);
  const threads=await get('all','threads');assert.equal(threads.total,103);assert.equal(threads.mailTotal,105);assert.equal(threads.nextOffset,30);
  assert.deepEqual(threads.threads.find((thread:any)=>thread.emails.length>1).emails.map((mail:any)=>mail.id),[103,102,101]);
  for(const [status,ids] of Object.entries(expected)){
   const page=await get(status,'threads');assert.deepEqual(page.threads.flatMap((thread:any)=>thread.emails.map((mail:any)=>mail.id)),ids);
   assert.equal(page.mailTotal,ids.length);
  }
  const unanalysedThreads=await get('unanalysed','threads');assert.equal(unanalysedThreads.total,102);
  assert.ok(unanalysedThreads.threads.every((thread:any)=>thread.emails.every((mail:any)=>![101,102,103].includes(mail.id))));
  const before=calls;const invalid=await fetch(url+'&analysis_status=bad',{headers:{Authorization:'Bearer '+config.token}});assert.equal(invalid.status,400);assert.equal(calls,before);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
