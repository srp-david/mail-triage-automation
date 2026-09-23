import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-thread-links-'.repeat(4);
const schema='thread_test_'+randomUUID().replaceAll('-','');
if(!process.env.DATABASE_URL)throw Error('Tests require a PostgreSQL DATABASE_URL');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);
process.env.PGOPTIONS='-c search_path='+schema;
const {pool,migrate}=await import('../src/db.js');await migrate();
const {config}=await import('../src/config.js'),{createApp}=await import('../src/server.js');
const {threadLinkStore}=await import('../src/thread-links.js');
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
const mails=Array.from({length:4},(_,i)=>({id:i+1,messageId:i===3?null:`<${i+1}@example.test>`,fetchedAt:'2026-01-01T00:00:00Z',subject:'Synthetic '+(i+1),inReplyTo:i===1?['<1@example.test>']:[],references:[]}));
const identity=(id:number)=>{const {messageId,fetchedAt}=mails[id-1];return {id,messageId,fetchedAt};};

test('manual links persist, validate identities, isolate stores, and unlink without touching history',async()=>{
 let reads=0;
 const call=async(name:string,args:any)=>{
  if(name==='get_email'){reads++;assert.equal(args.body_limit,1);return mails[Number(args.id)-1];}
  assert.equal(name,'search_emails');return {emails:args.query?mails.filter(m=>m.id===2||m.id===3):mails,nextOffset:null};
 };
 const server=createApp(call).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port+'/api';
 const request=async(path:string,body?:any,headers:Record<string,string>={})=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 const body={storeId:config.store,source:identity(3),target:identity(1)};
 const groups=async(query='')=>{const r=await request('/mails?view=threads'+query);assert.equal(r.status,200);return r.json();};
 try{
  assert.equal((await request('/thread-links',body,{Authorization:''})).status,401);
  assert.equal((await request('/thread-links',body,{Origin:'https://foreign.example'})).status,403);
  assert.equal((await request('/thread-links',{...body,storeId:'another-store'})).status,409);
  assert.equal((await request('/thread-links',{...body,target:body.source})).status,400);assert.equal(reads,0);
  assert.equal((await request('/thread-links',{...body,source:{...body.source,fetchedAt:'stale'}})).status,409);
  assert.equal((await request('/thread-links',{...body,source:{...body.source,subject:'forged'}})).status,400);
  assert.equal((await threadLinkStore.list(config.store)).length,0);
  const baseline=await groups();assert.equal(baseline.total,3);
  const pair=await Promise.all([request('/thread-links',body),request('/thread-links',{...body,source:body.target,target:body.source})]);
  assert.ok(pair.every(r=>r.status===200));const results=await Promise.all(pair.map(r=>r.json()));
  assert.equal(results.filter(r=>r.created).length,1);assert.equal(results[0].link.id,results[1].link.id);
  const link=results[0].link;assert.equal(link.source.subject,'Synthetic 1');
  assert.equal((await groups()).total,2);
  const filtered=await groups('&query=selected');assert.equal(filtered.total,1);assert.equal(filtered.mailTotal,2);
  assert.deepEqual(filtered.threads[0].emails.map((m:any)=>m.id),[3,2]);assert.equal(filtered.threads[0].totalMembers,3);
  const other=await threadLinkStore.add('another-store',mails[0],mails[3]);
  assert.equal((await (await request('/thread-links')).json()).length,1);
  await request('/thread-links/'+other.link.id+'/unlink',{storeId:config.store});assert.equal((await threadLinkStore.list('another-store')).length,1);
  assert.equal((await request('/thread-links/'+link.id+'/unlink',{storeId:'another-store'})).status,409);
  const nullId=await request('/thread-links',{...body,source:identity(4)});assert.equal(nullId.status,200);assert.equal((await groups()).total,1);
  const original=mails[2].fetchedAt;mails[2].fetchedAt='2026-02-01T00:00:00Z';assert.equal((await groups()).total,2);
  assert.equal((await request('/thread-links',{...body,source:identity(3)})).status,409);mails[2].fetchedAt=original;
  // Read through a fresh app instance to prove the relation is not process-local state.
  const fresh=createApp(call).listen(0,'127.0.0.1');await new Promise<void>(r=>fresh.once('listening',r));
  try{const addr=fresh.address();assert.ok(addr&&typeof addr!=='string');const r=await fetch('http://127.0.0.1:'+addr.port+'/api/thread-links',{headers:{Authorization:'Bearer '+config.token}});assert.equal((await r.json()).length,2);}
  finally{await new Promise<void>(r=>fresh.close(()=>r()));}
  const allLinks=await threadLinkStore.list(config.store);
  const detach={storeId:config.store,mail:identity(1),linkIds:allLinks.map(link=>link.id)};
  assert.equal((await request('/thread-links/detach',detach,{Authorization:''})).status,401);
  assert.equal((await request('/thread-links/detach',detach,{Origin:'https://foreign.example'})).status,403);
  assert.equal((await request('/thread-links/detach',{...detach,storeId:'another-store'})).status,409);
  assert.equal((await request('/thread-links/detach',{...detach,mail:{...detach.mail,fetchedAt:'stale'}})).status,409);
  // A valid edge followed by an unrelated edge must not partially detach the mail.
  assert.equal((await request('/thread-links/detach',{...detach,mail:identity(3),linkIds:[link.id,...allLinks.filter(l=>l.id!==link.id).map(l=>l.id)]})).status,409);
  assert.equal((await threadLinkStore.list(config.store)).length,2);
  const detached=await request('/thread-links/detach',detach);assert.equal(detached.status,200);assert.equal((await detached.json()).removed,2);
  assert.equal((await (await request('/thread-links/detach',detach)).json()).removed,0);
  assert.equal((await threadLinkStore.list('another-store')).length,1);
  assert.equal((await request('/thread-links/'+link.id+'/unlink',{storeId:config.store})).status,200);
  assert.equal((await groups()).total,3);assert.equal((await groups()).mailTotal,4);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM analysis_run')).rows[0].count,0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM mail_identity')).rows[0].count,0);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
