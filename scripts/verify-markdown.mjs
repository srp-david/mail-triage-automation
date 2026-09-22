import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-markdown-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const source = [
 '# 분석 보고서', '', '## 원인과 확인 사항', '', '**확인된 내용**과 *추가 확인*, ~~이전 추정~~.', '',
 '> 고객 확인 후 처리합니다.', '', '- 일반 항목', '- [x] 확인 완료', '- [ ] 추가 확인', '',
 '1. 첫 번째 단계', '2. 두 번째 단계', '',
 '| 항목 | 수량 | 상태 | 담당 | 근거 | 비고 |', '| --- | --- | --- | --- | --- | --- |',
 '| 요청 | 12 | 확인 | 담당자 | SELECT | 변경 없음 |', '',
 '```sql', 'SELECT "<script>alert(1)</script>" AS example;', 'SELECT ' + 'long_column_name, '.repeat(30) + '1;', '```', '',
 '인라인 `CODE_VALUE`', '', '[공식 문서](https://example.com/docs)', '',
 '[위험](javascript:alert%281%29) [상대 경로](/api/sync) [다른 메뉴](#legacy) [파일](file:///C:/secret)', '',
 '![외부 이미지](https://example.com/tracker.png) ![내부 이미지](/api/unexpected-image)', '',
 '<script>window.injected=true</script>', '', '<img src="/api/unexpected-html" onerror="window.injected=true">', '',
 '<svg onload="window.injected=true"><a href="javascript:alert(1)">SVG</a></svg>', '',
 '<iframe src="https://example.com/frame"></iframe><style>body{display:none}</style>', '',
 '<input autofocus><form action="/api/sync"><button>실행</button></form>', '',
 '<a href="https://example.com" ping="/api/ping">HTML link</a>',
 ].join('\n');
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],unexpected=[],mutations=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
await page.route('**/api/**',async route=>{
 const request=route.request(),p=new URL(request.url()).pathname;
 if(request.method()!=='GET')mutations.push(p);
 let json;
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mails')json={emails:[],total:0,nextOffset:null};
 else if(p==='/api/runs')json=[{id:'one',subject:'합성 분석',status:'completed',source:'web'}];
 else if(p==='/api/runs/one')json={subject:'합성 분석',status:'completed',result:{report:source,knowledge:'## 업무 지식\n\n- **검증된 제안**'},reviews:[{author:'검토자',body:'## 리뷰\n\n**추가 확인**'}]};
 else if(p==='/api/legacy')json=[{id:'old',source_path:'synthetic/report.md',source_hash:'a'.repeat(64)}];
 else if(p==='/api/legacy/old')json={source_path:'synthetic/report.md',source_hash:'a'.repeat(64),body:source};
 else {unexpected.push(p);return route.fulfill({status:404,json:{}});}
 await route.fulfill({json});
});
try{
 await page.goto(base+'/#history');await page.locator('#runs button').click();
 const body=page.locator('#report .markdown-body').first();await body.waitFor();
 assert.equal(await body.locator('h1').textContent(),'분석 보고서');
 assert.equal(await body.locator('table tbody tr').count(),1);
 assert.equal(await body.locator('strong').first().textContent(),'확인된 내용');
 assert.equal(await body.locator('blockquote').count(),1);assert.equal(await body.locator('ol li').count(),2);
 assert.equal(await body.locator('input[type=checkbox]:disabled').count(),2);
 assert.equal(await body.locator('input:checked').count(),1);
 assert.match(await body.locator('pre code').textContent(),/<script>alert\(1\)<\/script>/);
 assert.equal(await body.locator('script,img,svg,iframe,style,form,button').count(),0);
 assert.equal(await body.locator('a[href]').count(),1);
 assert.equal(await body.locator('a[href]').getAttribute('rel'),'noopener noreferrer');
 assert.equal(await body.locator('a[href]').getAttribute('target'),'_blank');
 assert.equal(await page.locator('#report .markdown-body h2').count(),3);
 assert.equal(await page.locator('#report a[href="/api/runs/one/export"]').count(),1);
 const fileButton=page.getByRole('link',{name:'Markdown 파일 열기 ↗',exact:true});
 assert.equal(await fileButton.getAttribute('target'),'_blank');assert.equal(await fileButton.getAttribute('rel'),'noopener');
 assert.equal(await page.locator('#report .report-tools .document-button').count(),1);
 assert.ok((await fileButton.boundingBox()).y+(await fileButton.boundingBox()).height<=(await body.boundingBox()).y);
 assert.equal(await fileButton.evaluate(e=>getComputedStyle(e).textDecorationLine),'none');
 await fileButton.focus();assert.equal(await fileButton.evaluate(e=>e===document.activeElement),true);
 await page.getByRole('button',{name:'보고서 원문 보기',exact:true}).click();
 assert.equal(await body.isVisible(),false);assert.equal(await page.locator('#report .markdown-source').first().textContent(),source);
 await page.getByRole('button',{name:'보고서 문서 보기',exact:true}).click();assert.equal(await body.isVisible(),true);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/markdown-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await page.locator('#history-body').evaluate(e=>e.scrollWidth>e.clientWidth),false);
 assert.equal(await body.locator('.markdown-table').evaluate(e=>e.scrollWidth>e.clientWidth),true);
 assert.equal(await body.locator('pre').evaluate(e=>e.scrollWidth>e.clientWidth),true);
 await page.screenshot({path:'.runtime/markdown-mobile.png'});
 await page.keyboard.press('Escape');await page.locator('#menu-toggle').click();await page.getByRole('link',{name:'이전 이력',exact:true}).click();
 await page.locator('#legacy-list button').click();await page.locator('#legacy-document .markdown-body h1').waitFor();
 await page.getByRole('button',{name:'이전 문서 원문 보기',exact:true}).click();
 assert.equal(await page.locator('#legacy-document .markdown-source').textContent(),source);
 assert.equal(await page.evaluate(()=>window.injected),undefined);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(mutations,[]);assert.deepEqual(external,[]);
 console.log(JSON.stringify({renderedMarkdown:true,knowledgeAndReviews:true,legacy:true,sourceExact:true,exportPreserved:true,safeLinks:true,noUntrustedRequests:true,mobileTableAndCodeScroll:true,pageErrors:errors,apiMutations:mutations}));
}catch(error){console.error({errors,notice:await page.locator('#history-notice').textContent()});throw error;}
finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
