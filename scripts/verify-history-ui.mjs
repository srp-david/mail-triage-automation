import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-history-ui-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mutations=[];
page.on('pageerror',e=>errors.push(e.message));
let failList=false,slowReport=false,unauthorized=false,release;
const row=id=>({id,subject:'Synthetic mail one',status:'completed',source:'web',created_at:'2026-09-17T00:00:00Z'});
await page.route('**/api/**',async route=>{
 const request=route.request(),url=new URL(request.url()),p=url.pathname;
 if(request.method()!=='GET')mutations.push(p);
 if(unauthorized)return route.fulfill({status:401,json:{error:'Session expired'}});
 let json;
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mail-analysis')json=[];
 else if(p==='/api/mails')json={emails:[{id:1,subject:'Synthetic mail one',from:[]},{id:2,subject:'Synthetic mail two',from:[]}],total:2,nextOffset:null};
 else if(/^\/api\/mails\/\d+$/.test(p))json={id:Number(p.split('/').pop()),subject:p.endsWith('1')?'Synthetic mail one':'Synthetic mail two',body:'Synthetic body',attachments:[]};
 else if(p.endsWith('/body'))json={html:''};
 else if(p==='/api/runs'){
   if(url.searchParams.get('mailId')==='1'){
     assert.equal(url.searchParams.get('storeId'),'fixture');
     if(failList){failList=false;return route.fulfill({status:502,json:{error:'Synthetic history failure'}});}
     json=Number(url.searchParams.get('offset'))===100?[row('last')]:Array.from({length:100},(_,i)=>row('run-'+i));
   }else json=url.searchParams.has('mailId')?[]:[row('global')];
 }else if(p.startsWith('/api/runs/')){
   if(slowReport)await new Promise(r=>{release=r;});
   json={...row(p.split('/').pop()),result:{report:'<script>bad()</script>\n'+('Synthetic report paragraph.\n'.repeat(120)),knowledge:''},reviews:[]};
 }else if(p==='/api/legacy')json=url.searchParams.has('mailId')?[]:[{id:'legacy',source_path:'erp/gg/reports/original.md',source_hash:'a'.repeat(64)}];
 else if(p==='/api/legacy/legacy')json={source_path:'erp/gg/reports/original.md',source_hash:'a'.repeat(64),body:'Original legacy record'};
 else throw new Error('Unexpected route '+p);
 await route.fulfill({json});
});
const visible=selector=>page.locator(selector).isVisible();
try{
 await page.goto(base);await page.locator('#mails .mail').first().waitFor();
 assert.equal(await visible('#view-history'),false);assert.equal(await visible('#view-legacy'),false);
 await page.locator('#query').fill('kept search');await page.locator('#mails .mail').first().click();
 const trigger=page.locator('button.history-button');await trigger.waitFor();
 await page.evaluate(()=>scrollTo(0,160));const scroll=await page.evaluate(()=>scrollY);
 await trigger.click();await page.waitForFunction(()=>document.querySelectorAll('#mail-runs .run').length===100);
 assert.equal(await visible('#history-dialog'),true);assert.equal(await visible('#history-back'),false);
 assert.match(await page.locator('#history-subtitle').textContent(),/mail one/);
 await page.locator('#mail-more-runs').click();await page.waitForFunction(()=>document.querySelectorAll('#mail-runs .run').length===101);
 assert.equal(await visible('#mail-more-runs'),false);
 await page.locator('#mail-runs button').first().click();await page.locator('#report .markdown-body').waitFor();
 assert.equal(await visible('#mail-history-lists'),false);assert.equal(await page.locator('#report script').count(),0);
 assert.equal(await page.evaluate(()=>scrollY),scroll);
 await page.locator('#history-back').click();assert.equal(await page.locator('#mail-runs .run').count(),101);
 await page.keyboard.press('Escape');assert.equal(await visible('#history-dialog'),false);
 assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);assert.equal(await page.evaluate(()=>scrollY),scroll);
 await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#runs button').waitFor();
 assert.equal(await page.locator('#runs .run').count(),1);assert.equal(await visible('#view-mailbox'),false);
 await page.locator('#runs button').click();await page.locator('#report .markdown-body').waitFor();assert.equal(await visible('#history-back'),false);
 await page.keyboard.press('Escape');await page.getByRole('link',{name:'메일함',exact:true}).click();
 assert.equal(await page.locator('#query').inputValue(),'kept search');assert.match(await page.locator('#detail h2').textContent(),/mail one/);
 failList=true;await trigger.click();await page.getByText('Synthetic history failure',{exact:true}).last().waitFor();
 await page.locator('#history-refresh').click();await page.waitForFunction(()=>document.querySelectorAll('#mail-runs .run').length===100);
 slowReport=true;await page.locator('#mail-runs button').first().click();await page.waitForFunction(()=>document.querySelector('#report').textContent.includes('불러오는'));
 while(!release)await new Promise(r=>setTimeout(r,10));
 await page.keyboard.press('Escape');await page.locator('#mails .mail').nth(1).click();await trigger.click();
 await page.getByText('저장된 분석이 없습니다.',{exact:true}).waitFor();release();slowReport=false;
 await page.waitForTimeout(100);assert.equal(await visible('#report'),false);assert.match(await page.locator('#history-subtitle').textContent(),/mail two/);
 await page.keyboard.press('Escape');await page.getByRole('link',{name:'이전 이력',exact:true}).click();await page.locator('#legacy-list button').waitFor();
 await page.locator('#legacy-list button').click();await page.locator('#legacy-document .markdown-body').waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('#history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/history-mobile.png'});
 await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:900});
 await page.getByRole('link',{name:'메일함',exact:true}).click();await page.locator('#mails .mail').first().click();await trigger.click();
 await page.locator('#mail-runs button').first().click();await page.locator('#report .markdown-body').waitFor();await page.screenshot({path:'.runtime/history-desktop.png'});
 unauthorized=true;await page.locator('#history-refresh').click();await page.locator('#login:not([hidden])').waitFor();assert.equal(await visible('#history-dialog'),false);
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 console.log(JSON.stringify({menuIsolation:true,mailStatePreserved:true,scopedModal:true,pagination:true,reportBack:true,escapeFocusAndScroll:true,retry:true,staleResponseIgnored:true,emptyHistory:true,mobile:true,sessionExpiry:true,pageErrors:errors,apiMutations:mutations}));
}finally{release?.();await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
