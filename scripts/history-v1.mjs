import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runCommand,usage} from '../dist/apps/local-app/src/cli.js';
import {spawn} from 'node:child_process';
import {controlRequest} from '../dist/apps/local-app/src/control-client.js';
// The running local app owns OIDC rotation. CLI never races its refresh token.
const root=process.env.TRIAGE_LOCAL_HOME;
if(!root)throw new Error('TRIAGE_LOCAL_HOME required; start the local app and sign in first');
try{
  const store=new ProtectedStore(join(root,'secrets')),control=await store.read('cli-control');
  if(!Number.isInteger(control.port)||control.port<1024||control.port>65535||typeof control.token!=='string'||control.token.length<32)throw new Error('INVALID_LOCAL_CONTROL');
  const call=async(path,body)=>{
    const response=await controlRequest(control,'/api'+path,body);
    return response.headers.get('content-type')?.includes('application/json')?response.json():response.text();
  };
  if(process.argv[2]==='open'){
    const {url}=await call('/browser-ticket',{});
    if(new URL(url).origin!=='http://127.0.0.1:'+control.port||!/^\/auth\/bootstrap\?ticket=[A-Za-z0-9_-]{43}$/.test(new URL(url).pathname+new URL(url).search))throw new Error('INVALID_BOOTSTRAP');
    await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:TRIAGE_BROWSER_URL -WindowStyle Hidden'],{env:{...process.env,TRIAGE_BROWSER_URL:url},windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('BROWSER_OPEN_FAILED')));});
    process.stdout.write('분석실을 브라우저에서 열었습니다.\n');
  }else{
  const result=await runCommand(process.argv.slice(2),call,path=>readFile(path,'utf8'));
  process.stdout.write(typeof result==='string'?result+'\n':JSON.stringify(result)+'\n');
  }
}catch(error){const code=/^[A-Z_]{1,80}$/.test(error.message)?error.message:'LOCAL_COMMAND_FAILED';process.stderr.write(code+'\n사용법: open | '+usage+'\n');process.exitCode=1;}
