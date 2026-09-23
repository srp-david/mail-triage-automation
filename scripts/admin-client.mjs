import {readFile,realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const uuid=value=>{if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value??''))throw new Error('UUID가 필요합니다.');return value;};
export async function client(){
  let config;
  if(process.env.TRIAGE_CONFIG)config=JSON.parse(await readFile(process.env.TRIAGE_CONFIG,'utf8'));
  else if(process.env.TRIAGE_API_URL&&process.env.TRIAGE_TOKEN){
    config={url:process.env.TRIAGE_API_URL,token:process.env.TRIAGE_TOKEN,storeId:process.env.MAIL_STORE_ID??'local-mail-v1'};
  }else{
    const env=Object.fromEntries((await readFile(new URL('../.env',import.meta.url),'utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
    config={url:'http://localhost:'+(env.TRIAGE_PORT??3080),token:env.TRIAGE_TOKEN,storeId:env.MAIL_STORE_ID??'local-mail-v1'};
  }
  const base=new URL(config.url);
  if(!['http:','https:'].includes(base.protocol)||!config.token)throw new Error('공용 API 설정을 확인하세요.');
  async function api(endpoint,body){
    const response=await fetch(new URL('/api'+endpoint,base),{method:body===undefined?'GET':'POST',
      headers:{Authorization:'Bearer '+config.token,...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('공용 API '+response.status+': '+(await response.text()).slice(0,500));
    return response.json();
  }
  return {api,storeId:config.storeId};
}
export async function safeFile(root,relative){
  if(typeof relative!=='string'||relative.includes('\\')||relative.includes(':')||relative.startsWith('/')||relative.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('안전한 상대 경로가 필요합니다.');
  const realRoot=await realpath(root);let current=realRoot;
  for(const part of relative.split('/')){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw new Error('링크 경로는 사용할 수 없습니다.');}
  const resolved=await realpath(current),rel=path.relative(realRoot,resolved);
  if(rel.startsWith('..')||path.isAbsolute(rel)||!(await lstat(resolved)).isFile())throw new Error('허용 루트 밖의 파일입니다.');
  return resolved;
}
export async function namespaceFor(root){const resolved=await realpath(root);return 'manager:'+sha256(process.platform==='win32'?resolved.toLowerCase():resolved).slice(0,24);}
export function options(args){const result={};for(let i=0;i<args.length;i++){if(!args[i].startsWith('--'))throw new Error('옵션 형식 오류');const key=args[i].slice(2);result[key]=args[i+1]&&!args[i+1].startsWith('--')?args[++i]:true;}return result;}
