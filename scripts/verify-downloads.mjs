import { chromium } from 'playwright-core';
import { readFile,mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:'+(env.TRIAGE_PORT??3080));
 await page.locator('#token').fill(env.TRIAGE_TOKEN);await page.locator('#login-form button').click();
 await page.locator('#mails .mail').first().waitFor({timeout:30000});
 const list=await page.evaluate(async()=>(await fetch('/api/mails?limit=30')).json());
 const index=list.emails.findIndex(m=>m.hasAttachments);assert.ok(index>=0);
 const id=list.emails[index].id;
 await page.locator('#mails .mail').nth(index).click();
 await page.locator('.mail-attachments summary').click();
 await page.locator('.attachment-row').first().waitFor();
 const mail=await page.evaluate(async id=>(await fetch('/api/mails/'+id)).json(),id);
 assert.equal(await page.locator('.attachment-row').count(),mail.attachments.length);
 const attachment=mail.attachments.find(a=>a.attachmentId&&a.size<=5*1024*1024);
 assert.ok(attachment);
 const response=await page.evaluate(async({id,aid})=>(await fetch('/api/mails/'+id+'/attachments/'+aid)).json(),{id,aid:attachment.attachmentId});
 const block=response.content.find(b=>b.type==='image'||b.type==='resource'&&b.resource?.blob!=null);
 const expected=Buffer.from(block.type==='image'?block.data:block.resource.blob,'base64');
 const event=page.waitForEvent('download');
 await page.locator('.attachment-row').nth(mail.attachments.indexOf(attachment)).locator('.download-button').click();
 const actual=await event;
 assert.deepEqual(await readFile(await actual.path()),expected);
 const bytes=Buffer.from([0,255,42,128,1]);
 const fixtures=['zip','docx','pptx','xlsx'].map((ext,i)=>({
   attachmentId:'1.'+(i+10),filename:'샘플.'+ext,contentType:'application/octet-stream',size:bytes.length
 }));
 fixtures.push({attachmentId:'1.20',filename:'큰파일.zip',contentType:'application/zip',size:6*1024*1024});
 fixtures.push({attachmentId:null,filename:'<img src=x onerror=alert(1)>.docx',contentType:'application/octet-stream',size:0});
 await page.route('**/api/mails/'+id,route=>route.fulfill({json:{...mail,body:'첨부파일 표시 검증용 합성 본문',attachments:fixtures}}));
 await page.route('**/api/mails/'+id+'/body',route=>route.fulfill({json:{html:'',inlineImages:[]}}));
 let failFirst=true;
 await page.route('**/api/mails/'+id+'/attachments/*/download',route=>{
   if(failFirst){failFirst=false;return route.fulfill({status:502,json:{error:'검증용 다운로드 실패'}});}
   return route.fulfill({status:200,headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment'},body:bytes});
 });
 await page.locator('#mails .mail').nth(index).click();
 await page.getByText('첨부파일 표시 검증용 합성 본문',{exact:true}).waitFor();
 await page.locator('.mail-attachments summary').click();
 const rows=page.locator('.attachment-row');
 assert.equal(await rows.count(),6);
 assert.equal(await rows.nth(5).locator('img').count(),0);
 assert.equal(await rows.nth(4).locator('.download-button').isDisabled(),true);
 assert.equal(await rows.nth(5).locator('.download-button').isDisabled(),true);
 await rows.nth(0).locator('.download-button').click();
 await rows.nth(0).getByText('검증용 다운로드 실패',{exact:true}).waitFor();
 for(let i=0;i<4;i++){
   const pending=page.waitForEvent('download');
   await rows.nth(i).locator('.download-button').click();
   const download=await pending;
   assert.equal(download.suggestedFilename(),fixtures[i].filename);
   assert.deepEqual(await readFile(await download.path()),bytes);
   assert.ok((await rows.nth(i).locator('.attachment-meta').textContent()).startsWith(fixtures[i].filename.split('.').pop().toUpperCase()));
 }
 await mkdir('.runtime',{recursive:true});
 await page.locator('.mail-attachments').screenshot({path:'.runtime/attachments-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('.mail-attachments').screenshot({path:'.runtime/attachments-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({realMailId:id,realAttachmentCount:mail.attachments.length,realDownloadBytes:expected.length,byteMatch:true,fixtureFormats:['ZIP','DOCX','PPTX','XLSX'],failureRetry:true,oversizeNotice:true,filenameEscaped:true,mobileOverflow:false,pageErrors:errors}));
}finally{await browser.close();}
