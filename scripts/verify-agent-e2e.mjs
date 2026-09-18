import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {HistoryClient} from '../packages/history-client/src/index.ts';
import {Runner} from '../packages/runner/src/runner.ts';
import {LocalExecutor} from '../apps/local-app/src/executor.ts';
import {ProtectedStore} from '../apps/local-app/src/protected-store.ts';
const exec=promisify(execFile),name='triage-agent-e2e-'+randomUUID().slice(0,8),token=randomBytes(32).toString('base64url'),workspace=resolve('.').replaceAll('\\','/');
const docker=async(args)=>(await exec('docker',args,{env:{...process.env,TRIAGE_FIXTURE_TOKEN:token},maxBuffer:1000000})).stdout.trim();
await mkdir('.runtime/agent-e2e',{recursive:true});const root=await mkdtemp(resolve('.runtime/agent-e2e/run-')),work=join(root,'work');await mkdir(work);
await writeFile(join(root,'fixture.json'),JSON.stringify({quantity:12,unitPrice:3}));
let started=false;const results=[];
try{
  const mounts=['src','apps','packages','scripts'].flatMap(dir=>['--volume',`${workspace}/${dir}:/app/${dir}:ro`]);
  await docker(['compose','--profile','verification','run','--no-deps','--rm','-d','--name',name,'--publish','127.0.0.1::4000','-e','NODE_ENV=test','-e','TRIAGE_FIXTURE_TOKEN',...mounts,'tests','node','--import','tsx','scripts/agent-e2e-api-fixture.mjs']);started=true;
  const port=(await docker(['port',name,'4000/tcp'])).split(':').pop(),base='http://127.0.0.1:'+port;
  const deadline=Date.now()+30000;for(;;){try{if((await fetch(base+'/health/live')).ok)break;}catch{}if(Date.now()>deadline)throw new Error('FIXTURE_START_FAILED');await new Promise(r=>setTimeout(r,200));}
  const history=new HistoryClient(base,async()=>token),source=await history.request('/sources',{instanceId:randomUUID(),displayName:'Synthetic source'});
  const profiles={codex:{agent:'codex',version:'0.154.0',command:{executable:process.execPath,prefix:['C:/Users/david/AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js']}},claude:{agent:'claude',version:'2.1.276',command:{executable:'C:/Users/david/.local/bin/claude.exe'}}};
  let mailId=0;
  for(const agent of ['codex','claude']){
    mailId++;const messageId='<synthetic-'+mailId+'@example.test>',device=await history.request('/runners',{requestId:randomUUID(),displayName:'Synthetic '+agent,agents:[agent],sourceIds:[source.id]});
    const run=await history.start({sourceId:source.id,mailId,messageId,subject:'Synthetic quantity verification',requestId:randomUUID(),runnerId:device.id,agent,executorKind:'local',verifiedAt:new Date().toISOString()});
    const selection=async()=>({sourceId:source.id,agent,original:{full:async()=>({id:mailId,messageId,subject:'Synthetic quantity verification',body:'Synthetic task: read fixture.json under root fixture. Calculate quantity times unitPrice. Explain the total and include the skill marker. No real mail or ERP data is involved.'})}});
    const executor=new LocalExecutor(work,profiles,selection,{fixture:{path:root,files:['fixture.json']}}),runner=new Runner(history,new ProtectedStore(work),executor,device.id,device.credential);const since=Date.now();await runner.tick(AbortSignal.timeout(240000));
    const saved=await history.get(run.id);assert.equal(saved.status,'completed');assert.ok(saved.result.report.includes('36'));assert.ok(saved.result.evidence.some(e=>e.reference==='fixture/fixture.json'&&e.verified));assert.ok(saved.progress.some(e=>e.kind==='mail_read'));
    results.push({agent,runId:run.id,ms:Date.now()-since,reportHash:saved.reportHash,progress:saved.progress.map(e=>e.kind),status:saved.status});
  }
  await writeFile(join(root,'result.json'),JSON.stringify({synthetic:true,results},null,2));console.log(JSON.stringify({ok:true,results}));
}finally{if(started)await docker(['stop','--time','30',name]);}
