import {test} from 'vitest';
import assert from 'node:assert/strict';
import {agentCommandSchema} from '../packages/agent-adapters/src/command.js';
import {parseWslDistributions,wslArgs,wslEnvironment,wslRequest} from '../packages/agent-adapters/src/wsl.js';

test('WSL commands retain explicit distro/user and reject Docker, Windows paths and injected options',()=>{
  assert.deepEqual(agentCommandSchema.parse({executable:'C:\\tools\\codex.exe'}),{executable:'C:\\tools\\codex.exe'});
  const command={executable:'/home/사용자/my cli/claude',wsl:{distribution:'Ubuntu-24.04',user:'david'}};
  assert.deepEqual(agentCommandSchema.parse(command),command);
  assert.deepEqual(wslArgs(command.wsl).slice(0,8),['--distribution','Ubuntu-24.04','--user','david','--exec','python3','-u','-c']);
  for(const value of [{executable:'wsl.exe',wsl:{distribution:'Ubuntu'}},{executable:'claude',wsl:{distribution:'docker-desktop'}},{executable:'codex',wsl:{distribution:'--exec'}},{executable:'codex',wsl:{distribution:'Ubuntu',user:'user; id'}},{executable:'C:\\codex.exe',wsl:{distribution:'Ubuntu'}}])assert.equal(agentCommandSchema.safeParse(value).success,false);
});
test('WSL listing handles Windows UTF16 output and never offers Docker internal distributions',()=>{
  assert.deepEqual(parseWslDistributions(Buffer.from('\uFEFFUbuntu\r\nDebian\r\ndocker-desktop\r\ndocker-desktop-data\r\nUbuntu\r\n','utf16le')),['Ubuntu','Debian']);
  assert.deepEqual(parseWslDistributions(Buffer.from('Ubuntu-24.04\n')),['Ubuntu-24.04']);
});
test('WSL isolates Windows credentials and maps only path arguments, keeping prompts and tokens off command lines',()=>{
  const env=wslEnvironment({PATH:'C:\\Windows',HOME:'private',CODEX_HOME:'private',WSLENV:'SECRET/u',SECRET:'private',DATABASE_URL:'private',ANTHROPIC_API_KEY:'private'});
  assert.deepEqual(env,{PATH:'C:\\Windows',WSLENV:''});
  const command={executable:'claude',prefix:['--custom'],wsl:{distribution:'Ubuntu'}};
  const request=wslRequest(command,['-p','--mcp-config','C:\\한글 폴더\\mcp.json','--json-schema','{"type":"object"}'],'$(do not execute)', 'C:\\한글 폴더',5000,'secret-token','http://127.0.0.1:1234/wsl-check');
  assert.deepEqual(request.pathIndexes,[3]);assert.equal(request.input,'$(do not execute)');assert.equal(request.token,'secret-token');
  assert.ok(!wslArgs(command.wsl).join(' ').includes('secret-token'));
  assert.deepEqual(wslRequest({executable:'codex',wsl:{distribution:'Ubuntu'}},['exec','--output-schema','C:\\result.json','-'],'',undefined,5000).pathIndexes,[2]);
});
