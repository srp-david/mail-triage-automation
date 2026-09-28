import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {discoverAgentCommands} from '../apps/local-app/src/discover-connections.js';

async function file(path:string,text=''){await mkdir(dirname(path),{recursive:true});await writeFile(path,text);return path;}
test('standalone Codex on PATH wins over an earlier npm installation; Claude stays native',async()=>{
  const home=await mkdtemp(join(tmpdir(),'triage-native-'));
  try{
    const npm=join(home,'npm'),bin=join(home,'bin');
    await file(join(npm,'node_modules/@openai/codex/bin/codex.js'));
    await file(join(npm,'node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/bin/codex.exe'));
    const codex=await file(join(bin,'codex.exe')),claude=await file(join(home,'.local/bin/claude.exe'));
    assert.deepEqual(await discoverAgentCommands(home,{paths:[npm,bin],platform:'win32',arch:'x64'}),{codex:{executable:codex},claude:{executable:claude}});
  }finally{await rm(home,{recursive:true,force:true});}
});
test('npm Codex discovery resolves nested and hoisted native packages for the current architecture',async()=>{
  const home=await mkdtemp(join(tmpdir(),'triage-npm-native-'));
  try{
    for(const [arch,target,layout] of [['x64','x86_64','nested'],['arm64','aarch64','hoisted']]){
      const npm=join(home,arch),root=join(npm,'node_modules/@openai/codex');await file(join(root,'bin/codex.js'),'throw new Error("MUST_NOT_EXECUTE")');
      const platformRoot=join(layout==='nested'?root:npm,'node_modules/@openai/codex-win32-'+arch);
      await file(join(platformRoot,'package.json'),JSON.stringify({name:'@openai/codex-win32-'+arch}));
      const executable=await file(join(platformRoot,'vendor',target+'-pc-windows-msvc/bin/codex.exe'));
      assert.deepEqual((await discoverAgentCommands(home,{paths:[npm],platform:'win32',arch})).codex,{executable});
    }
  }finally{await rm(home,{recursive:true,force:true});}
});
test('old vendor layout works; missing native binaries never fall back to the app Node or ps1 shim',async()=>{
  const home=await mkdtemp(join(tmpdir(),'triage-old-native-'));
  try{
    const npm=join(home,'npm');await file(join(npm,'codex.ps1'));await file(join(npm,'node_modules/@openai/codex/bin/codex.js'));
    assert.equal((await discoverAgentCommands(home,{paths:[npm],platform:'win32',arch:'x64'})).codex,undefined);
    const executable=await file(join(npm,'node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/codex/codex.exe'));
    assert.deepEqual((await discoverAgentCommands(home,{paths:[npm],platform:'win32',arch:'x64'})).codex,{executable});
  }finally{await rm(home,{recursive:true,force:true});}
});
