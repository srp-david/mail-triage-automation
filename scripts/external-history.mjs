import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {client,options,uuid,sha256} from './admin-client.mjs';
const [command,...args]=process.argv.slice(2);
try{
 const o=options(args),{api}=await client();await api('/status');
 const pending=path.resolve(o.pending??'.runtime/external-history');await mkdir(pending,{recursive:true});
 if(command==='register'){
   if(!o.file||!o.source)throw new Error('register --file <Outlook 식별 메타데이터.json> --source <보존 원본 파일>');
   const input=JSON.parse(await readFile(o.file,'utf8'));input.sourceHash=sha256(await readFile(o.source));
   console.log(JSON.stringify(await api('/external-mails',input)));
 }else if(command==='begin'){
   const id=uuid(o.mail),admissionPath=path.join(pending,'admission-'+id+'.json');let admission;
   try{admission=JSON.parse(await readFile(admissionPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(admission?.registered)admission=null;
   admission??={requestId:randomUUID(),...(o.parent?{parentId:uuid(o.parent)}:{}),...(o['answer-file']?{answer:await readFile(o['answer-file'],'utf8')}:{})};
   await writeFile(admissionPath,JSON.stringify(admission),{mode:0o600});
   const run=await api('/external-mails/'+id+'/runs',admission);
   const receipt=path.join(pending,run.id+'.json');await writeFile(receipt,JSON.stringify(run),{mode:0o600});
   await writeFile(admissionPath,JSON.stringify({...admission,registered:true}),{mode:0o600});
   console.log(JSON.stringify({id:run.id,status:run.status,receipt}));
 }else if(command==='complete'||command==='heartbeat'||command==='keepalive'){
   const id=uuid(o.run),receipt=JSON.parse(await readFile(path.join(pending,id+'.json'),'utf8'));
   if(command==='complete'){
     const body=await readFile(o.file,'utf8'),result=JSON.parse(body);
     // Persist before contacting the API. Failed sends remain available for explicit retry.
     await writeFile(path.join(pending,id+'.result.json'),body,{mode:0o600});
     console.log(JSON.stringify(await api('/runs/'+id+'/result',{ownerToken:receipt.ownerToken,result})));
   }else for(;;){
     const run=await api('/runs/'+id);if(run.status!=='running'){console.log(JSON.stringify({id,status:run.status}));break;}
     await api('/runs/'+id+'/heartbeat',{ownerToken:receipt.ownerToken});
     if(command==='heartbeat'){console.log(JSON.stringify({ok:true}));break;}
     await new Promise(resolve=>setTimeout(resolve,30000));
   }
 }else throw new Error('external-history: register --file META --source ORIGINAL | begin --mail UUID | heartbeat|keepalive --run UUID | complete --run UUID --file RESULT');
}catch(error){console.error(error.message);process.exitCode=1;}
