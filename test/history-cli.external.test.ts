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

test('direct CLI and web API share reports without writing legacy files',async()=>{
 const {mkdtemp,mkdir,readFile,writeFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const {createApp}=await import('../src/server.js');
 const dir=await mkdtemp(join(tmpdir(),'triage-cli-'));
 const fixture={id:99001,messageId:'<cli-fixture@example.test>',subject:'Synthetic CLI fixture',body:'Test only'};
 const server=createApp(async()=>fixture,async()=>fixture).listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port;
 try{
  const source=process.env.TRIAGE_CLI_SOURCE;if(!source)throw new Error('Set TRIAGE_CLI_SOURCE to the real erp-manager CLI');
  await mkdir(join(dir,'tools'));
  await writeFile(join(dir,'tools/triage-history.mjs'),await readFile(source));
  const configFile=join(dir,'config.json');
  await writeFile(configFile,JSON.stringify({url:base,token:process.env.TRIAGE_TOKEN,storeId:'local-mail-v1'}));
  const cli=async(...args:string[])=>JSON.parse((await promisify(execFile)(process.execPath,[join(dir,'tools/triage-history.mjs'),...args],
    {env:{...process.env,TRIAGE_CONFIG:configFile}})).stdout);
  const run=await cli('begin','99001');assert.equal(run.status,'running');
  const output=join(dir,'result.json');await writeFile(output,JSON.stringify(result));
  await cli('complete',run.id,output);
  const headers={authorization:'Bearer '+process.env.TRIAGE_TOKEN,'Content-Type':'application/json'};
  const stored=await (await fetch(base+'/api/runs/'+run.id,{headers})).json();
  assert.equal(stored.result.report,result.report);
  const web=await (await fetch(base+'/api/runs',{method:'POST',headers,body:JSON.stringify({
    storeId:'local-mail-v1',mailId:99001,messageId:fixture.messageId,source:'web',requestId:randomUUID()
  })})).json();
  const claimed=await h.claimRun();assert.equal(claimed.id,web.id);
  await h.finishRun(claimed.id,claimed.ownerToken,{...result,report:'Synthetic web report'});
  const list=await cli('list','99001');assert.equal(list.length,2);assert.ok(list.some((x:any)=>x.source==='web'));
  assert.equal((await cli('get',web.id)).result.report,'Synthetic web report');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
