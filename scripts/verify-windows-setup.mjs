import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,readFile,writeFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {installRelease,verifyRelease} from '../installer/windows/release.mjs';
import {startApp,stopApp} from '../installer/windows/lifecycle.mjs';
import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import {localSettingsSchema} from '../dist/apps/local-app/src/connections.js';

const [version,previous]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+$/.test(version??'')||!/^\d+\.\d+\.\d+$/.test(previous??''))throw Error('Usage: node scripts/verify-windows-setup.mjs VERSION PREVIOUS_VERSION');
await mkdir('.runtime/setup-defaults',{recursive:true});
const root=await mkdtemp(resolve('.runtime/setup-defaults/run-')),fresh=join(root,'신규 설치'),upgrade=join(root,'기존 설치');
const setup=resolve('.runtime/packages',version+'-setup.exe');
async function runSetup(home,label){
  await new Promise((resolve,reject)=>{
    const child=spawn(setup,['--test-home',home,'--no-shortcuts'],{windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:180000});
    let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
    child.once('error',reject);child.once('close',async(code)=>{
      try{await writeFile(join(root,label+'.log'),output);if(code!==0)throw Error('SETUP_FAILED: '+label);resolve();}catch(error){reject(error);}
    });
  });
}
await runSetup(fresh,'fresh');
const freshSettings=localSettingsSchema.parse(JSON.parse(await readFile(join(fresh,'config/settings.json'),'utf8')));
assert.equal(freshSettings.historyUrl,'https://tborximfpwrzzwuazjrb.supabase.co/functions/v1/history');
assert.equal(freshSettings.auth.issuer,'https://tborximfpwrzzwuazjrb.supabase.co/history-auth');
assert.equal(freshSettings.auth.audience,'mail-triage');assert.equal(freshSettings.auth.mode,'username');assert.equal(freshSettings.localPort,43180);
assert.equal(JSON.parse(await readFile(join(fresh,'active.json'),'utf8')).version,version);
await verifyRelease(join(fresh,'releases',version));
console.log('Fresh install completed with stdin closed and public defaults.');
// Use a free port only for the isolated browser check; keep the real default endpoints.
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
await writeFile(join(fresh,'config/settings.json'),JSON.stringify({...freshSettings,localPort:port}));
let running=false,browser;const remote=[];
try{
  await startApp(fresh,{allowCandidate:true,open:false});running=true;
  const control=await new ProtectedStore(join(fresh,'secrets')).read('cli-control');
  const ticket=await(await fetch('http://127.0.0.1:'+port+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control.token,'x-local-client':'1'}})).json();
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage();page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!=='http://127.0.0.1:'+port)remote.push(request.url());});
  await page.goto(ticket.url);await page.getByLabel('사용자명',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('비밀번호',{exact:true}).isVisible(),true);
  assert.equal(await page.locator('#login button[type=submit]').isVisible(),true);assert.equal(remote.length,0);
  await page.screenshot({path:join(root,'first-login.png')});
}finally{try{await browser?.close();}finally{if(running)await stopApp(fresh);}}
await assert.rejects(access(join(fresh,'app.lock')));
await installRelease(upgrade,resolve('.runtime/packages',previous),{allowCandidate:true});
const original=JSON.stringify({localPort:43299,historyUrl:'https://existing.synthetic.invalid/history',auth:{mode:'username',issuer:'https://existing.synthetic.invalid/auth',audience:'existing'},mailMcpUrl:'http://127.0.0.1:17082/mcp',agents:{codex:{executable:'C:/synthetic/codex.exe'}},evidenceRoots:{},customSetting:'preserve'});
await writeFile(join(upgrade,'config/settings.json'),original);await writeFile(join(upgrade,'work/synthetic.txt'),'preserved work');
const store=new ProtectedStore(join(upgrade,'secrets'));await store.write('setup-test',{synthetic:true});const secret=await readFile(join(upgrade,'secrets/setup-test.dpapi'));
await runSetup(upgrade,'upgrade');
assert.equal(await readFile(join(upgrade,'config/settings.json'),'utf8'),original);
assert.equal(await readFile(join(upgrade,'work/synthetic.txt'),'utf8'),'preserved work');
assert.deepEqual(await readFile(join(upgrade,'secrets/setup-test.dpapi')),secret);assert.deepEqual(await store.read('setup-test'),{synthetic:true});
assert.deepEqual(JSON.parse(await readFile(join(upgrade,'active.json'),'utf8')),{version,previous});
const result={root,version,previous,freshInstallWithoutInput:true,publicDefaults:true,usernameLoginVisible:true,browserExternalRequests:remote.length,existingSettingsBytePreserved:true,protectedStorePreserved:true,workPreserved:true,stopped:true,realAccountLogin:false};
await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
