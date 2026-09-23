import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-handling-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mutations=[];
page.on('pageerror',e=>errors.push(e.message));
let handled=null,fail=false,state='needs_input',submitted=null,identityKind='mcp';
const row=()=>({id:'one',store_id:'fixture',mail_id:1,message_id:'<synthetic@example.test>',subject:'합성 문의',status:state,source:'web',handled_at:handled,identity_kind:identityKind});
await page.route('**/api/**',async route=>{
 const req=route.request(),p=new URL(req.url()).pathname;let json;
 if(req.method()!=='GET')mutations.push(p);
 if(p==='/api/runs/one/handling'){
   await new Promise(r=>setTimeout(r,100));
   if(fail){fail=false;return route.fulfill({status:409,json:{error:'합성 충돌: 진행 중인 분석'}});}
   handled=req.postDataJSON().completed?'2026-09-17T01:00:00Z':null;json={handled_at:handled};
 }else if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mails')json={emails:[{id:1,subject:'합성 문의',from:[]}],total:1,nextOffset:null};
 else if(p==='/api/mails/1')json={id:1,subject:'합성 문의',body:'합성 본문',attachments:[]};
 else if(p==='/api/mails/1/body')json={html:''};
 else if(p==='/api/mail-analysis')json=[{mailId:'1',runCount:1,completedCount:0,legacyCount:0,latestStatus:state,handledAt:handled}];
 else if(p==='/api/runs'&&req.method()==='POST'){submitted=req.postDataJSON();json={id:'next',status:'queued'};}
 else if(p==='/api/runs')json=[row()];
 else if(p==='/api/runs/one')json={...row(),result:{report:'# 합성 보고서\n\n기존 근거를 보존합니다.',question:state==='needs_input'?'어느 문서인가요?':'',knowledge:''},reviews:[]};
 else if(p==='/api/runs/next')json={...row(),id:'next',status:'queued',result:null,reviews:[]};
 else if(p==='/api/legacy')json=[];
 else throw new Error('Unexpected route '+p);
 await route.fulfill({json});
});
try{
 await page.goto(base);await page.locator('#mails .mail').click();await page.getByRole('button',{name:'이 메일 분석 이력',exact:true}).click();
 await page.locator('#mail-runs button').click();await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).waitFor();
 const original=await page.locator('#report .markdown-body').textContent();
 await page.getByRole('button',{name:'처리 완료',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'처리 완료',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'처리 완료 취소',exact:true}).waitFor();
 assert.equal(await page.locator('#report textarea').count(),0);assert.equal(await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).count(),0);
 assert.equal(await page.locator('#report .markdown-body').textContent(),original);
 assert.match(await page.locator('#report').textContent(),/당시 추가 확인 질문/);
 await page.getByText('메일을 처리 완료로 표시했습니다.',{exact:true}).last().waitFor();
 assert.equal(await page.locator('#mails .handled').textContent(),'✓ 처리 완료');assert.equal(await page.locator('#mails .attention').count(),0);
 await page.locator('#history-back').click();assert.equal(await page.locator('#mail-runs .badge').textContent(),'처리 완료');
 await page.keyboard.press('Escape');await page.reload();await page.locator('#mails .handled').waitFor();
 await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#runs button').click();
 await page.getByRole('button',{name:'처리 완료 취소',exact:true}).click();await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).waitFor();
 await page.getByText('처리 완료를 취소했습니다.',{exact:true}).last().waitFor();
 assert.equal(await page.locator('#mails .handled').count(),0);assert.equal(await page.locator('#runs .badge').textContent(),'확인 필요');
 fail=true;await page.getByRole('button',{name:'처리 완료',exact:true}).click();await page.getByText('합성 충돌: 진행 중인 분석',{exact:true}).last().waitFor();
 assert.equal(await page.getByRole('button',{name:'처리 완료',exact:true}).isEnabled(),true);assert.equal(await page.locator('#report textarea').count(),1);
 state='running';await page.locator('#history-refresh').click();await page.waitForFunction(()=>document.querySelector('#report h2')?.textContent.includes('분석 중'));
 assert.equal(await page.getByRole('button',{name:'처리 완료',exact:true}).count(),0);
 assert.equal(await page.locator('#report textarea').count(),0);
 state='completed';await page.locator('#history-refresh').click();await page.locator('#report textarea').waitFor();
 assert.equal(await page.locator('#report .markdown-body').textContent(),original);
 assert.equal(await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).click();await page.getByText('답변을 입력하세요.',{exact:true}).last().waitFor();assert.equal(submitted,null);
 await page.getByRole('textbox',{name:'추가 답변',exact:true}).fill('합성 추가 조건을 반영해 주세요.');
 await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).click();await page.locator('.analysis-progress').waitFor();
 assert.equal(submitted.parentId,'one');assert.equal(submitted.answer,'합성 추가 조건을 반영해 주세요.');assert.equal(submitted.mailId,1);assert.equal(submitted.storeId,'fixture');assert.equal(submitted.messageId,'<synthetic@example.test>');assert.equal(submitted.source,'web');assert.ok(submitted.requestId);
 await page.locator('#history-back').click();await page.locator('#mail-runs button').click();await page.locator('#report textarea').waitFor();
 handled='2026-09-17T01:00:00Z';await page.locator('#history-refresh').click();await page.getByRole('button',{name:'처리 완료 취소',exact:true}).waitFor();assert.equal(await page.locator('#report textarea').count(),0);
 handled=null;identityKind='outlook';await page.locator('#history-refresh').click();await page.getByText('Outlook 예외 메일은 직접 실행에서 답변을 반영해 다시 분석하세요. 원본 파일과 공용 메일 식별자를 함께 사용합니다.',{exact:true}).waitFor();assert.equal(await page.locator('#report textarea').count(),0);
 identityKind='mcp';await page.locator('#history-refresh').click();await page.locator('#report textarea').waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/handling-mobile.png'});
 assert.deepEqual(mutations,[...Array(3).fill('/api/runs/one/handling'),'/api/runs']);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({closeWithoutAnalysis:true,undo:true,historyAndBadges:true,reportPreserved:true,reload:true,conflict:true,activeGuard:true,completedFollowup:true,followupContext:true,handledAndOutlookGuards:true,mobile:true,pageErrors:errors}));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
