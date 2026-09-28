import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.ts';
import {ApiError} from '../packages/contracts/src/v1.ts';
await mkdir('.runtime/session-ui',{recursive:true});const home=await mkdtemp(resolve('.runtime/session-ui/run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port,control=randomBytes(32).toString('base64url'),delay=ms=>new Promise(r=>setTimeout(r,ms));
let logged=true,failed=false;const calls=[];
const sourceId=randomUUID(),runnerId=randomUUID(),collectionId=randomUUID();
const actor=()=>{if(!logged)throw new ApiError(401,'LOGIN_REQUIRED');return {userId:'synthetic',role:'analyst'};};
const session={usernameMode:true,token:async()=>{actor();return 'synthetic';},identity:async()=>actor(),status:async()=>{await delay(600);if(failed)throw new ApiError(503,'SYNTHETIC_UNAVAILABLE');return actor();}};
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  localUiRoutes(app,{request:async(path)=>{calls.push(path);return path==='/sources'?[{id:sourceId,display_name:'내 메일'}]:path==='/runners'?[{id:runnerId,display_name:'내 PC',active:true,agents:['codex']}]:[];}},
  {selection:async()=>({sourceId,runnerId,collectionId,agent:'codex'}),configure:async()=>({ok:true}),status:async()=>{await delay(400);return {storeId:sourceId,originalAvailable:false,sync:null};},environment:()=>({mailConfigured:true,agents:['codex'],evidenceRootCount:0,dbConfigured:false})});
  app.get('/api/updates',(_req,res)=>res.json({currentVersion:'0.3.8',status:'unavailable',phase:'idle'}));
}}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.loginRendered=false;new MutationObserver(()=>{if(document.querySelector('#login'))window.loginRendered=true;}).observe(document,{childList:true,subtree:true});});
try{
  const ticket=await(await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1','content-type':'application/json'},body:JSON.stringify({page:'settings'})})).json();await page.goto(ticket.url);
  await page.getByText('로그인 상태와 화면을 불러오고 있습니다.').waitFor();await page.screenshot({path:join(home,'loading.png')});
  await page.getByRole('heading',{name:'환경설정'}).waitFor();assert.equal(await page.evaluate(()=>window.loginRendered),false);
  for(let i=0;i<3;i++){await page.reload();await page.getByRole('heading',{name:'환경설정'}).waitFor();assert.equal(await page.evaluate(()=>window.loginRendered),false);assert.equal(new URL(page.url()).hash,'#settings');}
  assert.equal(await page.getByRole('tab',{name:'공유·장치 관리'}).count(),0);assert.equal(await page.getByRole('button',{name:'장치 폐기'}).count(),0);assert.equal(calls.some(p=>p==='/members'||p==='/collections'),false);
  for(const name of ['분석 실행 켜기','동기화 실행 켜기','로컬 실행 중지'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
  await page.getByRole('button',{name:'선택 저장',exact:true}).click();await page.locator('#notice').waitFor({state:'visible'});
  await page.locator('#notice').waitFor({state:'hidden',timeout:7000});
  await page.screenshot({path:join(home,'settings-desktop.png')});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(home,'settings-mobile.png'),fullPage:true});
  failed=true;await page.reload();await page.getByRole('button',{name:'다시 확인'}).waitFor();assert.equal(await page.evaluate(()=>window.loginRendered),false);failed=false;await page.getByRole('button',{name:'다시 확인'}).click();await page.getByRole('heading',{name:'환경설정'}).waitFor();assert.equal(await page.evaluate(()=>window.loginRendered),false);
  logged=false;await page.reload();await page.getByRole('button',{name:'로그인',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.loginRendered),true);assert.equal(await page.getByRole('button',{name:'회사 계정으로 로그인'}).count(),0);
  const index=await readFile('public/react/index.html','utf8'),asset=index.match(/src="([^"]+\.js)"/)[1],hash=b=>createHash('sha256').update(b).digest('hex');const served=Buffer.from(await(await fetch(origin+asset)).arrayBuffer());assert.equal(hash(served),hash(await readFile(join('public',asset))));assert.deepEqual(errors,[]);
  const result={home,delayedSessionAndStatus:true,reloadsWithoutLoginFlash:3,failedCheckRetry:true,signedOutLogin:true,managementRemoved:true,manualWorkerControlsRemoved:true,noticeAutoDismiss:true,noMembersOrCollectionsQuery:true,mobileNoOverflow:true,servedUiSha256:hash(served),realAccountUsed:false};await writeFile(join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
