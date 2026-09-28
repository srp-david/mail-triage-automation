import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync,sign,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.ts';
import {LocalUpdates} from '../apps/local-app/src/updates.ts';
import {updateRoutes} from '../apps/local-app/src/update-routes.ts';
import {updatePublicKeys,updateSigningBytes} from '../packages/contracts/src/updates.ts';

await mkdir('.runtime/update-ui',{recursive:true});const home=await mkdtemp(resolve('.runtime/update-ui/run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port,control=randomBytes(32).toString('base64url');
const key=generateKeyPairSync('ed25519'),keyId='0123456789abcdef';updatePublicKeys[keyId]=key.publicKey.export({type:'spki',format:'pem'});
const unsigned={metadataVersion:1,releaseId:'v0.3.9',version:'0.3.9',channel:'stable',platform:'win32-x64',sourceCommit:'a'.repeat(40),apiContract:'1',assetUrl:'https://github.com/srp-david/mail-triage-automation/releases/download/v0.3.9/setup.exe',releaseNotesUrl:'https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.9',assetSha256:'a'.repeat(64),assetSize:100,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),keyId};
const offer={...unsigned,signature:sign(null,updateSigningBytes(unsigned),key.privateKey).toString('base64url')};
let checks=0,mode='offered',progress=null,installs=0;
const updates=new LocalUpdates(home,'0.3.5',{request:async()=>{checks++;if(mode==='error')throw Error('synthetic offline');return {status:mode,update:offer};}},{drain:async()=>{},releaseDrain(){}});
const originalSnapshot=updates.snapshot.bind(updates);updates.snapshot=()=>progress??originalSnapshot();
// UI-only install simulation: no downloaded or executed installer, real scheduler/check/defer routes.
updates.beginInstall=()=>{installs++;progress={...originalSnapshot(),phase:'downloading',downloadedBytes:25,totalBytes:100};return progress;};
const session={usernameMode:true,token:async()=> 'synthetic',identity:async()=>({userId:'synthetic',role:'analyst'}),status:async()=>({userId:'synthetic',role:'analyst'})};
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  localUiRoutes(app,{request:async()=>[]},{selection:async()=>({sourceId:'',agent:'claude'}),status:async()=>({storeId:'',originalAvailable:false,sync:null})});
  updateRoutes(app,updates,async()=>{});
}}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));updates.start(200);
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
try{
  const ticket=await(await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1','content-type':'application/json'},body:JSON.stringify({page:'updates'})})).json();await page.goto(ticket.url);
  const panel=page.getByRole('tabpanel',{name:'앱 업데이트'});await panel.getByRole('button',{name:'지금 설치'}).waitFor();
  assert.equal((await fetch(origin+'/api/updates/check',{method:'POST'})).status,401);
  assert.equal(await page.evaluate(async()=> (await fetch('/api/updates/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status),403);
  await panel.getByRole('button',{name:'나중에'}).click();await panel.getByText(/업데이트를 미뤘습니다/).waitFor();assert.equal(installs,0);
  await page.reload();await panel.getByText(/업데이트를 미뤘습니다/).waitFor();
  await panel.getByRole('button',{name:'업데이트 확인'}).click();await panel.getByRole('button',{name:'나중에'}).waitFor();
  await page.screenshot({path:join(home,'updates-desktop.png')});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(home,'updates-mobile.png'),fullPage:true});
  await panel.getByRole('button',{name:'지금 설치'}).click();await panel.getByText('25% 다운로드됨').waitFor();assert.equal(installs,1);
  progress={...progress,phase:'waiting'};await panel.getByText('진행 중인 작업이 끝나기를 기다립니다.').waitFor();
  progress=null;mode='error';await updates.check(true);await page.reload();await panel.getByText(/네트워크 연결을 확인/).waitFor();
  mode='current';await panel.getByRole('button',{name:'업데이트 확인'}).click();await panel.getByText('최신 버전을 사용하고 있습니다.').waitFor();
  const index=await readFile('public/react/index.html','utf8'),asset=index.match(/src="([^"]+\.js)"/)[1];const served=Buffer.from(await(await fetch(origin+asset)).arrayBuffer());const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(served),hash(await readFile(join('public',asset))));
  await page.close();const before=checks;await new Promise(r=>setTimeout(r,450));assert.ok(checks>before);assert.deepEqual(errors,[]);
  const receipt={home,nodeChecksWithoutBrowser:true,manualCheck:true,deferAcrossReload:true,downloadProgress:true,waiting:true,failureAndRetry:true,localAuthorization:true,mobileNoOverflow:true,servedUiSha256:hash(served),simulatedInstall:true,realAccountUsed:false};await writeFile(join(home,'result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{updates.stop();delete updatePublicKeys[keyId];await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
