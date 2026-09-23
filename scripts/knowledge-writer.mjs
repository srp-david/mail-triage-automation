import {readFile,writeFile,open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {client,sha256,safeFile,namespaceFor,uuid,options} from './admin-client.mjs';

export const additionFor=(runId,reportHash,knowledge)=>`\n\n<!-- triage-knowledge:${runId}:${reportHash} -->\n${knowledge.trim()}\n`;
export async function applyProposal(api,root,id){
  const proposal=await api('/knowledge/'+uuid(id));
  if(proposal.namespace!==await namespaceFor(root)||!/^erp\/(gg|gg-fac|d-code)\/docs\/.+\.md$/.test(proposal.target_path))throw new Error('대상 문서 루트가 다릅니다.');
  const destination=await safeFile(root,proposal.target_path);
  // OS-level lock complements the API's unique applying writer. Never remove a lock owned by another process.
  const lockPath=destination+'.triage-lock';const lock=await open(lockPath,'wx',0o600);
  let temporary;
  try{
    const before=await readFile(destination);const currentHash=sha256(before);
    if(currentHash!==proposal.base_hash&&currentHash!==proposal.next_hash)throw new Error('지식 문서가 변경되었습니다. 새 원본으로 제안을 다시 준비하세요.');
    const run=await api('/runs/'+proposal.run_id);
    if(run.reportHash!==proposal.report_hash)throw new Error('보고서 버전이 변경되었습니다.');
    const candidate=Buffer.concat([before,Buffer.from(proposal.addition)]);
    if(currentHash===proposal.base_hash&&before.toString('utf8').includes(`<!-- triage-knowledge:${proposal.run_id}:${proposal.report_hash} -->`))throw new Error('이 보고서의 지식은 이미 문서에 반영되어 있습니다.');
    if(currentHash===proposal.base_hash&&sha256(candidate)!==proposal.next_hash)throw new Error('반영할 문서 해시가 제안과 다릅니다.');
    const claim=await api('/knowledge/'+id+'/claim',{});
    if(claim.status==='applied'){
      if(currentHash!==proposal.next_hash)throw new Error('완료 기록과 현재 문서가 다릅니다.');
      return {id,status:'applied',unchanged:true};
    }
    if(currentHash===proposal.base_hash){
      temporary=path.join(path.dirname(destination),'.triage-'+randomUUID()+'.tmp');
      await writeFile(temporary,candidate,{flag:'wx',mode:0o600});
      if(await safeFile(root,proposal.target_path)!==destination||sha256(await readFile(destination))!==proposal.base_hash)throw new Error('반영 직전 원본이 변경되었습니다.');
      await rename(temporary,destination);temporary=undefined;
    }
    return await api('/knowledge/'+id+'/complete',{ownerToken:claim.ownerToken,hash:sha256(await readFile(destination))});
  }finally{if(temporary)await unlink(temporary).catch(()=>{});await lock.close();await unlink(lockPath);}
}
async function main(){
  const [command,...args]=process.argv.slice(2),o=options(args);const {api}=await client();
  if(command==='prepare'){
    if(!o.root||!o.run||!o.target)throw new Error('prepare --root ROOT --run RUN_ID --target erp/PROJECT/docs/FILE.md');
    if(!/^erp\/(gg|gg-fac|d-code)\/docs\/.+\.md$/.test(o.target))throw new Error('업무 지식 docs Markdown만 반영할 수 있습니다.');
    const run=await api('/runs/'+uuid(o.run));if(!run.result?.knowledge?.trim())throw new Error('저장된 지식 제안이 없습니다.');
    const base=await readFile(await safeFile(o.root,o.target));
    if(base.toString('utf8').includes(`<!-- triage-knowledge:${run.id}:${run.reportHash} -->`))throw new Error('이 보고서의 지식은 이미 문서에 반영되어 있습니다.');
    const addition=additionFor(run.id,run.reportHash,run.result.knowledge);
    const proposal=await api('/knowledge',{runId:run.id,namespace:await namespaceFor(o.root),target:o.target,
      baseHash:sha256(base),reportHash:run.reportHash,nextHash:sha256(Buffer.concat([base,Buffer.from(addition)]))});
    console.log(JSON.stringify({id:proposal.id,status:proposal.status,target:proposal.target_path,baseHash:proposal.base_hash,nextHash:proposal.next_hash,addition:proposal.addition},null,2));
  }else if(command==='apply'){
    if(!o.root||!o.proposal)throw new Error('apply --root ROOT --proposal PROPOSAL_ID');
    console.log(JSON.stringify(await applyProposal(api,o.root,o.proposal)));
  }else throw new Error('knowledge-writer: prepare --root ROOT --run RUN_ID --target PATH | apply --root ROOT --proposal ID');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
