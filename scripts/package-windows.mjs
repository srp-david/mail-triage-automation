import {cp,mkdir,readFile,writeFile,readdir,lstat,rm} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),version=process.argv[2]??'0.2.0-candidate.1';
if(process.platform!=='win32'||process.arch!=='x64'||process.version!=='v24.16.0')throw new Error('Build requires pinned Windows x64 Node v24.16.0');
if(!/^\d+\.\d+\.\d+-candidate\.\d+$/.test(version))throw new Error('Candidate version required');
const checksums=await fetch('https://nodejs.org/dist/v24.16.0/SHASUMS256.txt');if(!checksums.ok)throw new Error('Node checksum fetch failed');
const expected=(await checksums.text()).split('\n').find(line=>line.trim().endsWith('win-x64/node.exe'))?.split(/\s+/)[0];
if(!expected||createHash('sha256').update(await readFile(process.execPath)).digest('hex')!==expected)throw new Error('Node runtime checksum mismatch');
const license=await fetch('https://raw.githubusercontent.com/nodejs/node/v24.16.0/LICENSE');if(!license.ok)throw new Error('Node license fetch failed');
const target=resolve('.runtime/packages',version);await mkdir(dirname(target),{recursive:true});await mkdir(target,{recursive:false});
for(const sub of ['apps/local-app','packages/contracts','packages/history-client','packages/runner','packages/agent-adapters','packages/skills','packages/ui'])await cp('dist/'+sub,join(target,'dist',sub),{recursive:true});
await cp('public',join(target,'public'),{recursive:true});
await cp('installer/windows',join(target,'installer'),{recursive:true});
await rm(join(target,'installer/setup.cs'));
await mkdir(join(target,'scripts'));await cp('scripts/history-v1.mjs',join(target,'scripts/history-v1.mjs'));
await cp(process.execPath,join(target,'node.exe'));
await writeFile(join(target,'NODE-LICENSE'),await license.text());
const deps={};for(const name of ['express','jose','zod','@modelcontextprotocol/sdk'])deps[name]=JSON.parse(await readFile('node_modules/'+name+'/package.json','utf8')).version;
await writeFile(join(target,'package.json'),JSON.stringify({name:'mail-triage-local',version,private:true,type:'module',dependencies:deps},null,2));
const npm=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
await exec(process.execPath,[npm,'install','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:target,maxBuffer:1000000});
const hashes={};
async function scan(sub=''){
  for(const entry of await readdir(join(target,sub),{withFileTypes:true})){
    const name=sub?sub+'/'+entry.name:entry.name;if(entry.isSymbolicLink())throw new Error('Package links not allowed');
    if(entry.isDirectory())await scan(name);else hashes[name]=createHash('sha256').update(await readFile(join(target,name))).digest('hex');
  }
}
await scan();
if(Object.keys(hashes).some(x=>/^(config|secrets|work|logs)\/|(^|\/)\.env|(^|\/)pg\/|history-api/.test(x)))throw new Error('Forbidden package content');
await writeFile(join(target,'manifest.json'),JSON.stringify({version,contractVersion:'1',platform:'win32-x64',nodeVersion:process.version,authentication:'username',releaseApproved:false,files:hashes},null,2));
const zip=target+'.zip';
await exec('python',['-X','utf8','scripts/zip-candidate.py',target,zip]);
await writeFile(zip+'.sha256',createHash('sha256').update(await readFile(zip)).digest('hex')+'\n');
console.log(JSON.stringify({version,files:Object.keys(hashes).length,zip,releaseApproved:false}));
