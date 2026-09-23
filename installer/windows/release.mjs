import {readFile,readdir,lstat,realpath,mkdir,cp,writeFile,rename,rm,rmdir} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const versionPattern=/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/;
function inside(root,path){const rel=relative(resolve(root),resolve(path));if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('UNSAFE_RELEASE_PATH');return resolve(path);}
async function noLinks(path){if((await lstat(path)).isSymbolicLink())throw new Error('LINK_NOT_ALLOWED');}
async function files(root,sub=''){
  const result=[];
  for(const entry of await readdir(join(root,sub),{withFileTypes:true})){
    const path=sub?sub+'/'+entry.name:entry.name;if(entry.isSymbolicLink())throw new Error('LINK_NOT_ALLOWED');
    if(entry.isDirectory())result.push(...await files(root,path));else result.push(path);
  }return result.sort();
}
export async function verifyRelease(directory){
  const root=resolve(directory);await noLinks(root);
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
  if(!versionPattern.test(manifest.version)||manifest.contractVersion!=='1'||manifest.platform!=='win32-x64'||!manifest.files||Array.isArray(manifest.files))throw new Error('INVALID_MANIFEST');
  const expected=Object.keys(manifest.files).sort(),actual=(await files(root)).filter(p=>p!=='manifest.json');
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('FILE_SET_MISMATCH');
  for(const name of expected){
    if(name.includes('\\')||name.includes(':')||name.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('UNSAFE_MANIFEST_PATH');
    const path=inside(root,join(root,name));if(createHash('sha256').update(await readFile(path)).digest('hex')!==manifest.files[name])throw new Error('CHECKSUM_MISMATCH');
  }return manifest;
}
async function managedRoot(path){
  const root=resolve(path);await mkdir(root,{recursive:true});await noLinks(root);
  const resolved=await realpath(root);if(resolved.toLowerCase()!==root.toLowerCase())throw new Error('ROOT_ALIAS_NOT_ALLOWED');
  for(const sub of ['releases','staging','config','secrets','work','scratch','logs']){const p=join(root,sub);await mkdir(p,{recursive:true});await noLinks(p);}
  try{await lstat(join(root,'app.lock'));throw new Error('APP_RUNNING_OR_RECOVERY_LOCK');}catch(e){if(e.code!=='ENOENT')throw e;}
  return root;
}
async function activate(root,value){const temp=join(root,'active-'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(value),{flag:'wx'});await rename(temp,join(root,'active.json'));}
export async function installRelease(home,payload,{allowCandidate=false,diagnose=async()=>true,copy=cp}={}){
  const manifest=await verifyRelease(payload);if(!manifest.releaseApproved&&!allowCandidate)throw new Error('CANDIDATE_NOT_APPROVED');
  const root=await managedRoot(home),target=inside(join(root,'releases'),join(root,'releases',manifest.version)),stage=inside(join(root,'staging'),join(root,'staging',randomUUID()));
  const marker=join(root,'install.json');try{const value=JSON.parse(await readFile(marker,'utf8'));if(value.product!=='mail-triage-local'||value.root!==root)throw new Error('INSTALL_MARKER_MISMATCH');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(marker,JSON.stringify({product:'mail-triage-local',root}),{flag:'wx'});}
  let created=false;
  try{
    let exists=false;try{await lstat(target);exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(exists){const installed=await verifyRelease(target).catch(()=>{throw new Error('INCOMPLETE_RELEASE_REQUIRES_EXPLICIT_REMOVAL');});if(JSON.stringify(installed.files)!==JSON.stringify(manifest.files))throw new Error('RELEASE_CONTENT_CONFLICT');}
    else{
      await mkdir(stage);created=true;
      for(const name of await readdir(payload))await copy(join(payload,name),join(stage,name),{recursive:true,errorOnExist:true,force:false});
      await verifyRelease(stage);if(!await diagnose(stage))throw new Error('DIAGNOSTICS_FAILED');
      await rename(stage,target);created=false;
    }
    if(exists&&!await diagnose(target))throw new Error('DIAGNOSTICS_FAILED');
    let prior;try{prior=JSON.parse(await readFile(join(root,'active.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    try{await lstat(join(root,'app.lock'));throw new Error('APP_RUNNING_OR_RECOVERY_LOCK');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(manifest.files['installer/start.ps1'])await cp(join(target,'installer/start.ps1'),join(root,'launch.ps1'));
    if(manifest.files['installer/control.ps1'])await cp(join(target,'installer/control.ps1'),join(root,'control.ps1'));
    const previous=prior?.version===manifest.version?prior.previous:prior?.version??null;
    await activate(root,{version:manifest.version,previous});return {version:manifest.version,previous};
  }finally{
    // Only this invocation's exclusively-created stage, never an active release.
    if(created)try{await noLinks(stage);await files(stage);await rm(stage,{recursive:true});}catch{}
  }
}
export async function discardIncompleteRelease(home,version,confirmRoot){
  if(!versionPattern.test(version))throw new Error('INVALID_VERSION');const root=await managedRoot(home),marker=JSON.parse(await readFile(join(root,'install.json'),'utf8'));
  if(marker.product!=='mail-triage-local'||marker.root!==root||confirmRoot!==root)throw new Error('EXACT_ROOT_CONFIRMATION_REQUIRED');
  let active;try{active=JSON.parse(await readFile(join(root,'active.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(active?.version===version||active?.previous===version)throw new Error('RELEASE_IN_USE');
  const target=inside(join(root,'releases'),join(root,'releases',version));await noLinks(target);await files(target);
  let valid=true;try{await verifyRelease(target);}catch{valid=false;}if(valid)throw new Error('VALID_RELEASE_USE_REMOVE');
  await rm(target,{recursive:true});return {discarded:version};
}
export async function uninstallApplication(home,{purgePrivate=false,confirmRoot}={}){
  const root=await managedRoot(home),marker=JSON.parse(await readFile(join(root,'install.json'),'utf8'));
  if(marker.product!=='mail-triage-local'||marker.root!==root)throw new Error('INSTALL_MARKER_MISMATCH');
  if(purgePrivate&&confirmRoot!==root)throw new Error('EXACT_ROOT_CONFIRMATION_REQUIRED');
  const versions=await readdir(join(root,'releases'));
  const targets=[];for(const version of versions){if(!versionPattern.test(version))throw new Error('UNKNOWN_RELEASE_ENTRY');const target=inside(join(root,'releases'),join(root,'releases',version));await verifyRelease(target);targets.push(target);}
  const known=new Set(['releases','staging','config','secrets','work','scratch','logs','active.json','install.json','launch.ps1','control.ps1']);
  if(purgePrivate){for(const name of await readdir(root))if(!known.has(name))throw new Error('UNKNOWN_INSTALL_ENTRY');for(const sub of ['staging','config','secrets','work','scratch','logs'])await files(inside(root,join(root,sub)));}
  for(const name of ['active.json','launch.ps1','control.ps1'])try{await noLinks(join(root,name));}catch(e){if(e.code!=='ENOENT')throw e;}
  // Every recursive target was resolved under the marked install root and inspected above.
  for(const target of targets)await rm(target,{recursive:true});
  for(const name of ['active.json','launch.ps1','control.ps1'])await rm(inside(root,join(root,name)),{force:true});
  if(purgePrivate){for(const sub of ['staging','config','secrets','work','scratch','logs'])await rm(inside(root,join(root,sub)),{recursive:true});await rm(join(root,'install.json'));await rmdir(join(root,'releases'));await rmdir(root);}
  return {uninstalled:true,privateStatePreserved:!purgePrivate,shortcuts:'Remove any shortcut you created from its chosen location.'};
}
export async function rollback(home){
  const root=await managedRoot(home),active=JSON.parse(await readFile(join(root,'active.json'),'utf8'));
  if(!versionPattern.test(active.previous))throw new Error('NO_PREVIOUS_RELEASE');
  await verifyRelease(inside(join(root,'releases'),join(root,'releases',active.previous)));
  await activate(root,{version:active.previous,previous:active.version});return {version:active.previous};
}
export async function uninstallRelease(home,version){
  if(!versionPattern.test(version))throw new Error('INVALID_VERSION');const root=await managedRoot(home);
  const active=JSON.parse(await readFile(join(root,'active.json'),'utf8'));
  if(active.version===version||active.previous===version)throw new Error('RELEASE_IN_USE');
  const target=inside(join(root,'releases'),join(root,'releases',version));await verifyRelease(target);
  // Only an exact verified inactive release, never config/secrets/work or CLI directories.
  await rm(target,{recursive:true});
}
