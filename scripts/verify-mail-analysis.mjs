import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-mail-analysis-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mutations=[],batches=[];
await page.clock.install();page.on('pageerror',e=>errors.push(e.message));
let completed=false,unavailable=false,slow=false,release;
const summary=(mailId,latestStatus,completedCount=0,legacyCount=0)=>({mailId,latestStatus,completedCount,legacyCount,runCount:latestStatus?completedCount+Number(latestStatus!=='completed'):0});
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname;if(req.method()!=='GET')mutations.push(p);
 let json;
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mails'){
   const second=u.searchParams.get('offset')==='30';
   json={emails:(second?[8]:[1,2,3,4,5,6,7]).map(id=>({id,subject:'합성 메일 '+id,from:[]})),total:31,nextOffset:second?null:30};
 }else if(p==='/api/mail-analysis'){
   batches.push(u.searchParams.get('mailIds'));
   if(slow){slow=false;await new Promise(r=>{release=r;});}
   if(unavailable)return route.fulfill({status:503,json:{error:'Synthetic unavailable'}});
   json=[summary(1,'completed',2),summary(2,completed?'completed':'running',completed?1:0),summary(3,'needs_input'),summary(4,'failed'),summary(5,'queued',1),summary(6,null,0,1)];
 }else if(/^\/api\/mails\/\d+$/.test(p))json={id:1,subject:'합성 메일 1',body:'Synthetic body',attachments:[]};
 else if(p.endsWith('/body'))json={html:''};
 else if(p==='/api/runs'||p==='/api/legacy')json=[];
 else throw new Error('Unexpected route '+p);
 await route.fulfill({json});
});
const badge=id=>page.locator('.mail-analysis[data-mail-id="'+id+'"]');
const tick=async()=>{await page.clock.fastForward(10000);};
try{
 await page.goto(base);await badge(1).getByText('✓ 분석 완료',{exact:true}).waitFor();
 assert.equal(batches.length,1);assert.equal(batches[0],'1,2,3,4,5,6,7');
 assert.equal(await badge(2).textContent(),'분석 중');assert.equal(await badge(3).textContent(),'확인 필요');
 assert.equal(await badge(4).textContent(),'최근 분석 실패');
 assert.deepEqual(await badge(5).locator('.analysis-badge').allTextContents(),['✓ 분석 완료','분석 대기']);
 assert.equal(await badge(6).textContent(),'이전 이력 1건');assert.equal(await badge(7).isVisible(),false);
 await page.locator('#mails .mail').first().click();await page.locator('#detail h2').waitFor();
 await page.locator('#query').fill('검색 유지');await badge(2).evaluate(e=>e.testIdentity=true);
 completed=true;await tick();await badge(2).getByText('✓ 분석 완료',{exact:true}).waitFor();
 assert.equal(await badge(2).evaluate(e=>e.testIdentity),true);assert.equal(await page.locator('#query').inputValue(),'검색 유지');
 assert.equal(await page.locator('#detail h2').textContent(),'합성 메일 1');
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/mail-analysis-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.runtime/mail-analysis-mobile.png'});
 await page.getByRole('button',{name:'메일 목록으로',exact:true}).click();
 unavailable=true;await tick();await badge(1).getByText('이력 확인 불가',{exact:true}).waitFor();
 unavailable=false;await tick();await badge(1).getByText('✓ 분석 완료',{exact:true}).waitFor();
 slow=true;await tick();while(!release)await new Promise(r=>setTimeout(r,10));
 await page.locator('#next').click();await page.locator('.mail-analysis[data-mail-id="8"]').waitFor({state:'attached'});
 await page.waitForFunction(()=>document.querySelector('#next').disabled);
 release();await page.waitForTimeout(50);
 assert.equal(await badge(8).isVisible(),false);assert.equal(await page.locator('#mails .analysis-badge').count(),0);
 await page.locator('#previous').click();await badge(1).getByText('✓ 분석 완료',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 console.log(JSON.stringify({batchLookup:true,statusBadges:true,priorCompletedPreserved:true,legacyLinkedOnly:true,noHistoryUnmarked:true,pollWithoutListReset:true,failureRecovery:true,paginationAndStaleGuard:true,mobile:true,pageErrors:errors,apiMutations:mutations}));
}finally{release?.();await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
