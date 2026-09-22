import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installRelease,rollback,verifyRelease,uninstallApplication,discardIncompleteRelease} from '../installer/windows/release.mjs';
test('versioned install/update/rollback preserve private state and failed updates never activate',async()=>{
  const root=await mkdtemp(join(tmpdir(),'triage-install-')),home=join(root,'한글 사용자');
  async function payload(version:string){const path=join(root,version);await mkdir(path);const body='synthetic '+version;await writeFile(join(path,'app.txt'),body);await writeFile(join(path,'manifest.json'),JSON.stringify({version,contractVersion:'1',platform:'win32-x64',releaseApproved:false,files:{'app.txt':createHash('sha256').update(body).digest('hex')}}));return path;}
  const first=await payload('1.0.0-candidate.1');
  await assert.rejects(installRelease(home,first),/CANDIDATE_NOT_APPROVED/);
  await installRelease(home,first,{allowCandidate:true});
  for(const dir of ['config','secrets','work'])await writeFile(join(home,dir,'preserve.txt'),'synthetic-private-'+dir);
  await installRelease(home,await payload('1.0.0-candidate.2'),{allowCandidate:true});
  assert.equal((await rollback(home)).version,'1.0.0-candidate.1');
  await assert.rejects(installRelease(home,await payload('1.0.0-candidate.3'),{allowCandidate:true,diagnose:async()=>false}),/DIAGNOSTICS_FAILED/);
  assert.equal(JSON.parse(await readFile(join(home,'active.json'),'utf8')).version,'1.0.0-candidate.1');
  for(const dir of ['config','secrets','work'])assert.equal(await readFile(join(home,dir,'preserve.txt'),'utf8'),'synthetic-private-'+dir);
  await writeFile(join(first,'app.txt'),'tampered');await assert.rejects(verifyRelease(first),/CHECKSUM_MISMATCH/);
  await writeFile(join(home,'app.lock'),'synthetic stale or running lock');await assert.rejects(rollback(home),/APP_RUNNING_OR_RECOVERY_LOCK/);
});
test('interrupted copy remains outside releases and retry can install the same version',async()=>{
  const {rm,access,readdir,cp}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'triage-stage-')),home=join(root,'owned'),payload=join(root,'payload');await mkdir(payload);
  await writeFile(join(payload,'app.txt'),'synthetic');await writeFile(join(payload,'manifest.json'),JSON.stringify({version:'1.0.0',contractVersion:'1',platform:'win32-x64',releaseApproved:true,files:{'app.txt':createHash('sha256').update('synthetic').digest('hex')}}));
  try{
    await assert.rejects(installRelease(home,payload,{copy:async(from:string,to:string,opts:any)=>{await cp(from,to,opts);throw new Error('interrupted copy');}}),/interrupted copy/);
    assert.deepEqual(await readdir(join(home,'releases')),[]);assert.deepEqual(await readdir(join(home,'staging')),[]);await assert.rejects(access(join(home,'active.json')));
    // A stage left by a hard process exit does not own the release version name.
    await mkdir(join(home,'staging','synthetic-orphan'));await writeFile(join(home,'staging','synthetic-orphan','partial.txt'),'incomplete');
    await installRelease(home,payload);await installRelease(home,payload);assert.equal(JSON.parse(await readFile(join(home,'active.json'),'utf8')).previous,null);
    await mkdir(join(home,'releases','2.0.0'));await writeFile(join(home,'releases','2.0.0','partial.txt'),'old incomplete format');
    await assert.rejects(discardIncompleteRelease(home,'2.0.0',root),/EXACT_ROOT/);await discardIncompleteRelease(home,'2.0.0',home);await assert.rejects(access(join(home,'releases','2.0.0')));
    await uninstallApplication(home,{purgePrivate:true,confirmRoot:home});
  }finally{await rm(root,{recursive:true,force:true});}
});
test('application removal preserves personal state unless exact purge scope is confirmed',async()=>{
  const {rm,access}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'triage-remove-')),home=join(root,'owned'),payload=join(root,'payload');await mkdir(payload);
  await writeFile(join(payload,'app.txt'),'synthetic');await writeFile(join(payload,'manifest.json'),JSON.stringify({version:'1.0.0',contractVersion:'1',platform:'win32-x64',releaseApproved:true,files:{'app.txt':createHash('sha256').update('synthetic').digest('hex')}}));
  try{
    await installRelease(home,payload);await writeFile(join(home,'secrets','preserve.txt'),'private-fixture');
    await assert.rejects(uninstallApplication(home,{purgePrivate:true,confirmRoot:root}),/EXACT_ROOT/);await access(join(home,'active.json'));
    assert.equal((await uninstallApplication(home)).privateStatePreserved,true);assert.equal(await readFile(join(home,'secrets','preserve.txt'),'utf8'),'private-fixture');
    await installRelease(home,payload);await uninstallApplication(home,{purgePrivate:true,confirmRoot:home});await assert.rejects(access(home));
  }finally{await rm(root,{recursive:true,force:true});}
});
