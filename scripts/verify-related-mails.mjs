import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-related-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mutations=[],searches=[],bodyReads=[],imageReads=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().includes('tracker.example.test'))external.push(r.url());});
let links=[],handled='2026-09-17T01:00:00Z',failSearch=false,failConnect=true,missing=false,slow=false,release,slowHtml=false,releaseHtml;
const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=60;const ctx=c.getContext('2d');ctx.fillStyle='#dcece5';ctx.fillRect(0,0,240,60);ctx.fillStyle='#216859';ctx.fillText('Synthetic inline image',15,35);return c.toDataURL('image/png').split(',')[1];});
const mail=id=>({id,subject:'합성 메일 '+id,messageId:'<fixture-'+id+'@example.test>',body:id===3?'<script>window.injected=true</script>\n합성 본문 3\n\n두 번째 문단':'첫 문단 둘째 문단 줄바꿈 표 내용',attachments:[{attachmentId:'1.1',filename:'synthetic.png',contentType:'image/png',size:100}],from:[{address:'sender@example.test'}],to:[{address:'recipient@example.test'}],sentAt:'2026-09-17T00:00:00Z'});
const html=id=>'<p>첫 문단 '+id+'</p><p>둘째 문단<br>줄바꿈</p><table><tr><th>항목</th><th>내용</th></tr><tr><td>표 내용</td><td>문단과 표 유지</td></tr></table><p>이미지 앞<img src="cid:fixture">이미지 뒤</p><script>window.injected=true</script><img src="https://tracker.example.test/pixel"><a href="javascript:alert(1)">차단된 링크</a>';
const row=()=>({id:'one',store_id:'fixture',mail_id:1,identity_kind:'mcp',subject:'합성 문의',status:'needs_input',source:'web',handled_at:handled});
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname;let json;
 if(req.method()!=='GET')mutations.push(p);
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mails'){
   if(failSearch){failSearch=false;return route.fulfill({status:502,json:{error:'합성 검색 실패'}});}
   searches.push(Object.fromEntries(u.searchParams));
   json={emails:u.searchParams.get('offset')==='20'?[mail(4)]:[mail(1),mail(2),mail(3)],nextOffset:u.searchParams.get('offset')==='20'?null:20};
 }else if(p==='/api/mail-analysis')json=[];
 else if(p==='/api/thread-links')json=[];
 else if(p==='/api/runs')json=[row()];
 else if(p==='/api/runs/one')json={...row(),relatedMails:links,result:{report:'# 보존된 보고서',question:'기존 질문',knowledge:''},reviews:[]};
 else if(p==='/api/legacy')json=[];
 else if(p==='/api/runs/one/related-mails'){
   await new Promise(r=>setTimeout(r,80));
   if(failConnect){failConnect=false;return route.fulfill({status:409,json:{error:'합성 식별 충돌'}});}
   const b=req.postDataJSON();assert.equal(b.storeId,'fixture');assert.equal(b.messageId,mail(b.mailId).messageId);
   const m=mail(b.mailId),link={id:'link-'+b.mailId,store_id:'fixture',mail_id:b.mailId,message_id:m.messageId,metadata:m,available:true};
   if(!links.some(l=>l.id===link.id))links.push(link);json=link;
 }else if(p.endsWith('/unlink')){const id=p.split('/').at(-2);links=links.filter(l=>l.id!==id);json={ok:true};}
 else if(p.startsWith('/api/runs/one/related-mails/')){
   if(missing)return route.fulfill({status:404,json:{error:'원본이 없습니다.'}});
   json=mail(Number(p.split('-').at(-1)));
 }else if(/^\/api\/mails\/\d+\/body$/.test(p)){
   const id=Number(p.split('/')[3]);bodyReads.push(id);if(slowHtml)await new Promise(r=>{releaseHtml=r;});
   if(id===3)return route.fulfill({status:503,json:{error:'합성 HTML 조회 실패'}});
   json={html:html(id),inlineImages:[{contentId:'fixture',attachmentId:'1.1'}]};
 }else if(/^\/api\/mails\/\d+\/attachments\//.test(p)){
   imageReads.push(p);json={content:[{type:'image',mimeType:'image/png',data:png}]};
 }else if(/^\/api\/mails\/\d+$/.test(p)){
   if(slow)await new Promise(r=>{release=r;});json=mail(Number(p.split('/').pop()));
 }else throw new Error('Unexpected route '+p);
 await route.fulfill({json});
});
const expand=async()=>{const details=page.locator('.related-mails details');await details.waitFor();if(!await details.evaluate(e=>e.open))await details.locator('summary').click();};
const shownLink=async id=>{const button=page.getByRole('button',{name:'합성 메일 '+id+' 메일 보기',exact:true,includeHidden:true});await button.waitFor({state:'attached'});await expand();await button.waitFor();};
const openPicker=async()=>{await expand();await page.getByRole('button',{name:'관련 메일 연결',exact:true}).click();};
const search=async()=>{await page.locator('.related-picker button[type=submit]').click();};
const candidate=id=>page.locator('.related-candidate').filter({hasText:'합성 메일 '+id});
try{
 await page.goto(base+'/#mailbox');await page.locator('#mails .mail[data-mail-id="2"]').click();
 await page.waitForFunction(()=>document.querySelector('#detail .mail-body img')?.naturalWidth>0);
 const mailboxBody=await page.locator('#detail .mail-body').innerHTML();
 await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#runs button').click();await page.locator('.related-mails summary').waitFor();
 assert.equal(await page.locator('.related-mails details').evaluate(e=>e.open),false);
 assert.equal(await page.getByRole('button',{name:'관련 메일 연결',exact:true}).isVisible(),false);
 await page.locator('.related-mails summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.related-mails details').evaluate(e=>e.open),true);
 await page.keyboard.press('Enter');assert.equal(await page.locator('.related-mails details').evaluate(e=>e.open),false);await openPicker();
 await page.getByRole('searchbox',{name:'관련 메일 검색어'}).fill('합성');await page.getByRole('textbox',{name:'관련 메일 발신자'}).fill('sender@example.test');await search();
 await candidate(2).waitFor();assert.equal(await candidate(1).isDisabled(),true);
 await candidate(2).click();await page.getByRole('button',{name:'이 메일 연결',exact:true}).waitFor();
 assert.equal(mutations.length,0);assert.equal(await page.locator('.related-preview script').count(),0);
 await page.waitForFunction(()=>document.querySelector('.related-body .mail-body img')?.naturalWidth>0);
 assert.equal(await page.locator('.related-body .mail-body').innerHTML(),mailboxBody);
 assert.equal(await page.locator('.related-body table tr').count(),2);assert.equal(await page.locator('.related-body br').count(),1);
 assert.equal(await page.locator('.related-body script,.related-body a[href^="javascript:"]').count(),0);
 const paragraphs=await page.locator('.related-body .mail-body>p').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().top));assert.ok(paragraphs[1]>paragraphs[0]);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/related-mails-html-mobile.png'});await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'이 메일 연결',exact:true}).click();await page.getByText('합성 식별 충돌',{exact:true}).waitFor();
 await page.getByRole('button',{name:'이 메일 연결',exact:true}).click();assert.equal(await page.getByRole('button',{name:'이 메일 연결',exact:true}).isDisabled(),true);
 await shownLink(2);assert.match(await page.locator('#report .markdown-body').textContent(),/보존된 보고서/);
 await openPicker();await search();await candidate(2).waitFor();assert.equal(await candidate(2).isDisabled(),true);
 await page.getByRole('button',{name:'다음 후보',exact:true}).click();await candidate(4).waitFor();await candidate(4).click();
 await page.getByRole('button',{name:'이 메일 연결',exact:true}).click();await shownLink(4);assert.equal(links.length,2);
 missing=true;const readsBeforeMissing=bodyReads.length;await page.getByRole('button',{name:'합성 메일 2 메일 보기',exact:true}).click();await page.getByText('메일을 열 수 없습니다. 원본이 없습니다.',{exact:true}).waitFor();assert.equal(links.length,2);assert.equal(bodyReads.length,readsBeforeMissing);
 missing=false;await page.getByRole('button',{name:'합성 메일 2 메일 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.related-body .mail-body img')?.naturalWidth>0);
 assert.equal(await page.locator('.related-body .mail-body').innerHTML(),mailboxBody);
 await page.getByRole('button',{name:'합성 메일 2 연결 해제',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.related-row').length===1);
 handled=null;await page.locator('#history-refresh').click();await expand();await page.getByText('새 메일 연결은 처리 완료 후 가능합니다.',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'관련 메일 연결',exact:true}).count(),0);assert.equal(links.length,1);
 handled='2026-09-17T01:00:00Z';await page.locator('#history-refresh').click();await openPicker();failSearch=true;await search();await page.getByText('합성 검색 실패',{exact:true}).waitFor();
 await search();await candidate(3).waitFor();slow=true;await candidate(3).click();while(!release)await new Promise(r=>setTimeout(r,10));
 await page.getByRole('button',{name:'선택 취소',exact:true}).click();release();slow=false;await page.waitForTimeout(100);assert.equal(await page.locator('.related-preview').isVisible(),false);
 await openPicker();await search();await candidate(3).click();await page.locator('.related-body').waitFor();
 assert.equal(await page.locator('.related-body>pre').textContent(),mail(3).body);assert.equal(await page.locator('.related-body>pre').evaluate(e=>getComputedStyle(e).whiteSpace),'pre-wrap');
 await page.getByText('본문 서식을 불러오지 못해 텍스트로 표시합니다.',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#history-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>window.injected),undefined);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/related-mails-mobile.png'});
 await page.locator('.related-mails summary').click();assert.equal(await page.locator('.related-preview').isVisible(),false);
 assert.match(await page.locator('.related-mails summary').textContent(),/1건/);
 await page.keyboard.press('Escape');await page.locator('#runs button').click();await page.locator('.related-mails details').waitFor();
 assert.equal(await page.locator('.related-mails details').evaluate(e=>e.open),false);await shownLink(4);
 assert.equal(await page.locator('.related-picker').isVisible(),false);
 slowHtml=true;await page.getByRole('button',{name:'합성 메일 4 메일 보기',exact:true}).click();while(!releaseHtml)await new Promise(r=>setTimeout(r,10));
 await page.getByRole('button',{name:'본문 닫기',exact:true}).click();releaseHtml();slowHtml=false;await page.waitForTimeout(100);assert.equal(await page.locator('.related-preview').isVisible(),false);
 assert.ok(searches.some(s=>s.query==='합성'&&s.from_address==='sender@example.test'&&s.limit==='20'));assert.ok(searches.some(s=>s.offset==='20'));
 assert.deepEqual(mutations,['/api/runs/one/related-mails','/api/runs/one/related-mails','/api/runs/one/related-mails','/api/runs/one/related-mails/link-2/unlink']);assert.deepEqual(errors,[]);
 assert.deepEqual(external,[]);assert.ok(imageReads.length>0);
 console.log(JSON.stringify({manualSelection:true,previewBeforeLink:true,sameBodyAsMailbox:true,htmlParagraphsAndTables:true,inlineImages:true,plainFallback:true,noExternalImages:true,multipleLinks:true,duplicateAndSelfGuard:true,pagination:true,identityFailure:true,missingOriginalPreserved:true,unlink:true,undoHandlingPreservesLinks:true,searchRetry:true,stalePreviewIgnored:true,staleHtmlIgnored:true,mobile:true,noAnalysisOrSync:true,pageErrors:errors}));
}finally{release?.();releaseHtml?.();await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
