import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const exec=promisify(execFile);
const project='triage-recovery-'+randomUUID().slice(0,8),compose=['compose','-p',project,'-f','compose.recovery.yaml'];
if(!/^triage-recovery-[a-f0-9]{8}$/.test(project))throw new Error('Invalid isolated project');
async function docker(args){const r=await exec('docker',args,{maxBuffer:2_000_000});return r.stdout.trim();}
const run=(...args)=>docker([...compose,'run','--rm','-T','runner','node','scripts/recovery-fixture.mjs',...args]);
const holdNames=[];
try{
 await docker([...compose,'up','-d','--wait','db']);console.log(JSON.stringify({project,isolatedDbReady:true}));
 console.log(await run('seed'));
 await docker([...compose,'exec','-T','db','pg_dump','-U','triage','-Fc','-f','/tmp/fixture.dump','triage']);
 await docker([...compose,'exec','-T','db','createdb','-U','triage','restored']);
 await docker([...compose,'exec','-T','db','pg_restore','-U','triage','-d','restored','/tmp/fixture.dump']);
 console.log(await run('compare'));
 for(const mode of ['kill','restart']){
   const name=project+'-'+mode;holdNames.push(name);
   await docker([...compose,'run','-d','--name',name,'runner','node','scripts/recovery-fixture.mjs','hold',mode]);
   let ready=false;
   for(let i=0;i<20;i++){try{await run('ready',mode);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
   if(!ready)throw new Error('Fixture holder did not start');
   if(mode==='kill')await docker(['kill','--signal','KILL',name]);
   else{await docker([...compose,'restart','db']);await docker([...compose,'up','-d','--wait','db']);}
   console.log(await run('recover',mode));
 }
}finally{
 // Cleanup only objects labelled with this newly generated project; never use the production Compose file.
 for(const name of holdNames){
   try{const label=await docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',name]);
     if(label===project)await docker(['rm','-f',name]);}catch{}
 }
 await docker([...compose,'down']);
 const volumes=await docker(['volume','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}']);
 for(const volume of volumes.split(/\r?\n/).filter(Boolean)){
   if(!volume.startsWith(project+'_'))throw new Error('Refusing unrelated volume cleanup');
   const label=await docker(['volume','inspect','--format','{{index .Labels "com.docker.compose.project"}}',volume]);
   if(label!==project)throw new Error('Refusing unrelated volume cleanup');
   await docker(['volume','rm',volume]);
 }
 console.log(JSON.stringify({project,isolatedCleanup:true}));
}
