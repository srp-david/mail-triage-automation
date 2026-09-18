import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runCommand} from '../dist/apps/local-app/src/cli.js';
import {spawn} from 'node:child_process';
// The running local app owns OIDC rotation. CLI never races its refresh token.
const root=process.env.TRIAGE_LOCAL_HOME;
if(!root)throw new Error('TRIAGE_LOCAL_HOME required; start the local app and sign in first');
try{
  const store=new ProtectedStore(join(root,'secrets')),control=await store.read('cli-control');
  if(control.port!==3080||typeof control.token!=='string'||control.token.length<32)throw new Error('INVALID_LOCAL_CONTROL');
  const call=async(path,body)=>{
    const response=await fetch('http://127.0.0.1:3080/api'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+control.token,'x-local-client':'1','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.code??'LOCAL_REQUEST_FAILED');}
    return response.headers.get('content-type')?.includes('application/json')?response.json():response.text();
  };
  if(process.argv[2]==='open'){
    const {url}=await call('/browser-ticket',{});
    if(!/^http:\/\/127\.0\.0\.1:3080\/auth\/bootstrap\?ticket=[A-Za-z0-9_-]{43}$/.test(url))throw new Error('INVALID_BOOTSTRAP');
    await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:TRIAGE_BROWSER_URL -WindowStyle Hidden'],{env:{...process.env,TRIAGE_BROWSER_URL:url},windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('BROWSER_OPEN_FAILED')));});
    process.stdout.write('분석실을 브라우저에서 열었습니다.\n');
  }else{
  const result=await runCommand(process.argv.slice(2),call,path=>readFile(path,'utf8'));
  process.stdout.write(typeof result==='string'?result+'\n':JSON.stringify(result)+'\n');
  }
}catch{process.stderr.write('로컬 명령을 처리하지 못했습니다. 앱 실행·로그인·설정과 명령 인수를 확인하세요.\n');process.exitCode=1;}
