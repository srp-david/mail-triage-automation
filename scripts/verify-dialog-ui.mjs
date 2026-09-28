import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
await mkdir('.runtime/dialog-ui',{recursive:true});const home=await mkdtemp(resolve('.runtime/dialog-ui/run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const control=randomBytes(32).toString('base64url'),origin='http://127.0.0.1:'+port;
const actor={userId:'synthetic',role:'analyst'},session={usernameMode:true,token:async()=> 'synthetic',identity:async()=>actor,status:async()=>actor};
const subject='[합성 자료] 월말 업무 확인 요청 · 긴 메일 제목의 정렬과 작은 화면 줄바꿈 확인 '.repeat(3);
const report='# 업무 확인 결과\n\n합성 보고서입니다. 실제 메일과 계정은 사용하지 않았습니다.\n\n| 구분 | 결과 |\n|---|---|\n| 연결 | 확인 완료 |\n\n## 확인할 내용\n\n담당자와 처리 기한을 확인합니다.';
const run={id:'synthetic-run',subject,status:'completed',source:'web',store_id:'synthetic-source',mail_id:1,created_at:'2026-09-28T00:00:00Z',collaboration:true,result:{report},reviews:[]};
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  app.get('/api/status',(_req,res)=>res.json({storeId:'synthetic-source',originalAvailable:true,sync:null}));
  app.get('/api/updates',(_req,res)=>res.json({status:'unavailable',phase:'idle',currentVersion:'0.3.9'}));
  app.get('/api/runs',(_req,res)=>res.json([run,{...run,id:'synthetic-run-2',subject:'[합성 자료] 짧은 제목 확인'}]));
  app.get('/api/runs/:id',(_req,res)=>res.json(run));
  app.get('/api/reports/:id',(_req,res)=>res.json({id:run.id,subject,author:'합성 사용자',createdAt:run.created_at,canShare:true,permission:'read'}));
  app.get('/api/reports/:id/collaboration',(_req,res)=>res.json({version:1,report,canEdit:true,revisions:[{version:1,changeNote:'첫 보고서',createdAt:run.created_at}],messages:[]}));
  app.get('/api/legacy',(_req,res)=>res.json([]));
  app.get('/api/mail-analysis',(_req,res)=>res.json([]));
  app.get('/api/mails',(_req,res)=>res.json({emails:[{id:1,subject,from:[]}],total:1,nextOffset:null}));
  app.get('/api/mails/:id',(_req,res)=>res.json({id:1,subject,body:'합성 메일',attachments:[]}));
  app.get('/api/mails/:id/body',(_req,res)=>res.json({html:''}));
  app.post('/api/mails/:id/shared-reports',(_req,res)=>res.json({match:{matched:true},reports:[{id:run.id,author:'합성 사용자',createdAt:run.created_at}]}));
}}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
const noOverflow=async locator=>assert.equal(await locator.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
try{
  const ticket=await(await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}})).json();await page.goto(ticket.url);
  await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#runs button').first().click();
  const dialog=page.locator('#history-dialog');await dialog.getByRole('button',{name:'보고서 편집',exact:true}).click();
  await dialog.getByLabel('보고서 초안',{exact:true}).waitFor();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);await noOverflow(dialog);await noOverflow(page.locator('#history-body'));
    for(const row of await dialog.locator('.dialog-button-row').all())assert.equal(await row.evaluate(el=>parseFloat(getComputedStyle(el).gap)>=12),true);
    await page.locator('#history-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:join(home,'report-'+width+'.png')});
    await dialog.getByLabel('보고서 초안',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:join(home,'editor-'+width+'.png')});
  }
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('link',{name:'메일함',exact:true}).click();await page.locator('#mails .mail').first().click();
  await page.locator('button.history-button').click();await page.locator('#mail-runs button').first().waitFor();await page.waitForTimeout(300);await noOverflow(page.locator('#history-body'));await page.screenshot({path:join(home,'history-list.png')});
  await page.keyboard.press('Escape');await page.getByRole('button',{name:/공유 분석 보기/}).click();
  const shared=page.getByRole('dialog',{name:'공유 분석',exact:true});await shared.waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(300);await noOverflow(shared);await noOverflow(shared.locator('.MuiDialogContent-root'));await page.screenshot({path:join(home,'shared-'+width+'.png')});}
  await shared.getByRole('button',{name:'닫기',exact:true}).click();
  const index=await readFile('public/react/index.html','utf8'),assets=[...index.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m=>m[1]),hash=b=>createHash('sha256').update(b).digest('hex'),hashes={};
  for(const asset of assets){const bytes=Buffer.from(await(await fetch(origin+asset)).arrayBuffer());hashes[asset]=hash(bytes);assert.equal(hash(bytes),hash(await readFile(join('public',asset))));}
  assert.deepEqual(errors,[]);const result={home,historyList:true,reportEditor:true,sharedDialog:true,desktopAnd390pxNoOverflow:true,buttonGap:12,escapeClose:true,servedAssets:hashes,realDataUsed:false};await writeFile(join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
