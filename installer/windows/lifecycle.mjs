import {readFile,access,unlink,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {verifyRelease} from './release.mjs';
import {portAvailable} from './diagnose.mjs';
const pause=()=>new Promise(r=>setTimeout(r,200));
async function activeRelease(home){const root=resolve(home),active=JSON.parse(await readFile(join(root,'active.json'),'utf8'));if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(active.version))throw new Error('INVALID_VERSION');const path=join(root,'releases',active.version);return {root,path,manifest:await verifyRelease(path)};}
async function control(release){const {ProtectedStore}=await import(pathToFileURL(join(release.path,'dist/apps/local-app/src/protected-store.js')).href);const value=await new ProtectedStore(join(release.root,'secrets')).read('cli-control');if(!Number.isInteger(value.port)||value.port<1024||value.port>65535||typeof value.token!=='string'||value.token.length<32)throw new Error('APP_NOT_RUNNING');return value;}
async function call(release,path){const value=await control(release),{controlRequest}=await import(pathToFileURL(join(release.path,'dist/apps/local-app/src/control-client.js')).href);return (await controlRequest(value,'/api/'+path,{})).json();}
export async function openApp(home){const release=await activeRelease(home),{url}=await call(release,'browser-ticket');if(!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}\/auth\/bootstrap\?ticket=[A-Za-z0-9_-]{43}$/.test(url))throw new Error('INVALID_BOOTSTRAP');await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:TRIAGE_BROWSER_URL -WindowStyle Hidden'],{windowsHide:true,env:{...process.env,TRIAGE_BROWSER_URL:url},stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('BROWSER_OPEN_FAILED')));});return {opened:true};}
export async function startApp(home,{allowCandidate=false,open=true}={}){
  const release=await activeRelease(home);if(!release.manifest.releaseApproved&&!allowCandidate)throw new Error('CANDIDATE_NOT_APPROVED');
  try{await access(join(release.root,'app.lock'));if(open)return openApp(home);return {alreadyRunning:true,...await call(release,'browser-ticket').then(()=>({connected:true}))};}catch(e){if(e.code!=='ENOENT')throw e;}
  const settings=JSON.parse(await readFile(join(release.root,'config/settings.json'),'utf8')),port=settings.localPort??3080;if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_PORT');if(!await portAvailable(port))throw new Error('PORT_IN_USE');
  const child=spawn(join(release.path,'node.exe'),['dist/apps/local-app/src/main.js'],{cwd:release.path,env:{...process.env,TRIAGE_LOCAL_HOME:release.root},windowsHide:true,detached:true,stdio:'ignore'});let failed=false;child.once('error',()=>{failed=true;});child.once('exit',()=>{failed=true;});child.unref();
  const deadline=Date.now()+30000;while(!failed&&Date.now()<deadline){try{await call(release,'browser-ticket');if(open)await openApp(home);return {started:true};}catch{await pause();}}
  throw new Error('APP_START_FAILED');
}
export async function stopApp(home){const release=await activeRelease(home);await call(release,'app-stop');const deadline=Date.now()+30000;while(Date.now()<deadline){try{await access(join(release.root,'app.lock'));}catch(e){if(e.code==='ENOENT')return {stopped:true};throw e;}await pause();}throw new Error('APP_STOP_TIMEOUT');}
export async function pauseApp(home){const release=await activeRelease(home);return call(release,'app-pause');}
export async function recoverLock(home){const release=await activeRelease(home),path=join(release.root,'app.lock'),text=await readFile(path,'utf8'),lock=JSON.parse(text);if(!Number.isSafeInteger(lock.pid)||lock.pid<1||typeof lock.nonce!=='string')throw new Error('INVALID_LOCK');try{process.kill(lock.pid,0);throw new Error('PROCESS_STILL_PRESENT');}catch(e){if(e.code!=='ESRCH')throw e;}if(await readFile(path,'utf8')!==text)throw new Error('LOCK_CHANGED');await unlink(path);return {recovered:true};}
export async function createShortcut(home,destination){
  const release=await activeRelease(home),target=resolve(destination);if(!target.toLowerCase().endsWith('.lnk'))throw new Error('SHORTCUT_EXTENSION_REQUIRED');
  try{await access(target);throw new Error('SHORTCUT_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
  const script=`$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:TRIAGE_SHORTCUT);$s.TargetPath=Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe';$s.Arguments='-NoProfile -File "'+(Join-Path $env:TRIAGE_ROOT 'launch.ps1')+'" -InstallRoot "'+$env:TRIAGE_ROOT+'"';$s.WindowStyle=7;$s.Save()`;
  await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,TRIAGE_ROOT:release.root,TRIAGE_SHORTCUT:target},stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('SHORTCUT_FAILED')));});return {created:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [action,home,target]=process.argv.slice(2);try{if(!home)throw new Error('HOME_REQUIRED');const result=action==='start'?await startApp(home,{allowCandidate:process.argv.includes('--candidate'),open:!process.argv.includes('--no-open')}):action==='open'?await openApp(home):action==='pause'?await pauseApp(home):action==='stop'?await stopApp(home):action==='recover-lock'?await recoverLock(home):action==='shortcut'&&target?await createShortcut(home,target):null;if(!result)throw new Error('INVALID_ACTION');console.log(JSON.stringify(result));}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'LOCAL_LIFECYCLE_FAILED');process.exitCode=1;}
}
