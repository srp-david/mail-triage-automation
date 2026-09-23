import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {client,sha256,safeFile,namespaceFor,options} from './admin-client.mjs';

export async function preview(root){
  root=await realpath(root);const files=[];
  async function walk(relative){
    const dir=path.join(root,relative);
    if((await lstat(dir)).isSymbolicLink())throw new Error('보고서 디렉터리에 링크가 있습니다.');
    for(const entry of await readdir(dir,{withFileTypes:true})){
      const next=relative+'/'+entry.name;
      if(entry.isSymbolicLink())throw new Error('보고서 경로에 링크가 있습니다.');
      if(entry.isDirectory())await walk(next);else if(entry.isFile()&&entry.name.endsWith('.md'))files.push(next);
    }
  }
  for(const project of ['gg','gg-fac','d-code']){
    try{await walk('erp/'+project+'/reports');}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  try{await safeFile(root,'.claude/mail/triage-log.md');files.push('.claude/mail/triage-log.md');}catch(error){if(error.code!=='ENOENT')throw error;}
  const documents=[];
  for(const relative of files.sort()){
    const bytes=await readFile(await safeFile(root,relative));
    if(bytes.length>1_000_000)throw new Error('1 MB를 넘는 이력은 별도로 검토하세요: '+relative);
    const body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    if(!body.trim())continue;
    documents.push({path:relative,hash:sha256(bytes),bytes:bytes.length,kind:relative.endsWith('/triage-log.md')?'log':'report'});
  }
  return {version:1,root,namespace:await namespaceFor(root),createdAt:new Date().toISOString(),documents};
}
async function main(){
  const [command,...args]=process.argv.slice(2),o=options(args);
  if(command==='preview'){
    if(!o.root||!o.out)throw new Error('preview --root <erp-manager> --out <새 manifest.json>');
    const manifest=await preview(o.root);await writeFile(o.out,JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({manifest:path.resolve(o.out),documents:manifest.documents.length,reports:manifest.documents.filter(x=>x.kind==='report').length,logs:manifest.documents.filter(x=>x.kind==='log').length}));
  }else if(command==='import'){
    if(!o.manifest)throw new Error('import --manifest <검토한 manifest.json>');
    const manifest=JSON.parse(await readFile(o.manifest,'utf8'));
    if(manifest.version!==1||manifest.namespace!==await namespaceFor(manifest.root))throw new Error('manifest 루트/버전을 확인하세요.');
    // Re-read every source before the first API mutation; a changed source requires a fresh preview.
    const documents=[];
    for(const item of manifest.documents){
      if(!(item.path==='.claude/mail/triage-log.md'||/^erp\/(gg|gg-fac|d-code)\/reports\/.+\.md$/.test(item.path)))throw new Error('이관 범위를 벗어난 파일입니다.');
      const bytes=await readFile(await safeFile(manifest.root,item.path));
      if(bytes.length>1_000_000||sha256(bytes)!==item.hash)throw new Error('preview 이후 원본이 변경되었습니다: '+item.path);
      documents.push({...item,namespace:manifest.namespace,body:new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)});
    }
    const {api}=await client();await api('/status');let imported=0,existing=0;const receipts=[];
    for(const document of documents){
      const result=await api('/legacy',document);
      const saved=await api('/legacy/'+result.id);
      if(saved.source_hash!==document.hash||sha256(saved.body)!==document.hash)throw new Error('저장 후 원본 대조 실패');
      result.imported?imported++:existing++;receipts.push({id:result.id,path:document.path,hash:document.hash});
    }
    // No identities are inferred from Message-ID, subject, or date. Unverified documents stay legacy.
    const receipt={namespace:manifest.namespace,imported,existing,verified:receipts.length,documents:receipts};
    if(o.out)await writeFile(o.out,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({imported,existing,verified:receipts.length,linked:0}));
  }else if(command==='link'){
    if(!o.file)throw new Error('link --file <검토한 연결 JSON>');
    const {id,...proof}=JSON.parse(await readFile(o.file,'utf8'));const {api}=await client();
    console.log(JSON.stringify(await api('/legacy/'+id+'/link',proof)));
  }else console.log('legacy-history: preview --root ROOT --out MANIFEST | import --manifest MANIFEST [--out RECEIPT] | link --file PROOF');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
