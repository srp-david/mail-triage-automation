import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {client,sha256,options,uuid} from './admin-client.mjs';
import {resultSchema} from '../dist/schema.js';

const [command,...args]=process.argv.slice(2);
try{
 const o=options(args);if(!o.directory)throw new Error('preview|recover --directory <Worker 결과 폴더> [--revalidated]');
 const directory=path.resolve(o.directory);
 const receipt=JSON.parse(await readFile(path.join(directory,'recovery.json'),'utf8'));
 const result=resultSchema.parse(JSON.parse(await readFile(path.join(directory,'result.json'),'utf8')));
 const calls=JSON.parse(await readFile(path.join(directory,'tool-calls.json'),'utf8'));
 if(receipt.version!==1||sha256(JSON.stringify(result))!==receipt.resultHash)throw new Error('Worker 결과 버전/해시를 확인하세요.');
 const {api}=await client(),run=await api('/runs/'+uuid(receipt.runId));
 if(!calls.some(c=>c.server==='mail'&&c.tool==='get_email'&&c.status==='completed'&&!c.isError&&Number(c.emailId)===Number(run.mail_id)))throw new Error('대상 메일 조회 증거가 없습니다.');
 if(command==='preview')console.log(JSON.stringify({runId:run.id,status:run.status,resultHash:receipt.resultHash,localState:receipt.state,canRetrySameRun:['running','completed','needs_input'].includes(run.status),requiresEvidenceRevalidation:true}));
 else if(command==='recover'){
   if(o.revalidated!==true)throw new Error('근거를 다시 확인한 후 --revalidated를 명시하세요.');
   const saved=await api('/runs/'+run.id+'/recover-result',{ownerToken:receipt.ownerToken,requestId:uuid(receipt.requestId),revalidated:true,result});
   const temporary=path.join(directory,'recovery.next.json');
   await writeFile(temporary,JSON.stringify({...receipt,state:'registered',registeredRunId:saved.id},null,2),{mode:0o600});
   await rename(temporary,path.join(directory,'recovery.json'));
   console.log(JSON.stringify(saved));
 }else throw new Error('preview 또는 recover를 사용하세요.');
}catch(error){console.error(error.message);process.exitCode=1;}
