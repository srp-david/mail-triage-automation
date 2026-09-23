import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-progress-'.repeat(4);
const {createApp}=await import('../src/server.ts');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
await page.clock.install({time:new Date('2026-09-17T01:00:00Z')});page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:'+server.address().port;
let state='queued',events=[],fail=false,hold=false,release,reads=0,posts=0;
const row=()=>({id:'one',store_id:'fixture',mail_id:1,message_id:'<synthetic@example.test>',subject:'합성 분석 진행 확인',status:state,source:'web',created_at:'2026-09-17T00:59:30Z',started_at:state==='queued'?null:'2026-09-17T01:00:00Z',heartbeat_at:'2026-09-17T01:00:00Z',progress_events:events,finished_at:['completed','failed','needs_input'].includes(state)?'2026-09-17T01:00:30Z':null});
await page.route('**/api/**',async route=>{
 const req=route.request(),p=new URL(req.url()).pathname;let json;
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:{online:true,state:'analyzing'}};
 else if(p==='/api/mails')json={emails:[{id:1,subject:'합성 분석 진행 확인',from:[]}],total:1,nextOffset:null};
 else if(p==='/api/mails/1')json={id:1,subject:'합성 분석 진행 확인',messageId:'<synthetic@example.test>',body:'합성 본문',attachments:[]};
 else if(p==='/api/mails/1/body')json={html:''};
 else if(p==='/api/mail-analysis')json=[];
 else if(p==='/api/runs'&&req.method()==='POST'){posts++;json={id:'one',status:'queued'};}
 else if(p==='/api/runs')json=posts?[row()]:[];
 else if(p==='/api/runs/one'){
   reads++;json={...row(),reviews:[],result:['completed','needs_input'].includes(state)?{report:'# 합성 완료 보고서',question:state==='needs_input'?'합성 질문':'',knowledge:''}:null,error:state==='failed'?'합성 실행 실패':null};
   if(hold){hold=false;await new Promise(r=>release=r);}
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'Synthetic unavailable'}});}
 }else if(p==='/api/legacy')json=[];
 else throw new Error('Unexpected route '+p);
 await route.fulfill({json});
});
const tick=async(ms=3100)=>{await page.clock.fastForward(ms);await page.waitForTimeout(100);};
const text=()=>page.locator('.analysis-progress').textContent();
const open=async()=>{await page.getByRole('button',{name:'이 메일 분석 이력',exact:true}).click();await page.locator('#mail-runs button').click();};
try{
 await page.goto(base);await page.locator('#mails .mail').click();await page.getByRole('button',{name:'분석 시작',exact:true}).click();
 await page.locator('.analysis-progress').waitFor();assert.match(await text(),/분석 대기 · /);assert.equal(posts,1);
 const initial=await page.locator('.analysis-progress-heading').textContent();await tick(1100);assert.notEqual(await page.locator('.analysis-progress-heading').textContent(),initial);
 state='running';events=[{kind:'analysis_started',outcome:'completed',at:'2026-09-17T01:00:00Z'},{kind:'mail_read',outcome:'completed',at:'2026-09-17T01:00:01Z'}];
 await tick();assert.match(await text(),/최근 작업: 메일 본문 확인 완료/);assert.match(await text(),/최근 실행 연결 확인/);assert.equal(await page.locator('.analysis-progress .sync-spinner').isVisible(),true);
 assert.match(await page.locator('#report h2').textContent(),/분석 중/);
 await page.locator('.analysis-progress summary').click();
 events.push({kind:'db_tool',outcome:'failed',at:'2026-09-17T01:00:02Z'});await tick();assert.match(await text(),/DB 조회 작업 실패/);assert.equal(await page.locator('.analysis-progress details').getAttribute('open'),'');
 assert.equal(await page.locator('.analysis-progress li').count(),3);
 fail=true;await tick();assert.match(await text(),/상태를 갱신하지 못했습니다/);assert.equal(await page.locator('.analysis-progress .sync-spinner').isVisible(),false);
 await tick();assert.equal(await page.locator('.analysis-progress-warning').isVisible(),false);
 await tick(95000);assert.match(await text(),/응답이 늦어지고 있습니다/);assert.equal(await page.locator('.analysis-progress .sync-spinner').isVisible(),false);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.sync-spinner').last().evaluate(e=>getComputedStyle(e).animationName),'none');
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/analysis-progress-mobile.png'});
 state='completed';await tick();await page.locator('#report .markdown-body').waitFor();assert.match(await page.locator('#report').textContent(),/합성 완료 보고서/);
 const doneReads=reads,doneTime=await page.locator('.analysis-progress-heading').textContent();await tick(10000);assert.equal(reads,doneReads);assert.equal(await page.locator('.analysis-progress-heading').textContent(),doneTime);
 await page.reload();await page.locator('#mails .mail').click();await open();await page.locator('.analysis-progress li').first().waitFor({state:'attached'});assert.equal(await page.locator('.analysis-progress li').count(),3);
 state='running';await page.locator('#history-refresh').click();await page.waitForFunction(()=>document.querySelector('#report h2')?.textContent.includes('분석 중'));assert.equal(await page.getByRole('button',{name:'처리 완료',exact:true}).count(),0);
 state='needs_input';await tick();await page.getByRole('textbox',{name:'추가 답변',exact:true}).waitFor();assert.match(await page.locator('#report').textContent(),/합성 질문/);
 state='running';await page.locator('#history-refresh').click();await page.locator('.analysis-progress .sync-spinner').waitFor({state:'attached'});
 state='failed';await tick();assert.match(await page.locator('#report').textContent(),/합성 실행 실패/);assert.equal(await page.locator('.analysis-progress .sync-spinner').isVisible(),false);
 state='running';await page.locator('#history-refresh').click();await page.waitForTimeout(100);
 hold=true;await tick();assert.ok(release);await page.keyboard.press('Escape');release();await page.waitForTimeout(100);assert.equal(await page.locator('#history-dialog').isVisible(),false);
 const closedReads=reads;await tick(10000);assert.equal(reads,closedReads);
 await open();await page.locator('.analysis-progress').waitFor();await page.locator('#history-back').click();const backReads=reads;await tick();assert.equal(reads,backReads);
 assert.deepEqual(errors,[]);assert.equal(posts,1);
 console.log(JSON.stringify({queued:true,elapsed:true,events:true,toolFailureNotRunFailure:true,connectionSeparate:true,staleConnection:true,retry:true,autoComplete:true,needsInput:true,failed:true,reload:true,closeRace:true,backCleanup:true,mobile:true,reducedMotion:true,pageErrors:errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
