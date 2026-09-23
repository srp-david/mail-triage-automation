import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {UsernameLogin} from '../apps/local-app/src/username-login.ts';
import {LocalSession} from '../apps/local-app/src/session.ts';
import {ProtectedStore} from '../apps/local-app/src/protected-store.ts';
import {HistoryClient} from '../packages/history-client/src/index.ts';
import {LocalProfile} from '../apps/local-app/src/profile.ts';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.ts';
export async function verifyUsernameBrowser({base,dir,adminPassword}){
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const store=new ProtectedStore(resolve(dir,'browser-secrets')),login=new UsernameLogin(base,'https://poc.invalid/auth','mail-triage');
 const session=new LocalSession(login,store,t=>login.identify(t)),history=new HistoryClient(base,()=>session.token()),profile=new LocalProfile(history,session,store);
 const control='synthetic-control-'.repeat(3),origin='http://127.0.0.1:'+port;
 const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  localUiRoutes(app,history,{selection:()=>profile.selection(),registerSource:b=>profile.registerSource(b),registerRunner:b=>profile.registerRunner(b),configure:b=>profile.configure(b),status:()=>profile.status()});
  app.get('/api/admin/users',async(_q,r)=>r.json(await history.request('/admin/users')));
  app.post('/api/admin/users',async(q,r)=>r.json(await history.request('/admin/users',q.body)));
  app.post('/api/admin/users/:id/reset',async(q,r)=>r.json(await history.request('/admin/users/'+q.params.id+'/reset',{})));
 }}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const r=await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}}),ticket=await r.json();await page.goto(ticket.url);
  const signIn=async(name,password)=>{await page.getByLabel('사용자명',{exact:true}).fill(name);await page.getByLabel('비밀번호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();};
  await signIn('admin.one',adminPassword);await page.getByRole('link',{name:'관리자',exact:true}).click();await page.getByRole('heading',{name:'사용자 관리'}).waitFor();
  const restarted=new LocalSession(login,store,t=>login.identify(t));assert.equal((await restarted.status()).role,'admin');
  const saved=await store.read('session');assert.ok(saved.refreshToken);assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('accessToken')),false);
  await page.getByLabel('새 사용자명',{exact:true}).fill('browser.user');await page.getByLabel('표시 이름',{exact:true}).fill('브라우저 합성');await page.getByRole('button',{name:'계정 생성',exact:true}).click();
  const secret=await page.getByLabel('발급된 임시 비밀번호').inputValue();assert.ok(secret.length>=24);await page.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.getByLabel('발급된 임시 비밀번호').count(),0);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await signIn('browser.user',secret);await page.getByRole('heading',{name:'비밀번호 변경',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'관리자',exact:true}).count(),0);
  const denied=await page.evaluate(async()=>{const r=await fetch('/api/admin/users');return r.status;});assert.equal(denied,403);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await signIn('browser.user',secret);await page.getByRole('heading',{name:'비밀번호 변경',exact:true}).waitFor();
  await page.getByLabel('현재 비밀번호').fill(secret);await page.getByLabel('새 비밀번호',{exact:true}).fill('Synthetic browser password 123!');await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();
  await signIn('browser.user','Synthetic browser password 123!');await page.getByRole('link',{name:'설정',exact:true}).waitFor();
  await page.getByLabel('팀 사용자',{exact:true}).locator('option').filter({hasText:'admin.one'}).waitFor({state:'attached'});
  assert.equal(await page.getByRole('link',{name:'관리자',exact:true}).count(),0);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/admin/users')).status),403);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/password',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status),403);
  const rawStorage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));for(const value of [saved.accessToken,saved.refreshToken,secret])assert.equal(rawStorage.includes(value),false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:resolve(dir,'username-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  await session.logout();await assert.rejects(new LocalSession(login,store,t=>login.identify(t)).token(),/LOGIN_REQUIRED/);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}
