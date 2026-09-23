import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-sync-refresh-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mailRequests=[],mutations=[];
await page.clock.install();page.on('pageerror',e=>errors.push(e.message));
let serial=0,mode='immediate',posts=0,failList=false,releasePost,releaseList,holdList=false;
const makeSync=(status='completed')=>({id:'sync-'+ ++serial,status,saved:1,failed:0,remaining:0,started_at:'2026-09-17T00:00:00Z',finished_at:status==='running'?null:'2026-09-17T00:01:00Z'});
let sync=makeSync();
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname;let json;
 if(req.method()!=='GET')mutations.push(p);
 if(p==='/api/status')json={storeId:'fixture',sync,worker:null};
 else if(p==='/api/sync'){
   posts++;
   if(mode==='hold')await new Promise(r=>{releasePost=r;});
   sync=makeSync(mode==='delayed'?'running':'completed');
   json={id:sync.id,status:'running'};
 }else if(p==='/api/sync/'+sync.id+'/stop'){
   sync={...sync,status:'stopping'};json={id:sync.id,status:'stopping'};
 }else if(p==='/api/mails'){
   mailRequests.push(Object.fromEntries(u.searchParams));
   if(holdList){holdList=false;await new Promise(r=>{releaseList=r;});}
   if(failList){failList=false;return route.fulfill({status:502,json:{error:'Synthetic list failure'}});}
   json={emails:[{id:serial,subject:'합성 메일 '+serial,from:[]}],total:31,nextOffset:u.searchParams.get('offset')==='30'?null:30};
 }else if(p==='/api/mail-analysis')json=[];
 else if(/^\/api\/mails\/\d+$/.test(p))json={id:1,subject:'선택한 메일 유지',body:'Synthetic body',attachments:[]};
 else if(p.endsWith('/body'))json={html:''};
 else if(p==='/api/runs'||p==='/api/legacy')json=[];
 else throw new Error('Unexpected route '+p);
 await route.fulfill({json});
});
const tick=async()=>{await page.clock.fastForward(10000);await page.waitForTimeout(30);};
const settled=()=>page.waitForFunction(()=>!document.querySelector('#sync').disabled);
const shown=()=>page.getByRole('button',{name:new RegExp('합성 메일 '+serial)}).waitFor();
try{
 await page.goto(base);await shown();await page.waitForTimeout(30);
 assert.equal(await page.locator('#sync-progress').isVisible(),false);assert.equal(await page.locator('progress').count(),0);
 assert.equal(mailRequests.length,1);await tick();assert.equal(mailRequests.length,1);
 await page.locator('#query').fill('고객 검색');await page.locator('#from').fill('fixture@example.test');await page.locator('#after').fill('2026-09-01');
 await page.getByRole('button',{name:'검색',exact:true}).click();await page.waitForTimeout(30);
 await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('#next').disabled);
 await page.locator('#mails .mail').click();await page.locator('#detail h2').waitFor();
 const before=mailRequests.length;
 // Finish before any interval observes running. Also observe this completion during a slow list refresh.
 holdList=true;await page.locator('#sync').click();while(!releaseList)await new Promise(r=>setTimeout(r,10));
 await tick();releaseList();await shown();await settled();await page.waitForTimeout(30);
 assert.equal(mailRequests.length,before+1);assert.equal(mailRequests.at(-1).offset,'0');
 assert.equal(mailRequests.at(-1).query,'고객 검색');assert.equal(mailRequests.at(-1).from_address,'fixture@example.test');
 assert.ok(mailRequests.at(-1).sent_after);assert.equal(await page.locator('#detail h2').textContent(),'선택한 메일 유지');
 assert.equal(await page.locator('#query').inputValue(),'고객 검색');
 await tick();assert.equal(mailRequests.length,before+1);
 // A delayed sync still refreshes on completion.
 mode='delayed';await page.locator('#sync').click();await page.waitForTimeout(30);
 assert.equal(await page.locator('#sync').isDisabled(),true);const delayedCount=mailRequests.length;
 sync={...sync,status:'completed',finished_at:'2026-09-17T00:02:00Z'};await tick();await shown();await settled();
 assert.equal(mailRequests.length,delayedCount+1);
 // Completion in another tab is detected even though both observed states are completed.
 sync=makeSync();const externalCount=mailRequests.length;await tick();await shown();assert.equal(mailRequests.length,externalCount+1);
 // Partial/failure can have saved mail too. A failed list refresh must retry the same sync ID.
 sync=makeSync('partial');failList=true;const retryCount=mailRequests.length;await tick();
 await page.getByText(/동기화 후 목록을 갱신하지 못했습니다/).waitFor();assert.equal(mailRequests.length,retryCount+1);
 await tick();await shown();assert.equal(mailRequests.length,retryCount+2);assert.match(await page.locator('#sync-status').textContent(),/일부 미완료/);
 sync=makeSync('failed');const failedCount=mailRequests.length;await tick();await shown();assert.equal(mailRequests.length,failedCount+1);
 // Disable immediately while POST is pending so repeated clicks do not start another sync.
 mode='hold';const priorPosts=posts;await page.locator('#sync').click();while(!releasePost)await new Promise(r=>setTimeout(r,10));
 assert.equal(await page.locator('#sync').isDisabled(),true);
 await page.locator('#sync').evaluate(e=>e.click());assert.equal(posts,priorPosts+1);
 releasePost();await shown();await settled();
 // Progress while running refreshes the visible page; stop applies after the current batch.
 mode='delayed';await page.locator('#sync').click();await page.waitForTimeout(30);
 sync={...sync,saved:100,remaining:3100,batch_count:1,detail:{serverCount:3200,serverStored:100}};
 const progressCount=mailRequests.length;await tick();
 assert.equal(mailRequests.length,progressCount+1);assert.equal(await page.locator('#sync-progress').isVisible(),true);
 assert.match(await page.locator('#sync-progress-text').textContent(),/100 \/ 3,200건 \(3%\)/);assert.equal(await page.locator('#sync-stop').isVisible(),true);
 assert.equal(await page.locator('#sync-status').isVisible(),false);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/sync-progress-desktop.png'});
 await page.locator('#sync-stop').click();await page.waitForFunction(()=>document.querySelector('#sync-stop').textContent==='중지 요청됨');
 assert.equal(await page.locator('#sync-stop').isDisabled(),true);assert.equal(await page.locator('#sync').isDisabled(),true);
 sync={...sync,status:'paused',saved:200,remaining:3000,batch_count:2,finished_at:'2026-09-17T00:05:00Z',detail:{serverCount:3200,serverStored:200}};
 await tick();await settled();assert.equal(await page.locator('#sync').textContent(),'이어서 동기화');
 assert.equal(await page.locator('#sync-stop').isVisible(),false);assert.match(await page.locator('#sync-status').textContent(),/저장 200건/);
 assert.equal(await page.locator('#sync-progress').isVisible(),false);
 const beforeReload=posts;sync={...sync,uncertain:true,detail:{reason:'interrupted'}};
 await page.reload();await page.getByRole('button',{name:'이어서 동기화',exact:true}).waitFor();
 assert.equal(posts,beforeReload);assert.match(await page.locator('#sync-message').textContent(),/서버 재시작/);
 assert.match(await page.locator('#sync-message').textContent(),/집계에서 빠질 수/);
 await page.locator('#sync').click();await page.waitForTimeout(30);
 sync={...sync,status:'retrying',saved:0,batch_count:1,retry_count:1,next_attempt_at:'2026-09-17T00:06:00Z',detail:{reason:'retry'}};
 await tick();assert.match(await page.locator('#sync-message').textContent(),/1\/3회/);assert.equal(await page.locator('#sync').isDisabled(),true);
 assert.equal(await page.locator('#sync-progress').isVisible(),true);assert.match(await page.locator('#sync-progress-text').textContent(),/재시도 대기.*이번 실행 저장 0건/);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.runtime/sync-progress-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.sync-spinner').evaluate(e=>getComputedStyle(e).animationName),'none');
 for(const state of ['completed','partial','failed','paused']){
   sync={...sync,status:state,detail:{serverCount:3200,serverStored:200}};await tick();
   assert.equal(await page.locator('#sync-progress').isVisible(),false);assert.equal(await page.locator('#sync-progress-text').textContent(),'');assert.equal(await page.locator('#sync-status').isVisible(),true);
 }
 assert.deepEqual(errors,[]);assert.ok(mutations.every(p=>p==='/api/sync'||/^\/api\/sync\/sync-\d+\/stop$/.test(p)));
 console.log(JSON.stringify({immediateCompletion:true,delayedCompletion:true,externalCompletion:true,firstPageWithFilters:true,selectionPreserved:true,noDuplicateRefresh:true,partialAndFailureRefresh:true,failedListRetry:true,duplicateClickBlocked:true,progressRefresh:true,stopAfterBatch:true,restartAndResume:true,retryDisplay:true,mobile:true,syntheticSyncPosts:posts,pageErrors:errors}));
}finally{releasePost?.();releaseList?.();await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
