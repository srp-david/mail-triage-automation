import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.ts';
import {ApiError} from '../packages/contracts/src/v1.ts';

await mkdir('.runtime/account-ui',{recursive:true});const home=await mkdtemp(resolve('.runtime/account-ui/run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port,control=randomBytes(32).toString('base64url');
let logged=true,role='admin',mustChange=false,passwordChanged=0,created=0,reset=0,updated=0;
const secret=randomBytes(24).toString('base64url');
const users=[{id:'admin-fixture',username:'demo.admin',display_name:'운영 관리자',role:'admin',active:true,must_change:false},{id:'analyst-fixture',username:'demo.analyst',display_name:'분석 담당자',role:'analyst',active:true,must_change:true},{id:'viewer-fixture',username:'demo.viewer',display_name:'조회 담당자',role:'viewer',active:false,must_change:false}];
const actor=()=>{if(!logged)throw new ApiError(401,'UNAUTHENTICATED');return {userId:'admin-fixture',role,mustChangePassword:mustChange};};
const session={usernameMode:true,token:async()=>{actor();return 'synthetic';},identity:async()=>actor(),status:async()=>actor(),password:async()=>{passwordChanged++;logged=false;mustChange=false;return {ok:true};}};
const context={selection:async()=>({sourceId:'',agent:'claude'}),status:async()=>({storeId:'',originalAvailable:false,sync:null}),environment:()=>({mailConfigured:false,agents:[],evidenceRootCount:0,dbConfigured:false})};
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  localUiRoutes(app,{request:async()=>[]},context);
  app.get('/api/updates',(_req,res)=>res.json({status:'current'}));
  app.get('/api/admin/users',(_req,res)=>res.json(users));
  app.post('/api/admin/users',(req,res)=>{created++;users.push({id:'new-fixture',username:req.body.username,display_name:req.body.displayName,role:req.body.role,active:true,must_change:true});res.json({temporaryPassword:secret});});
  app.post('/api/admin/users/:id/reset',(_req,res)=>{reset++;res.json({temporaryPassword:secret});});
  app.post('/api/admin/users/:id',(req,res)=>{updated++;const user=users.find(user=>user.id===req.params.id);Object.assign(user,{display_name:req.body.displayName,role:req.body.role,active:req.body.active});res.json({ok:true});});
}}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
try{
  const ticket=await(await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}})).json();await page.goto(ticket.url);
  await page.goto(origin+'/#admin');await page.getByRole('article',{name:'demo.admin 계정'}).waitFor();
  await page.screenshot({path:join(home,'admin-desktop.png')});
  await page.getByLabel('계정 검색').fill('demo.viewer');assert.equal(await page.getByRole('article').count(),1);await page.getByLabel('계정 검색').fill('');
  const user=page.getByRole('article',{name:'demo.viewer 계정'});await user.getByText('계정 정보 수정',{exact:true}).click();await user.getByLabel('표시 이름',{exact:true}).fill('조회 담당자 수정');await user.getByRole('button',{name:'계정 저장'}).click();await page.getByText('계정 정보를 저장했습니다.',{exact:true}).waitFor();assert.equal(updated,1);
  await user.getByRole('button',{name:'비밀번호 초기화'}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.getByLabel('발급된 임시 비밀번호',{exact:true}).inputValue(),secret);assert.equal(reset,1);await dialog.getByRole('button',{name:'확인 후 닫기'}).click();
  await page.getByText('새 계정 만들기',{exact:true}).click();const form=page.locator('.admin-create');await form.getByLabel('새 사용자명',{exact:true}).fill('demo.new');await form.getByLabel('표시 이름',{exact:true}).fill('새 테스트 사용자');await form.getByRole('button',{name:'계정 생성'}).click();await dialog.waitFor();assert.equal(created,1);await dialog.getByRole('button',{name:'확인 후 닫기'}).click();
  await page.getByText('새 계정 만들기',{exact:true}).click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(home,'admin-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('link',{name:'설정',exact:true}).click();await page.getByRole('heading',{name:'환경설정'}).waitFor();assert.equal(await page.getByRole('button',{name:'비밀번호 변경',exact:true}).count(),0);
  await page.getByRole('link',{name:'내 계정',exact:true}).click();await page.getByRole('heading',{name:'내 계정',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'내 계정',exact:true}).waitFor();await page.screenshot({path:join(home,'account-desktop.png')});
  await page.getByLabel('현재 비밀번호',{exact:true}).fill('synthetic-old');await page.getByLabel('새 비밀번호',{exact:true}).fill(secret);await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await page.getByRole('button',{name:'로그인',exact:true}).waitFor();assert.equal(passwordChanged,1);
  logged=true;role='analyst';mustChange=true;await page.reload();await page.getByText('계속 사용하려면 임시 비밀번호를 새 비밀번호로 변경하세요.',{exact:true}).waitFor();assert.equal(await page.getByRole('navigation',{name:'주 메뉴'}).isVisible(),false);
  mustChange=false;await page.reload();await page.getByRole('link',{name:'내 계정',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'관리자',exact:true}).count(),0);
  assert.deepEqual(errors,[]);const receipt={adminAutoload:true,filter:true,edit:true,create:true,temporaryPasswordDialog:true,accountSeparate:true,accountDeepLink:true,passwordLogout:true,requiredPasswordChange:true,nonAdminMenuHidden:true,mobileNoOverflow:true,realAccountsChanged:false,home};await writeFile(join(home,'result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
