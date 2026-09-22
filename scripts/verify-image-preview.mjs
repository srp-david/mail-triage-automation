import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
// All API responses are synthetic; no customer, DB or MCP access.
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='image-fixture-token-'.repeat(4);
const {createApp}=await import('../src/server.ts');
const server=createApp().listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const png=Buffer.from(await page.evaluate(()=>{
 const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#e4f1eb';ctx.fillRect(0,0,1600,900);
 ctx.fillStyle='#216859';ctx.font='64px sans-serif';ctx.fillText('Image preview fixture',120,200);
 ctx.strokeStyle='#216859';ctx.lineWidth=8;ctx.strokeRect(4,4,1592,892);
 return canvas.toDataURL('image/png').split(',')[1];
}),'base64');
const attachments=[
 {attachmentId:'1.1',filename:'inline.png',contentType:'image/png',size:png.length},
 {attachmentId:'1.2',filename:'attachment.png',contentType:'application/octet-stream',size:png.length},
 {attachmentId:'1.3',filename:'large.jpg',contentType:'image/jpeg',size:6*1024*1024},
 {attachmentId:null,filename:'missing.png',contentType:'image/png',size:1},
 {attachmentId:'1.5',filename:'unsupported.svg',contentType:'image/svg+xml',size:1}
];
const errors=[],mutations=[],imageCalls=[],downloadCalls=[];
let mode='ok',plain=false,releaseSlow,slowStarted;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(request.method()!=='GET')mutations.push(path);
 let value;
 if(path==='/api/status')value={storeId:'fixture',sync:null,worker:null};
 else if(path==='/api/mail-analysis'||path==='/api/runs')value=[];
 else if(path==='/api/mails')value={emails:[{id:900001,subject:'Synthetic image mail',from:[]}],total:1,nextOffset:null};
 else if(path==='/api/mails/900001')value={id:900001,subject:'Synthetic image mail',body:'Plain fixture body',attachments};
 else if(path.endsWith('/body')){
   if(plain)return route.fulfill({status:503,json:{error:'fixture unavailable'}});
   value={html:'<p>Before<img src="cid:fixture">After</p>',inlineImages:[{contentId:'fixture',attachmentId:'1.1'}]};
 }else if(path.endsWith('/download')){
   downloadCalls.push(path);
   if(mode==='slow'){slowStarted();await new Promise(resolve=>{releaseSlow=resolve;});}
   if(mode==='fail')return route.fulfill({status:502,json:{error:'합성 다운로드 오류'}});
   if(mode==='unauthorized')return route.fulfill({status:401,json:{error:'unauthorized'}});
   const bytes=mode==='large'?Buffer.alloc(5*1024*1024+1):mode==='corrupt'?Buffer.from('invalid image'):png;
   return route.fulfill({body:bytes,headers:{'Content-Type':'application/octet-stream'}});
 }else if(path.includes('/attachments/')){
   imageCalls.push(path);
   value={content:[{type:'image',mimeType:'image/png',data:png.toString('base64')}]};
 }else throw new Error('Unexpected API path '+path);
 await route.fulfill({json:value});
});
const dialog=page.locator('.office-preview');
const buttons=page.locator('.attachment-row .preview-button');
async function open(index=1){await buttons.nth(index).click();await dialog.waitFor();}
async function loaded(){await page.waitForFunction(()=>{
 const img=document.querySelector('.image-preview-viewport img');
 return img?.naturalWidth>0&&document.querySelector('.preview-status').hidden;
});}
async function close(){await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'});}
try{
 await page.goto(base);await page.locator('#mails .mail').click();
 await page.waitForFunction(()=>document.querySelector('.mail-body .inline-image img')?.naturalWidth>0);
 assert.equal(await page.locator('.mail-attachments').evaluate(e=>e.open),false);
 assert.equal(await page.locator('.mail-images').count(),0);
 assert.deepEqual(await page.locator('.inline-image').evaluate(e=>[e.previousSibling.textContent,e.nextSibling.textContent]),['Before','After']);
 assert.equal(imageCalls.length,1);assert.ok(imageCalls[0].endsWith('/1.1'));assert.equal(downloadCalls.length,0);
 await page.locator('.mail-attachments summary').click();
 assert.equal(await buttons.count(),4);
 assert.equal(await buttons.nth(2).isDisabled(),true);assert.equal(await buttons.nth(3).isDisabled(),true);
 await open();await loaded();assert.equal(downloadCalls.length,1);
 const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'원본 다운로드'}).click();
 assert.deepEqual(await readFile(await (await pending).path()),png);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 assert.equal(await buttons.nth(1).evaluate(e=>e===document.activeElement),true);
 await open(0);await loaded();await close();
 for(const [testMode,message] of [['fail','합성 다운로드 오류'],['corrupt','이미지를 표시하지 못했습니다'],['large','5 MiB까지 지원']]){
   mode=testMode;await open();await dialog.getByText(new RegExp(message)).waitFor();
   mode='ok';await dialog.getByRole('button',{name:'다시 시도'}).click();await loaded();await close();
 }
 const started=new Promise(resolve=>{slowStarted=resolve;});mode='slow';await open();await started;await close();
 mode='ok';releaseSlow();await open();await loaded();
 await mkdir('.runtime',{recursive:true});
 await page.screenshot({path:'.runtime/image-preview-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await page.screenshot({path:'.runtime/image-preview-mobile.png'});await close();
 plain=true;const before=imageCalls.length;
 await page.getByRole('button',{name:'메일 목록으로',exact:true}).click();await page.locator('#mails .mail').click();
 await page.getByText('본문 서식을 불러오지 못해 텍스트로 표시합니다. 이미지는 첨부파일 목록의 미리보기로 확인할 수 있습니다.',{exact:true}).waitFor();
 assert.equal(await page.locator('.mail-images,.mail-body img').count(),0);assert.equal(imageCalls.length,before);
 await page.locator('.mail-attachments summary').click();await open();await loaded();await close();
 mode='unauthorized';await open();await dialog.getByText(/접속이 만료/).waitFor();await close();
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 console.log(JSON.stringify({inlinePreserved:true,noGallery:true,onDemand:true,retry:true,corrupt:true,sizeLimit:true,downloadExact:true,escapeFocus:true,lateResponse:true,plainFallback:true,mobile:true,unauthorized:true,pageErrors:errors}));
}finally{releaseSlow?.();await browser.close();await new Promise(resolve=>server.close(resolve));}
}
await standalone(import.meta.url,verify);
