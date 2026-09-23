import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright-core';
import {client,options,sha256} from './admin-client.mjs';

const [command,...args]=process.argv.slice(2),o=options(args);
const mailId=Number(o['mail-id']);assert.ok(Number.isSafeInteger(mailId)&&mailId>0,'--mail-id가 필요합니다.');
assert.ok(['begin','verify'].includes(command),'begin 또는 verify를 사용하세요.');
const receiptPath=`.runtime/worker-e2e-${mailId}.json`;
const {api}=await client();
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:'+(env.TRIAGE_PORT??3080));await page.locator('#token').fill(env.TRIAGE_TOKEN);
 await page.locator('#login-form button').click();await page.locator('#workspace:not([hidden])').waitFor();
 const mail=await api('/mails/'+mailId),status=await api('/status');
 await page.locator('#query').fill(mail.subject);
 const searchResponse=page.waitForResponse(r=>r.url().includes('/api/mails?')&&new URL(r.url()).searchParams.get('query')===mail.subject);
 await page.getByRole('button',{name:'검색',exact:true}).click();
 await searchResponse;
 const matches=await api('/mails?limit=100&query='+encodeURIComponent(mail.subject));
 assert.deepEqual(matches.emails.filter(m=>m.subject===mail.subject).map(m=>Number(m.id)),[mailId],'동일 제목의 다른 메일이 있어 자동 선택하지 않습니다.');
 await page.getByRole('button',{name:mail.subject,exact:false}).filter({has:page.locator('strong')}).click();
 await page.locator('#detail h2').waitFor();
 if(command==='begin'){
   assert.equal(o.subject,mail.subject,'사용자가 지정한 정확한 제목을 전달하세요.');
   assert.ok(status.worker?.online,'Worker 연결을 확인하세요.');
   try{await access(receiptPath);throw new Error('검증 receipt가 있습니다. 새 분석을 만들지 말고 기존 실행을 확인하세요.');}catch(e){if(e.code!=='ENOENT')throw e;}
   const prior=await api('/runs?storeId='+encodeURIComponent(status.storeId)+'&mailId='+mailId);
   assert.ok(!prior.some(r=>['queued','running'].includes(r.status)),'이미 분석이 진행 중입니다.');
   await mkdir('.runtime',{recursive:true});
   await page.route('**/api/runs',async route=>{
     if(route.request().method()==='POST'){
       const body=route.request().postDataJSON();assert.equal(body.mailId,mailId);assert.equal(body.source,'web');assert.equal(body.messageId,mail.messageId);
       await writeFile(receiptPath,JSON.stringify({mailId,storeId:status.storeId,requestId:body.requestId,state:'submitting',startedAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});
     }
     await route.continue();
   });
   const pending=page.waitForResponse(r=>r.url().endsWith('/api/runs')&&r.request().method()==='POST');
   await page.getByRole('button',{name:prior.length?'새로 분석':'분석 시작',exact:true}).click();const response=await pending;
   assert.equal(response.status(),201);const run=await response.json();
   const receipt=JSON.parse(await readFile(receiptPath,'utf8'));await writeFile(receiptPath,JSON.stringify({...receipt,runId:run.id,state:'registered'},null,2),{mode:0o600});
   console.log(JSON.stringify({mailId,runId:run.id,status:run.status,startedThroughWebButton:true,pageErrors:errors}));
 }else{
   const receipt=JSON.parse(await readFile(receiptPath,'utf8')),run=await api('/runs/'+receipt.runId);
   assert.ok(['completed','needs_input'].includes(run.status),'결과가 아직 저장되지 않았습니다: '+run.status);
   assert.equal(Number(run.mail_id),mailId);assert.equal(run.source,'web');assert.equal(sha256(run.result.report),run.reportHash);
   await page.getByRole('button',{name:'이 메일 분석 이력',exact:true}).click();
   await page.locator('#mail-runs .run button').filter({hasText:mail.subject}).first().click();
   await page.locator('#report .markdown-body').first().waitFor();
   await page.getByRole('button',{name:'보고서 원문 보기',exact:true}).click();
   assert.equal(await page.locator('#report .markdown-source').first().textContent(),run.result.report);
   await page.getByRole('button',{name:'보고서 문서 보기',exact:true}).click();
   if(o['direct-cli']){
     const {stdout}=await promisify(execFile)(process.execPath,[o['direct-cli'],'get',run.id]);
     const direct=JSON.parse(stdout);assert.equal(direct.id,run.id);assert.deepEqual(direct.result,run.result);assert.equal(direct.reportHash,run.reportHash);
   }
   await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   const result={mailId,runId:run.id,status:run.status,reportHash:run.reportHash,webReportExact:true,directCliExact:!!o['direct-cli'],mobileOverflow:false,pageErrors:errors,evidenceCount:run.result.evidence.length,verifiedAt:new Date().toISOString()};
   await writeFile(`.runtime/worker-e2e-${mailId}-validation.json`,JSON.stringify(result,null,2));
   await writeFile(`.runtime/worker-e2e-${mailId}-result.json`,JSON.stringify(run,null,2),{mode:0o600});
   console.log(JSON.stringify(result));
 }
}finally{await browser.close();}
