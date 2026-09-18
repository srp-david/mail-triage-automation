import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'triage-dpapi-한글 경로-')),store=new ProtectedStore(root),exec=promisify(execFile);
try{
  for(let n=0;n<3;n++){await store.write('repeat',{synthetic:'private-fixture',n});assert.deepEqual(await store.read('repeat'),{synthetic:'private-fixture',n});}
  assert.equal((await readFile(join(root,'repeat.dpapi'))).includes(Buffer.from('private-fixture')),false);
  const code="$a=[IO.Directory]::GetAccessControl($env:TRIAGE_CHECK_ROOT,[Security.AccessControl.AccessControlSections]::Access);if(-not $a.AreAccessRulesProtected){exit 1};$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid){exit 2}}";
  await exec('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{env:{...process.env,TRIAGE_CHECK_ROOT:root},windowsHide:true,timeout:10000});
  console.log(JSON.stringify({nonAsciiPath:true,repeatedDpapiWrites:3,plaintextAbsent:true,currentUserOnlyDacl:true}));
}finally{const rel=relative(tmpdir(),root);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('UNSAFE_CLEANUP');await rm(root,{recursive:true,force:true});}
