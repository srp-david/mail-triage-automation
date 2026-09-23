import assert from 'node:assert/strict';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-maintenance-ui-'.repeat(4);
let server,base=process.env.PREVIEW_BASE_URL;
if(!base){const {createApp}=await import('../src/server.ts');server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mutations=[];
page.on('pageerror',e=>errors.push(e.message));
const documents=[{id:'legacy-one',source_path:'erp/gg/reports/'+('long_legacy_filename_'.repeat(12))+'.md',source_hash:'a'.repeat(64),kind:'report',mail_key:null},
{id:'legacy-two',source_path:'erp/gg/reports/linked.md',source_hash:'b'.repeat(64),kind:'report',mail_key:'known'}];
await page.route('**/api/**',route=>{
 const request=route.request(),url=new URL(request.url());if(request.method()!=='GET')mutations.push(url.pathname);
 const p=url.pathname;let json;
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mail-analysis')json=[];
 else if(p==='/api/mails')json={emails:[{id:1,subject:'Fixture mail',from:[]}],total:1,nextOffset:null};
 else if(p==='/api/mails/1')json={id:1,subject:'Fixture mail',body:'Fixture body',attachments:[]};
 else if(p.endsWith('/body'))json={html:''};
 else if(p==='/api/runs')json=[{id:'external-run',subject:'Outlook fixture',source:'direct',status:'needs_input',identity_kind:'outlook'}];
 else if(p==='/api/runs/external-run')json={id:'external-run',subject:'Outlook fixture',source:'direct',status:'needs_input',identity_kind:'outlook',mail_id:null,result:{report:'Synthetic report',question:'Which screen?',knowledge:''},reviews:[]};
 else if(p==='/api/legacy')json=url.searchParams.has('mailId')?[documents[1]]:documents;
 else if(p.startsWith('/api/legacy/'))json={...documents[0],body:'<img src=x onerror=alert(1)>\nOriginal legacy status: resolved by customer confirmation.'};
 else throw new Error('Unexpected route '+p);
 return route.fulfill({json});
});
try{
 await page.goto(base);await page.locator('#mails .mail').waitFor();
 await page.getByRole('link',{name:'이전 이력',exact:true}).click();
 await page.getByRole('button',{name:'기존 문서 조회',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#legacy-list .run').length===2);
 assert.equal(await page.locator('#legacy-list .run').count(),2);
 await page.getByRole('button',{name:documents[0].source_path.split('/').pop(),exact:true}).click();
 await page.locator('#legacy-document .markdown-body').waitFor();assert.equal(await page.locator('#legacy-document img').count(),0);
 assert.ok((await page.locator('#legacy-document .markdown-body').textContent()).includes('resolved by customer confirmation'));
 await page.keyboard.press('Escape');await page.getByRole('link',{name:'메일함',exact:true}).click();
 await page.locator('#mails .mail').click();await page.getByRole('button',{name:'이 메일 분석 이력',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#mail-legacy-list .run').length===1);
 assert.equal(await page.locator('#mail-legacy-list .badge').textContent(),'메일 연결 확인');
 await page.locator('#mail-runs .run button').click();await page.getByText(/Outlook 예외 메일은 직접 실행에서/).waitFor();
 assert.equal(await page.getByRole('button',{name:'답변하고 다시 분석',exact:true}).count(),0);
 await page.keyboard.press('Escape');await page.getByRole('link',{name:'이전 이력',exact:true}).click();
 await page.getByRole('button',{name:documents[0].source_path.split('/').pop(),exact:true}).click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 console.log(JSON.stringify({legacyList:true,explicitMailFilter:true,untrustedMarkdownSafe:true,externalManualAnswer:true,mobile:true,pageErrors:errors,apiMutations:mutations}));
}finally{await browser.close();if(server)await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
