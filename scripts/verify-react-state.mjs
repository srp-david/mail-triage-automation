import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-react-state-'.repeat(3);
const strictDev=process.argv.includes('--strict-dev'),devDirectory=resolve('.runtime/react-strict');
if(strictDev){
 const {build}=await import('vite');await build({configFile:'packages/ui/ui/vite.config.ts',define:{'process.env.NODE_ENV':JSON.stringify('development')},build:{outDir:devDirectory,minify:false}});
}
const {createApp}=await import('../src/server.ts');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],csp=[],posts=[],requests=[];
if(strictDev){
 await page.route('**/react/**',async route=>{const pathname=new URL(route.request().url()).pathname;const file=resolve(devDirectory,pathname.slice('/react/'.length));assert.ok(file.startsWith(devDirectory));await route.fulfill({body:await readFile(file),contentType:file.endsWith('.css')?'text/css':'application/javascript'});});
 await page.route('http://127.0.0.1:'+server.address().port+'/',async route=>route.fulfill({response:await route.fetch(),body:await readFile(devDirectory+'/index.html','utf8')}));
 // Assert that the root StrictMode uses the development renderer (effects replay).
 await page.addInitScript(()=>{window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(renderer){window.__reactDevelopment=renderer.bundleType===1;return 1;},onCommitFiberRoot(){},onCommitFiberUnmount(){}};});
}
page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Content Security Policy|violates.*directive/i.test(m.text()))csp.push(m.text());});
await page.clock.install();
let unauthorized=false,releaseSearch,releaseMail,searchStarted,mailStarted,holdSearch=false,holdMail=false;
const mail=id=>({id,subject:'합성 메일 '+id,body:'본문 '+id,messageId:`<fixture-${id}@example.test>`,attachments:[],from:[]});
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),p=url.pathname;requests.push(p);
 if(req.method()==='POST')posts.push(p);
 if(p==='/api/login'){unauthorized=false;return route.fulfill({json:{ok:true}});}
 if(unauthorized)return route.fulfill({status:401,json:{error:'expired'}});
 let json;
 if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
 else if(p==='/api/mails'){
  if(holdSearch){holdSearch=false;searchStarted?.();await new Promise(r=>releaseSearch=r);}
  json={emails:[mail(url.searchParams.get('query')==='old'?9:1),mail(2)],total:2,nextOffset:null};
 }else if(p==='/api/mail-analysis')json=[];
 else if(p==='/api/mails/1'&&holdMail){holdMail=false;mailStarted?.();await new Promise(r=>releaseMail=r);json=mail(1);}
 else if(/^\/api\/mails\/\d+$/.test(p))json=mail(Number(p.split('/').at(-1)));
 else if(p.endsWith('/body'))json={html:''};
 else if(['/api/runs','/api/legacy','/api/thread-links'].includes(p))json=[];
 else throw Error('Unexpected path '+p);
 await route.fulfill({json});
});
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.mail[data-mail-id="1"]').waitFor();
 if(strictDev)assert.equal(await page.evaluate(()=>window.__reactDevelopment),true,'Development React must be used for StrictMode replay');
 const before=requests.length;await page.clock.fastForward(10000);await page.waitForTimeout(100);
 assert.deepEqual(requests.slice(before).sort(),['/api/mail-analysis','/api/status']);
 const pending=new Promise(r=>searchStarted=r);holdSearch=true;await page.locator('#query').fill('old');await page.getByRole('button',{name:'검색',exact:true}).click();await pending;
 await page.locator('#query').fill('new');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText('적용된 조건 · 검색어: new',{exact:true}).waitFor();
 releaseSearch();await page.waitForTimeout(80);assert.equal(await page.locator('.mail[data-mail-id="9"]').count(),0);
 const waiting=new Promise(r=>mailStarted=r);holdMail=true;await page.locator('.mail[data-mail-id="1"]').click();await waiting;
 await page.locator('.mail[data-mail-id="2"]').click();await page.getByRole('heading',{name:'합성 메일 2',exact:true}).waitFor();releaseMail();await page.waitForTimeout(80);assert.equal(await page.locator('#detail h2').textContent(),'합성 메일 2');
 await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#view-history').waitFor();await page.goBack();await page.locator('#view-mailbox').waitFor();
 assert.equal(await page.locator('#query').inputValue(),'new');assert.equal(await page.locator('#detail h2').textContent(),'합성 메일 2');
 unauthorized=true;await page.clock.fastForward(10000);await page.locator('#login:not([hidden])').waitFor();const expiredCount=requests.length;
 await page.clock.fastForward(30000);await page.waitForTimeout(50);assert.equal(requests.length,expiredCount,'No polling after 401');
 await page.locator('#token').fill('synthetic');await page.locator('#login-form button').click();await page.locator('#workspace:not([hidden])').waitFor();await page.getByRole('heading',{name:'합성 메일 2',exact:true}).waitFor();
 assert.equal(await page.locator('#query').inputValue(),'new');assert.equal(await page.locator('.mail.is-selected').getAttribute('data-mail-id'),'2');
 assert.deepEqual(posts,['/api/login']);assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
 await mkdir('.runtime/react-validation',{recursive:true});const result={developmentStrictMode:strictDev,singlePoll:true,searchRace:true,detailRace:true,hashBack:true,reauthSearchAndSelection:true,noPollingAfter401:true,noAutomaticMutations:true,noCspErrors:true};
 await writeFile('.runtime/react-validation/'+(strictDev?'state-strict-dev':'state')+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{releaseSearch?.();releaseMail?.();await browser.close();await new Promise(r=>server.close(r));}
