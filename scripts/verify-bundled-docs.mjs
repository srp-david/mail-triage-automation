import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
await mkdir('.runtime/bundled-docs',{recursive:true});const home=await mkdtemp(resolve('.runtime/bundled-docs/run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const control=randomBytes(32).toString('base64url'),origin='http://127.0.0.1:'+port,actor={userId:'synthetic',role:'analyst'};
const session={usernameMode:true,token:async()=> 'synthetic',identity:async()=>actor,status:async()=>actor};
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  app.get('/api/status',(_req,res)=>res.json({storeId:'',originalAvailable:false,sync:null}));
  app.get('/api/updates',(_req,res)=>res.json({status:'unavailable',phase:'idle',currentVersion:'0.3.10'}));
}}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],violations=[],remote=[];
await context.addInitScript(()=>{window.docsViolations=[];document.addEventListener('securitypolicyviolation',e=>window.docsViolations.push(e.violatedDirective));});
context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==origin)remote.push(r.url());});});
try{
  const ticket=await(await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}})).json();await page.goto(ticket.url);
  const link=page.getByRole('link',{name:'기술 문서 (새 탭)',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),'/docs/');
  const popup=context.waitForEvent('page');await link.click();const docs=await popup;docs.setDefaultTimeout(30000);await docs.waitForLoadState();
  await docs.getByRole('heading',{name:'문서 안내',exact:true}).waitFor();assert.equal(new URL(docs.url()).origin,origin);
  const readme=await docs.getByRole('link',{name:'프로젝트 README',exact:true}).getAttribute('href');const response=await fetch(new URL(readme,origin));assert.equal(response.status,200);assert.match(await response.text(),/# 메일 분석실/);
  await docs.locator('main').getByRole('link',{name:'아키텍처',exact:true}).click();await docs.locator('.docusaurus-mermaid-container svg').first().waitFor();assert.match(new URL(docs.url()).pathname,/^\/docs\/architecture\/$/);
  violations.push(...await docs.evaluate(()=>window.docsViolations));await docs.reload();await docs.locator('.docusaurus-mermaid-container svg').first().waitFor();
  const search=docs.getByLabel('Search',{exact:true});await search.fill('아키텍처');await docs.getByRole('listbox').waitFor();assert.match(await docs.getByRole('listbox').innerText(),/아키텍처/);await search.press('Escape');
  await docs.screenshot({path:join(home,'desktop.png')});violations.push(...await docs.evaluate(()=>window.docsViolations));
  await docs.setViewportSize({width:390,height:844});await docs.goto(origin+'/docs/');await docs.getByRole('button',{name:'사이드바 펼치거나 접기'}).click();await docs.locator('.navbar-sidebar').waitFor();assert.equal(await docs.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await docs.screenshot({path:join(home,'mobile.png')});violations.push(...await docs.evaluate(()=>window.docsViolations));
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);assert.deepEqual(remote,[]);
  assert.equal((await fetch(origin+'/api/status')).status,401);
  const appCsp=(await fetch(origin)).headers.get('content-security-policy');assert.ok(!appCsp.includes("script-src 'self' 'unsafe-inline'"));
  const result={home,sameOrigin:true,newTab:true,readme:true,mermaid:true,nestedPageReload:true,koreanSearch:true,mobileMenu:true,externalRequests:0,cspViolations:0,apiUnauthenticated:401,realAccountUsed:false};await writeFile(join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
