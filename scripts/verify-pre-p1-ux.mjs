import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-pre-p1-'.repeat(4);
const {createApp}=await import('../src/server.ts');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],posts=[];
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
await page.clock.install();
let submitFails=false,listFails=false,summaryFails=false,unauthorized=false;
const states=new Map([[1,'completed'],[2,'running']]);
const row=(id,status=states.get(id))=>({id:'run-'+id,store_id:'fixture',mail_id:id,message_id:'<fixture-'+id+'@example.test>',subject:'합성 문의 '+id,status,source:'web',identity_kind:'mcp',created_at:new Date().toISOString(),progress_events:[],reviews:[],result:status==='completed'?{report:'# 합성 보고서',question:'',knowledge:''}:null});
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;let json;
 if(p==='/api/login'){unauthorized=false;return route.fulfill({json:{ok:true}});}
 if(unauthorized)return route.fulfill({status:401,json:{error:'Session expired'}});
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:{online:true,state:'ready'}};
 else if(p==='/api/mails'){
   if(listFails){listFails=false;return route.fulfill({status:503,json:{error:'합성 조회 오류'}});}
   const empty=url.searchParams.get('query')==='없음';
   json={emails:empty?[]:Array.from({length:30},(_,i)=>({id:i+1,subject:'합성 문의 '+(i+1),from:[]})),total:empty?0:30,nextOffset:null};
 }else if(/^\/api\/mails\/\d+$/.test(p)){const id=Number(p.split('/').pop());json={id,subject:'합성 문의 '+id,messageId:'<fixture-'+id+'@example.test>',body:'합성 메일 본문',attachments:[]};}
 else if(p.endsWith('/body'))json={html:''};
 else if(p==='/api/mail-analysis'){
   if(summaryFails)return route.fulfill({status:503,json:{error:'합성 이력 오류'}});
   json=[...states].map(([mailId,latestStatus])=>({mailId,latestStatus,runCount:1,completedCount:latestStatus==='completed'?1:0,legacyCount:0}));
 }else if(p==='/api/runs'&&req.method()==='POST'){
   posts.push(req.postDataJSON());
   if(submitFails){submitFails=false;return route.fulfill({status:503,json:{error:'합성 전송 오류'}});}
   json={id:'next',status:'queued'};
 }else if(p==='/api/runs'){
   const id=Number(url.searchParams.get('mailId'));
   json=id?(states.has(id)?[row(id)]:[]):[row(1),row(2)];
 }else if(p==='/api/runs/next')json={...row(1,'queued'),id:'next'};
 else if(p.startsWith('/api/runs/run-'))json=row(Number(p.split('-').pop()));
 else if(p==='/api/legacy')json=url.searchParams.has('mailId')?[]:[{id:'old',source_path:'synthetic/archive/report.md',source_hash:'a'.repeat(64)}];
 else if(p==='/api/legacy/old')json={source_path:'synthetic/archive/report.md',source_hash:'a'.repeat(64),body:'# 보존 문서\n\n합성 본문'};
 else throw Error('Unexpected route '+p);
 await route.fulfill({json});
});
const button=name=>page.getByRole('button',{name,exact:true});
const choose=id=>page.locator('#mails .mail[data-mail-id="'+id+'"]').click();
const answer=()=>page.getByRole('textbox',{name:'추가 답변',exact:true});
const openFirst=async()=>{await choose(1);await button('결과 보기').click();await answer().waitFor();};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await openFirst();
 await answer().fill('첫 번째 분석 초안');await button('새로고침').click();await answer().waitFor();assert.equal(await answer().inputValue(),'첫 번째 분석 초안');
 await page.keyboard.press('Escape');await choose(2);await button('진행 상황 보기').click();await page.locator('.analysis-progress').waitFor();
 assert.equal(await button('처리 완료').count(),0);assert.equal(posts.length,0);
 await page.keyboard.press('Escape');await openFirst();assert.equal(await answer().inputValue(),'첫 번째 분석 초안');
 await page.keyboard.press('Escape');states.set(2,'completed');await choose(2);await button('결과 보기').click();await answer().waitFor();assert.equal(await answer().inputValue(),'');
 await answer().fill('두 번째 분석 초안');await page.keyboard.press('Escape');await openFirst();assert.equal(await answer().inputValue(),'첫 번째 분석 초안');
 await page.reload();await openFirst();assert.equal(await answer().inputValue(),'첫 번째 분석 초안');
 unauthorized=true;await page.locator('#history-refresh').click();await page.locator('#login:not([hidden])').waitFor();
 await page.locator('#token').fill('synthetic-login');await button('연결').click();await openFirst();assert.equal(await answer().inputValue(),'첫 번째 분석 초안');
 submitFails=true;await button('답변하고 다시 분석').click();await page.locator('#history-notice').getByText('합성 전송 오류',{exact:true}).waitFor();
 assert.equal(await answer().inputValue(),'첫 번째 분석 초안');assert.equal(await answer().isEnabled(),true);
 await button('답변하고 다시 분석').click();await page.locator('.analysis-progress').waitFor();
 assert.equal(posts.length,2);assert.equal(posts[1].answer,'첫 번째 분석 초안');
 await page.keyboard.press('Escape');await openFirst();assert.equal(await answer().inputValue(),'');
 await answer().fill('지울 초안');await button('초안 지우기').click();await page.locator('#history-refresh').click();await answer().waitFor();assert.equal(await answer().inputValue(),'');
 await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('Synthetic storage blocked');};});
 await answer().fill('메모리 임시 초안');assert.match(await page.locator('#answer-draft-hint').textContent(),/임시 저장소를 사용할 수 없습니다/);
 await page.locator('#history-refresh').click();await answer().waitFor();assert.equal(await answer().inputValue(),'메모리 임시 초안');
 await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;});await button('초안 지우기').click();
 // A stale completed badge must still open an active run, even from the secondary action.
 await page.keyboard.press('Escape');states.set(1,'running');await button('새로 분석').click();await page.locator('.analysis-progress').waitFor();assert.equal(posts.length,2);
 await page.keyboard.press('Escape');states.set(1,'completed');
 await choose(3);await button('분석 시작').click();await page.locator('.analysis-progress').waitFor();assert.equal(posts.length,3);assert.equal(posts[2].mailId,3);
 await page.keyboard.press('Escape');summaryFails=true;await choose(1);await button('이력 다시 확인').waitFor();assert.equal(await button('새로 분석').isVisible(),false);
 summaryFails=false;await button('이력 다시 확인').click();await button('결과 보기').waitFor();assert.equal(posts.length,3);
 await page.locator('#query').fill('없음');await button('검색').click();await button('검색 조건 초기화').waitFor();assert.match(await page.locator('#applied-filters').textContent(),/없음/);
 await button('검색 조건 초기화').click();await page.locator('#mails .mail').first().waitFor();assert.equal(await page.locator('#query').inputValue(),'');
 listFails=true;await button('검색').click();await button('다시 조회').waitFor();assert.equal(await page.locator('#mails .mail').count(),0);
 await button('다시 조회').click();await page.locator('#mails .mail').first().waitFor();
 await page.locator('#query').fill('유지할 검색어');await choose(1);
 assert.equal(await page.locator('#mails .is-selected').getAttribute('aria-current'),'true');
 await page.waitForFunction(()=>document.querySelector('#notice').textContent==='');await button('결과 보기').waitFor();
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/pre-p1-desktop.png'});
 await page.setViewportSize({width:390,height:844});await button('메일 목록으로').click();
 await page.locator('#mails').evaluate(e=>e.scrollTop=400);const scroll=await page.locator('#mails').evaluate(e=>e.scrollTop);
 await choose(6);await page.locator('#mail-list').waitFor({state:'hidden'});assert.equal(await page.locator('#detail').evaluate(e=>e===document.activeElement),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.runtime/pre-p1-mobile.png'});await button('메일 목록으로').click();
 assert.equal(await page.locator('#query').inputValue(),'유지할 검색어');assert.equal(await page.locator('#mails').evaluate(e=>e.scrollTop),scroll);
 assert.equal(await page.locator('#mails .is-selected').evaluate(e=>e===document.activeElement),true);
 await page.locator('#menu-toggle').click();await page.getByRole('link',{name:'이전 이력',exact:true}).click();await button('report.md').click();await page.locator('#legacy-document').waitFor();
 assert.equal(await page.locator('#legacy-document h2').textContent(),'report.md');assert.equal(await page.locator('.document-info').getAttribute('open'),null);
 await page.getByText('문서 정보',{exact:true}).click();assert.equal(await page.getByText('파일 경로: synthetic/archive/report.md',{exact:true}).isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({draftRefresh:true,draftNavigation:true,draftIsolation:true,draftReload:true,draftReauthentication:true,storageFallback:true,failedSubmitPreserved:true,successfulSubmitCleared:true,explicitDiscard:true,stateActions:true,activeRecheck:true,summaryRecovery:true,searchReset:true,searchRetry:true,mobileFocusAndScroll:true,legacyDetails:true,pageErrors:errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
