import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {runCommand} from '../dist/apps/local-app/src/cli.js';
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
  const result=await runCommand(process.argv.slice(2),call,path=>readFile(path,'utf8'));
  process.stdout.write(typeof result==='string'?result+'\n':JSON.stringify(result)+'\n');
}catch{process.stderr.write('로컬 명령을 처리하지 못했습니다. 앱 실행·로그인·설정과 명령 인수를 확인하세요.\n');process.exitCode=1;}
