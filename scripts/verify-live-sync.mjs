import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
if(process.env.VERIFY_LIVE_SYNC!=='1')throw new Error('실제 POP3 수집을 실행하려면 VERIFY_LIVE_SYNC=1을 지정하세요.');
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:'+(env.TRIAGE_PORT??3080));
 await page.locator('#token').fill(env.TRIAGE_TOKEN);await page.locator('#login-form button').click();
 await page.locator('#workspace:not([hidden])').waitFor();
 const before=await page.evaluate(()=>fetch('/api/status').then(r=>r.json()));
 const active=status=>['running','retrying','stopping'].includes(status);
 assert.equal(active(before.sync?.status),false,'진행 중 동기화가 있습니다.');
 const response=page.waitForResponse(r=>r.url().endsWith('/api/sync')&&r.request().method()==='POST');
 await page.locator('#sync').click();assert.equal((await response).status(),202);
 let status;
 for(let i=0;i<360;i++){
   status=await page.evaluate(()=>fetch('/api/status').then(r=>r.json()));
   if(status.sync?.id!==before.sync?.id&&!active(status.sync?.status))break;
   if(i%6===0)console.log(JSON.stringify({syncStatus:status.sync?.status,saved:status.sync?.saved,failed:status.sync?.failed,remaining:status.sync?.remaining}));
   await page.waitForTimeout(5000);
 }
 assert.notEqual(status.sync?.id,before.sync?.id);assert.equal(active(status.sync?.status),false,'동기화가 계속 실행 중입니다. 새 실행을 만들지 마세요.');
 await page.waitForFunction(saved=>document.querySelector('#sync-status').textContent.includes('저장 '+saved+'건'),status.sync.saved,{timeout:15000});
 const display=await page.locator('#sync-status').textContent();
 assert.match(display,new RegExp('저장 '+status.sync.saved+'건'));assert.deepEqual(errors,[]);
 const result={buttonInvoked:true,status:status.sync.status,saved:status.sync.saved,failed:status.sync.failed,remaining:status.sync.remaining,workerOnline:status.worker?.online,pageErrors:errors};
 await writeFile('.runtime/live-sync-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
