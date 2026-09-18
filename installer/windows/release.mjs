import {readFile,readdir,lstat,realpath,mkdir,cp,writeFile,rename,rm} from 'node:fs/promises';
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
  for(const sub of ['releases','config','secrets','work','logs']){const p=join(root,sub);await mkdir(p,{recursive:true});await noLinks(p);}
  try{await lstat(join(root,'app.lock'));throw new Error('APP_RUNNING_OR_RECOVERY_LOCK');}catch(e){if(e.code!=='ENOENT')throw e;}
  return root;
}
async function activate(root,value){const temp=join(root,'active-'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(value),{flag:'wx'});await rename(temp,join(root,'active.json'));}
export async function installRelease(home,payload,{allowCandidate=false,diagnose=async()=>true}={}){
  const manifest=await verifyRelease(payload);if(!manifest.releaseApproved&&!allowCandidate)throw new Error('CANDIDATE_NOT_APPROVED');
  const root=await managedRoot(home),target=inside(join(root,'releases'),join(root,'releases',manifest.version));
  await mkdir(target);
  for(const name of await readdir(payload))await cp(join(payload,name),join(target,name),{recursive:true,errorOnExist:true,force:false});
  await verifyRelease(target);
  if(!await diagnose(target))throw new Error('DIAGNOSTICS_FAILED');
  let prior;try{prior=JSON.parse(await readFile(join(root,'active.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  await activate(root,{version:manifest.version,previous:prior?.version??null});return {version:manifest.version,previous:prior?.version??null};
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
