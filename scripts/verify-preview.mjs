import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
// Same server/static headers as the app, no DB or MCP operations. Every API response is synthetic.
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='preview-fixture-token-'.repeat(4);
let server;
let base=process.env.PREVIEW_BASE_URL;
if(!base){
 const {createApp}=await import('../src/server.ts');
 server=createApp().listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 base='http://127.0.0.1:'+server.address().port;
}
const formats=['docx','pptx','xlsx'];
const files=Object.fromEntries(await Promise.all(formats.map(async ext=>[ext,await readFile('.runtime/preview-fixtures/sample.'+ext)])));
const attachments=formats.map((ext,i)=>({attachmentId:'1.'+(i+1),filename:'sample.'+ext,size:files[ext].length,contentType:'application/octet-stream'}));
attachments.push({attachmentId:'1.4',filename:'large.docx',size:6*1024*1024},{attachmentId:'1.5',filename:'archive.zip',size:10},{attachmentId:null,filename:'missing.xlsx',size:10});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[],external=[],mutations=[],consoleErrors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(base+'/'))external.push(r.url());});
let mode='ok',downloadCalls=0;
await page.route('**/api/**',async route=>{
 const r=route.request(),path=new URL(r.url()).pathname;
 if(r.method()!=='GET')mutations.push(path);
 let value;
 if(path==='/api/status')value={storeId:'fixture',sync:null,worker:null};
 else if(path==='/api/mail-analysis')value=[];
 else if(path==='/api/mails')value={emails:[{id:900001,subject:'Synthetic preview mail',from:[]}],total:1,nextOffset:null};
 else if(path==='/api/runs')value=[];
 else if(path==='/api/mails/900001')value={id:900001,subject:'Synthetic preview mail',body:'Preview fixtures only',attachments};
 else if(path.endsWith('/body'))value={html:'',inlineImages:[]};
 else if(path.endsWith('/download')){
   downloadCalls++;
   if(mode==='unauthorized')return route.fulfill({status:401,json:{error:'unauthorized'}});
   if(mode==='fail')return route.fulfill({status:502,json:{error:'합성 다운로드 오류'}});
   const i=Number(path.split('/').at(-2).split('.').at(-1))-1;
   const body=mode==='corrupt'?Buffer.from('PK\x03\x04broken archive'):files[formats[i]];
   return route.fulfill({body,headers:{'Content-Type':'application/octet-stream'}});
 } else throw new Error('Unexpected API path '+path);
 return route.fulfill({json:value});
});
const dialog=page.locator('.office-preview');
async function open(index){await page.locator('.attachment-row').nth(index).locator('.preview-button').click();await dialog.waitFor();}
async function loaded(){
 await page.waitForFunction(()=>document.querySelector('.office-preview .preview-status')?.hidden||
   [...document.querySelectorAll('.preview-controls button')].some(b=>b.textContent==='다시 시도'&&!b.hidden),{},{timeout:45000});
 assert.equal(await dialog.locator('.preview-status').evaluate(e=>e.hidden),true,await dialog.locator('.preview-status').textContent());
}
async function close(){await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'});}
try{
 await page.goto(base);await page.locator('#mails .mail').click();await page.locator('.mail-attachments summary').click();
 assert.equal(await page.locator('.preview-button').count(),5);
 assert.equal(await page.locator('.attachment-row').nth(3).locator('.preview-button').isDisabled(),true);
 assert.equal(await page.locator('.attachment-row').nth(4).locator('.preview-button').count(),0);
 assert.equal(await page.locator('.attachment-row').nth(5).locator('.preview-button').isDisabled(),true);
 assert.equal(downloadCalls,0);
 await mkdir('.runtime',{recursive:true});
 for(let i=0;i<3;i++){
   await open(i);await loaded();
   const frame=page.frameLocator('.preview-viewport iframe');
   if(i===0){await frame.getByText('DOCX Preview Sample',{exact:true}).waitFor();await frame.getByText('Quantity 42',{exact:true}).waitFor();}
   if(i===1){await frame.getByText('PPTX Preview Sample',{exact:true}).waitFor();await frame.getByText('Second Slide 42',{exact:true}).waitFor();}
   if(i===2){
     await frame.getByRole('button',{name:'Summary',exact:true}).waitFor();
     await frame.getByRole('button',{name:'Details',exact:true}).click();
     assert.equal(await frame.getByRole('button',{name:'Details',exact:true}).getAttribute('aria-pressed'),'true');
     await frame.getByText('100%',{exact:true}).waitFor();
     assert.equal(await frame.locator('[contenteditable=true]').count(),0);
   }
   await dialog.screenshot({path:'.runtime/preview-'+formats[i]+'.png'});
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth),false);
   await dialog.screenshot({path:'.runtime/preview-'+formats[i]+'-mobile.png'});
   await page.setViewportSize({width:1440,height:1000});await close();
 }
 mode='fail';await open(0);await dialog.getByText('합성 다운로드 오류',{exact:true}).waitFor();
 mode='ok';await dialog.getByRole('button',{name:'다시 시도',exact:true}).click();await loaded();
 const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'원본 다운로드',exact:true}).click();
 const download=await pending;assert.deepEqual(await readFile(await download.path()),files.docx);await close();
 mode='unauthorized';await open(0);await dialog.getByText(/접속이 만료/).waitFor();await close();
 mode='corrupt';for(let i=0;i<3;i++){await open(i);await dialog.getByText(/문서를 표시하지 못했습니다/).waitFor({timeout:45000});await close();}
 mode='ok';await open(1);await loaded();
 const frame=page.frames().find(f=>f.url().endsWith('/preview/'));
 const blocked=await frame.evaluate(async()=>{
   const probes=[];
   try{await fetch('https://example.invalid/should-not-load');probes.push(false);}catch{probes.push(true);}
   probes.push(await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(false);img.onerror=()=>resolve(true);img.src='https://example.invalid/tracker.png';document.body.append(img);}));
   return probes;
 });
 assert.deepEqual(blocked,[true,true]);
 await frame.evaluate(()=>{const a=document.createElement('a');a.href='https://example.invalid/link';a.textContent='Blocked document link';document.body.append(a);a.click();});
 assert.ok(frame.url().endsWith('/preview/'));
 await frame.locator('body').press('Escape');await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('.attachment-row').nth(1).locator('.preview-button').evaluate(e=>e===document.activeElement),true);
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 // Blocked CSP probes may emit a request event but must never produce a response.
 assert.ok(external.every(url=>url.startsWith('https://example.invalid/')));
 console.log(JSON.stringify({formats,syntheticOoxmlRendered:true,mobile:true,retry:true,byteExactDownload:true,unauthorized:true,corrupt:true,externalBlocked:blocked,escapeFocus:true,apiMutations:mutations,pageErrors:errors,consoleErrors}));
}catch(error){console.error(JSON.stringify({consoleErrors,errors}));await page.screenshot({path:'.runtime/preview-failure.png'});throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
await standalone(import.meta.url,verify);
