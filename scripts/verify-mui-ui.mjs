import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:net';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {ApiError} from '../packages/contracts/src/v1.ts';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
let authenticated=false,mustChange=false,settings={sourceId:'source',collectionId:'',runnerId:'runner',agent:'codex',originalAvailable:true,environment:{mailConfigured:true,agents:['codex','claude'],evidenceRootCount:2,dbConfigured:false}};
const runtime={analysis:'stopped',sync:'stopped',analysisAvailable:true};
const writes=[],searches=[],errors=[];
const session={usernameMode:true,token:async()=>{if(!authenticated)throw new ApiError(401,'LOGIN_REQUIRED');return 'synthetic';},
 status:async()=>({userId:'synthetic-admin',role:'admin',mustChangePassword:false}),identity:async()=>({userId:'synthetic-admin',role:'admin',mustChangePassword:false}),
 credentials:async b=>{if(b.username!=='admin'||b.password!=='synthetic-password')throw new ApiError(401,'LOGIN_FAILED');authenticated=true;},
 logout:async()=>{authenticated=false;return{ok:true};},password:async()=>({ok:true})};
// status must reflect unauthenticated state in /api/session too.
session.status=async()=>{await session.token();return{userId:'synthetic-admin',role:'admin',mustChangePassword:mustChange};};
const control='synthetic-mui-control-'.repeat(3),base='http://127.0.0.1:'+port;
const app=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
 app.get('/favicon.ico',(_req,res)=>res.status(204).end());
 app.use('/api',(req,res)=>{
  if(req.method!=='GET')writes.push({path:req.path,body:req.body});
  let value;
  switch(req.path){
   case '/status':value={storeId:'source',originalAvailable:true,sync:null,worker:{online:true,state:'ready'}};break;
   case '/mails':searches.push(req.query);value={emails:[{id:1,subject:'MUI 합성 문의',from:[],body:'합성 본문'}],total:1,nextOffset:null};break;
   case '/mails/1':value={id:1,subject:'MUI 합성 문의',from:[],body:'합성 본문',attachments:[]};break;
   case '/mails/1/body':value={html:''};break;
   case '/settings':if(req.method==='POST')settings={...settings,...req.body};value=settings;break;
   case '/runtime':value=runtime;break;
   case '/runtime/start':runtime[req.body.kind]='idle';value={ok:true};break;
   case '/sources':value=[{id:'source',display_name:'합성 메일 출처'}];break;
   case '/collections':value=[{id:'collection',name:'합성 문서 모음'}];break;
   case '/runners':value=[{id:'runner',display_name:'합성 실행 장치',active:true,agents:['codex','claude']}];break;
   case '/members':value=[{id:'member',username:'viewer',display_name:'합성 사용자'}];break;
   case '/admin/users':value=req.method==='POST'?{temporaryPassword:'synthetic-temporary'}:[{id:'member',username:'viewer',display_name:'합성 사용자',role:'viewer',active:true,must_change:true}];break;
   case '/admin/users/member':value={ok:true};break;
   case '/mail-analysis':case '/runs':case '/legacy':case '/thread-links':value=[];break;
   default:throw Error('Unexpected synthetic route: '+req.path);
  }res.json(value);
 });
}});
const server=app.listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.violatedDirective));});
await mkdir('.runtime/mui',{recursive:true});
try{
 const response=await fetch(base+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}});assert.equal(response.status,200);
 await page.goto((await response.json()).url);await page.getByLabel('사용자명',{exact:true}).fill('admin');await page.getByLabel('비밀번호',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.locator('#mails .mail').waitFor();
 const nonce=await page.locator('meta[name="csp-nonce"]').getAttribute('content');assert.ok(nonce);
 assert.ok(await page.locator('style[data-emotion]').count());
 assert.equal(await page.locator('style[data-emotion]').evaluateAll(styles=>styles.every(s=>s.nonce===document.querySelector('meta[name="csp-nonce"]').content)),true);
 const before=searches.length;await page.locator('#query').fill('한글');
 await page.locator('#query').evaluate(input=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true,cancelable:true})));await page.waitForTimeout(100);assert.equal(searches.length,before);
 await page.locator('#query').press('Enter');await page.waitForFunction(()=>document.querySelector('#applied-filters').textContent.includes('한글'));assert.equal(searches.length,before+1);
 await page.locator('#from').fill('sender@example.test');await page.locator('#from').press('Enter');await page.waitForFunction(()=>document.querySelector('#applied-filters').textContent.includes('sender@example.test'));assert.equal(searches.length,before+2);
 await page.locator('#mails .mail').click();await page.locator('#detail pre').waitFor();
 await page.screenshot({path:'.runtime/mui/mailbox.png'});
 await page.getByRole('link',{name:'설정',exact:true}).click();await page.getByLabel('분석 도구',{exact:true}).selectOption('claude');await page.getByLabel('실행 장치',{exact:true}).selectOption('runner');await page.getByRole('button',{name:'선택 저장',exact:true}).click();await page.getByText('출처와 실행 설정을 저장했습니다.',{exact:true}).waitFor();assert.equal(settings.agent,'claude');assert.equal(settings.runnerId,'runner');
 await page.screenshot({path:'.runtime/mui/settings.png'});
 await page.getByRole('button',{name:'실행 상태 확인',exact:true}).click();await page.getByText('분석: 중지됨',{exact:true}).waitFor();
 await page.getByRole('button',{name:'분석 실행 켜기',exact:true}).click();await page.getByText('분석: 대기 중',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'분석 실행 켜기',exact:true}).isDisabled(),true);
 await page.getByLabel('분석 도구',{exact:true}).selectOption('codex');assert.equal(await page.getByRole('button',{name:'실행 상태 확인',exact:true}).isDisabled(),true);
 await page.getByLabel('실행 장치',{exact:true}).selectOption('runner');await page.getByRole('button',{name:'선택 저장',exact:true}).click();await page.getByRole('button',{name:'실행 상태 확인',exact:true}).waitFor();
 await page.getByRole('tab',{name:'공유·장치 관리',exact:true}).click();await page.getByRole('heading',{name:'공유 관리',exact:true}).waitFor();assert.equal(await page.getByLabel('분석 도구',{exact:true}).isVisible(),false);
 await page.getByRole('tab',{name:'중단 작업 복구',exact:true}).click();await page.getByRole('heading',{name:'중단·미전송 작업 복구',exact:true}).waitFor();
 await page.getByRole('tab',{name:'개인 연결',exact:true}).click();await page.setViewportSize({width:1440,height:1450});await page.screenshot({path:'.runtime/mui/settings.png',fullPage:true});await page.setViewportSize({width:1440,height:900});
 await page.getByRole('link',{name:'관리자',exact:true}).click();await page.getByRole('button',{name:'사용자 목록 조회',exact:true}).click();
 const row=page.locator('#view-admin > fieldset');await row.getByLabel('표시 이름',{exact:true}).fill('이름 변경');await row.getByLabel('역할',{exact:true}).selectOption('analyst');await row.getByLabel('활성',{exact:true}).uncheck();await row.getByRole('button',{name:'계정 저장',exact:true}).click();
 await page.waitForTimeout(100);assert.deepEqual(writes.find(w=>w.path==='/admin/users/member')?.body,{displayName:'이름 변경',role:'analyst',active:false});
 await page.screenshot({path:'.runtime/mui/admin.png'});
 for(const target of ['설정','관리자','메일함']){
  await page.setViewportSize({width:1440,height:900});await page.getByRole('link',{name:target,exact:true}).click();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,target+' mobile overflow');
  assert.equal(await page.getByRole('banner').getByRole('button',{name:'로그아웃',exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'메뉴',exact:true}).click();assert.equal(await page.locator('#workspace-nav').isVisible(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#workspace-nav').isVisible(),false);
  await page.screenshot({path:'.runtime/mui/'+target+'-mobile.png',fullPage:true});
 }
 assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);assert.deepEqual(errors,[]);
 assert.equal(await page.locator('#workspace-nav').isVisible(),false);assert.equal(await page.locator('#workspace-nav').getByRole('button',{name:'로그아웃',exact:true}).count(),0);
 mustChange=true;await page.reload();await page.getByLabel('현재 비밀번호',{exact:true}).waitFor();assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(await page.getByRole('button',{name:'로그아웃',exact:true}).count(),1);
 await page.getByRole('banner').getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByLabel('사용자명',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'로그아웃',exact:true}).count(),0);await page.screenshot({path:'.runtime/mui/login-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const first=await fetch(base+'/'),second=await fetch(base+'/react/index.html');const firstHtml=await first.text(),secondHtml=await second.text();
 const n=html=>html.match(/name="csp-nonce" content="([^"]+)"/)[1];assert.notEqual(n(firstHtml),n(secondHtml));
 assert.ok(first.headers.get('content-security-policy').includes("'nonce-"+n(firstHtml)+"'"));assert.ok(secondHtml.includes('name="triage-auth" content="native"'));
 console.log('PASS: MUI native login/logout, nonce CSP, IME Enter, settings save, admin fields/checkbox, mobile menu/layout, screenshots');
}finally{await browser.close();await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
