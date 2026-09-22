import assert from 'node:assert/strict';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-status-'.repeat(4);
const {createApp}=await import('../src/server.ts');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const page=await browser.newPage(),requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url());let json;
 if(url.pathname==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(url.pathname==='/api/mails'){
  const q=Object.fromEntries(url.searchParams);requests.push(q);
  const empty=q.analysis_status==='failed',offset=Number(q.offset??0);
  json={emails:empty?[]:[{id:offset+1,subject:'합성 메일',from:[]}],total:empty?0:31,nextOffset:empty||offset?null:30};
 }else if(url.pathname==='/api/mail-analysis'||url.pathname==='/api/runs'||url.pathname==='/api/legacy')json=[];
 else throw Error('Unexpected route '+url.pathname);
 await route.fulfill({json});
});
const search=async()=>{await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/mails'),page.getByRole('button',{name:'검색',exact:true}).click()]);await page.waitForTimeout(50);};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#mails .mail').waitFor();
 assert.equal(requests[0].analysis_status,undefined);
 await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('.mail-analysis')?.dataset.mailId==='31');
 await page.locator('#query').fill('합성');await page.locator('#from').fill('sender@example.test');await page.locator('#after').fill('2026-09-01');
 for(const status of ['completed','failed','unanalysed','queued','running','needs_input','handled','legacy','all']){
  await page.getByRole('combobox',{name:'분석 상태'}).selectOption(status);await search();const q=requests.at(-1);
  assert.equal(q.analysis_status,status==='all'?undefined:status);assert.equal(q.offset,'0');assert.equal(q.query,'합성');assert.equal(q.from_address,'sender@example.test');assert.ok(q.sent_after.startsWith('2026-0'));
  if(status==='failed'){assert.equal(await page.locator('#total').textContent(),'0건');assert.match(await page.locator('#mails').textContent(),/조건에 맞는 메일이 없습니다/);assert.ok(await page.locator('#next').isDisabled());}
 }
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#analysis-status').isVisible());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: 9 status options, combined conditions, page reset, empty results, mobile layout');
}finally{await browser.close();await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
