import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const exec=promisify(execFile),project='triage-v1-restore-'+randomUUID().slice(0,8);
const compose=['compose','-p',project,'-f','compose.recovery.yaml'];
const root=resolve('.').replaceAll('\\','/'),directory=resolve('.runtime',project);await mkdir(directory,{recursive:true});
const sourceDump='/tmp/'+project+'.dump',backup=resolve(directory,'source.dump');
const started=Date.now();
async function docker(args){return (await exec('docker',args,{maxBuffer:4_000_000})).stdout.trim();}
const mounts=['src','apps','packages','scripts'].flatMap(dir=>['--volume',`${root}/${dir}:/app/${dir}:ro`]);
const run=(command,database='triage')=>docker([...compose,'run','--no-deps','--rm','-T',...mounts,'runner','node','--import','tsx','scripts/v1-restore-fixture.mjs',command,database]);
let evidence;
try{
  await docker(['compose','exec','-T','db','pg_dump','-U','triage','-Fc','-f',sourceDump,'triage']);
  await docker(['compose','cp','db:'+sourceDump,backup]);
  // This one specifically named temp dump is ours; never remove DB data paths.
  await docker(['compose','exec','-T','db','rm','--',sourceDump]);
  await docker([...compose,'up','-d','--wait','db']);
  await docker([...compose,'cp',backup,'db:/tmp/source.dump']);
  await docker([...compose,'exec','-T','db','pg_restore','--no-owner','--no-acl','-U','triage','-d','triage','/tmp/source.dump']);
  const before=JSON.parse(await run('snapshot'));await run('migrate');const after=JSON.parse(await run('snapshot'));assert.deepEqual(after,before);
  await docker([...compose,'exec','-T','db','pg_dump','-U','triage','-Fc','-f','/tmp/migrated.dump','triage']);
  await docker([...compose,'exec','-T','db','createdb','-U','triage','restored']);
  const restoreStarted=Date.now();await docker([...compose,'exec','-T','db','pg_restore','--no-owner','--no-acl','-U','triage','-d','restored','/tmp/migrated.dump']);
  const restored=JSON.parse(await run('snapshot','restored'));assert.deepEqual(restored,before);await run('migrate','restored');
  evidence={project,ok:true,ms:Date.now()-started,restoreMs:Date.now()-restoreStarted,backupSha256:createHash('sha256').update(await readFile(backup)).digest('hex'),tables:before};
  await writeFile(resolve(directory,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({ok:true,project,ms:evidence.ms,restoreMs:evidence.restoreMs,tables:Object.keys(before).length,counts:Object.fromEntries(Object.entries(before).map(([name,value])=>[name,value.count]))}));
}finally{
  await docker([...compose,'down']);
  const names=await docker(['volume','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}']);
  for(const name of names.split(/\r?\n/).filter(Boolean)){
    if(!/^triage-v1-restore-[a-f0-9]{8}$/.test(project)||!name.startsWith(project+'_'))throw new Error('Unsafe cleanup');
    const label=await docker(['volume','inspect','--format','{{index .Labels "com.docker.compose.project"}}',name]);if(label!==project)throw new Error('Wrong cleanup label');
    await docker(['volume','rm',name]);
  }
}
