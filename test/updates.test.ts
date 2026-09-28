import {afterEach,beforeEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {LocalUpdates} from '../apps/local-app/src/updates.js';
import {ApiError} from '../packages/contracts/src/v1.js';
import {updatePublicKeys,updateSigningBytes} from '../packages/contracts/src/updates.js';
vi.mock('node:child_process',()=>({spawn:vi.fn(()=>{const child=Object.assign(new EventEmitter(),{unref:vi.fn()});queueMicrotask(()=>child.emit('spawn'));return child;})}));
import {spawn} from 'node:child_process';
const keys=generateKeyPairSync('ed25519'),keyId='0123456789abcdef';
let home:string;
beforeEach(async()=>{await mkdir('.runtime/update-tests',{recursive:true});home=await mkdtemp(resolve('.runtime/update-tests/case-'));(updatePublicKeys as any)[keyId]=keys.publicKey.export({type:'spki',format:'pem'});});
afterEach(async()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();delete (updatePublicKeys as any)[keyId];await rm(home,{recursive:true,force:true});});
function release(){const payload=Buffer.from('synthetic installer - never executed');const value={metadataVersion:1 as const,releaseId:'v0.3.9',version:'0.3.9',channel:'stable' as const,platform:'win32-x64' as const,sourceCommit:'a'.repeat(40),apiContract:'1' as const,assetUrl:'https://github.com/srp-david/mail-triage-automation/releases/download/v0.3.9/setup.exe',releaseNotesUrl:'https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.9',assetSha256:createHash('sha256').update(payload).digest('hex'),assetSize:payload.length,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),keyId};return {payload,update:{...value,signature:sign(null,updateSigningBytes(value),keys.privateKey).toString('base64url')}};}
function fixture(request=vi.fn(async()=>({status:'current'} as any))){const runtime={drain:vi.fn(async()=>{}),releaseDrain:vi.fn()};return {request,runtime,updates:new LocalUpdates(home,'0.3.5',{request} as any,runtime as any)};}
const flush=()=>new Promise<void>(r=>setImmediate(r));
async function waitFor(test:()=>boolean){for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,5));}assert.ok(test());}
test('Node checks on start and hourly without a browser; reads do not query and stop clears timer',async()=>{
  vi.useFakeTimers();const f=fixture();f.updates.start();await vi.advanceTimersByTimeAsync(0);assert.equal(f.request.mock.calls.length,1);
  f.updates.snapshot();f.updates.snapshot();assert.equal(f.request.mock.calls.length,1);
  await vi.advanceTimersByTimeAsync(3600000);assert.equal(f.request.mock.calls.length,2);assert.equal(f.updates.snapshot().status,'current');
  f.updates.stop();await vi.advanceTimersByTimeAsync(3600000);assert.equal(f.request.mock.calls.length,2);
});
test('concurrent checks share one request and logout discards the pending result',async()=>{
  let finish!:(value:any)=>void;const f=fixture(vi.fn(()=>new Promise(r=>finish=r)));
  const a=f.updates.check(),b=f.updates.check(true);assert.equal(f.request.mock.calls.length,1);f.updates.reset();finish({status:'offered',update:release().update});await Promise.all([a,b]);assert.equal(f.updates.snapshot().status,'unknown');
});
test('later suppresses the same release until manual check and preserves the install offer',async()=>{
  const update=release().update,f=fixture(vi.fn(async()=>({status:'offered',update})));
  await f.updates.check();f.updates.defer();await f.updates.check();assert.equal(f.updates.snapshot().deferred,true);assert.equal(f.updates.snapshot().update?.version,'0.3.9');
  await f.updates.check(true);assert.equal(f.updates.snapshot().deferred,false);
});
test('unavailable, login, network and invalid signed metadata are distinct from current',async()=>{
  for(const [reply,expected] of [[{status:'unavailable'},'unavailable'],[{status:'channel_denied'},'channel_denied'],[new ApiError(401,'LOGIN_REQUIRED'),'login_required'],[new Error('private network detail'),'error'],[{status:'offered',update:{}},'error']] as const){
    const f=fixture(vi.fn(async()=>{if(reply instanceof Error)throw reply;return reply;}));await f.updates.check();assert.equal(f.updates.snapshot().status,expected);assert.ok(!JSON.stringify(f.updates.snapshot()).includes('private network'));
  }
});
test('install reports progress and waiting, refuses duplicate installs, rechecks offer and restarts only after drain',async()=>{
  const {payload,update}=release(),f=fixture(vi.fn(async()=>({status:'offered',update})));let drain!:()=>void;
  f.runtime.drain.mockImplementation(()=>new Promise(r=>drain=r));vi.stubGlobal('fetch',vi.fn(async()=>new Response(payload)));
  await f.updates.check();const done=vi.fn(async()=>{});f.updates.beginInstall(update,done);
  assert.throws(()=>f.updates.beginInstall(update,done),/UPDATE_IN_PROGRESS/);
  await waitFor(()=>f.updates.snapshot().phase==='waiting');assert.equal(f.updates.snapshot().downloadedBytes,payload.length);assert.equal(f.request.mock.calls.length,3);assert.equal(vi.mocked(spawn).mock.calls.length,0);
  drain();await waitFor(()=>done.mock.calls.length===1);assert.equal(f.updates.snapshot().phase,'installing');assert.equal(vi.mocked(spawn).mock.calls.length,1);assert.ok(vi.mocked(spawn).mock.calls[0][0].startsWith(home));
});
test('checksum failure never drains work or starts an installer',async()=>{
  const {update}=release(),f=fixture(vi.fn(async()=>({status:'offered',update})));vi.stubGlobal('fetch',vi.fn(async()=>new Response('wrong')));
  await f.updates.check();f.updates.beginInstall(update,async()=>{});await waitFor(()=>f.updates.snapshot().phase==='error');assert.equal(f.updates.snapshot().errorCode,'UPDATE_DOWNLOAD_CHECKSUM');assert.equal(f.runtime.drain.mock.calls.length,0);assert.equal(vi.mocked(spawn).mock.calls.length,0);
});
test('logout while waiting cancels installation and releases the drain',async()=>{
  const {payload,update}=release(),f=fixture(vi.fn(async()=>({status:'offered',update})));let drain!:()=>void;
  f.runtime.drain.mockImplementation(()=>new Promise(r=>drain=r));vi.stubGlobal('fetch',vi.fn(async()=>new Response(payload)));
  await f.updates.check();f.updates.beginInstall(update,async()=>{});await waitFor(()=>f.updates.snapshot().phase==='waiting');f.updates.reset();drain();await flush();assert.equal(vi.mocked(spawn).mock.calls.length,0);assert.equal(f.runtime.releaseDrain.mock.calls.length,1);assert.equal(f.updates.snapshot().status,'unknown');
});
test('a withdrawn offer after download never starts installation',async()=>{
  const {payload,update}=release();let calls=0;const f=fixture(vi.fn(async()=>++calls<3?{status:'offered',update}:{status:'current'}));vi.stubGlobal('fetch',vi.fn(async()=>new Response(payload)));
  await f.updates.check();f.updates.beginInstall(update,async()=>{});await waitFor(()=>f.updates.snapshot().phase==='error');assert.equal(f.updates.snapshot().errorCode,'UPDATE_CHANGED');assert.equal(f.runtime.drain.mock.calls.length,0);assert.equal(vi.mocked(spawn).mock.calls.length,0);
});
test('installer launch failure releases runtime drain and reports retryable failure',async()=>{
  const {payload,update}=release(),f=fixture(vi.fn(async()=>({status:'offered',update})));vi.stubGlobal('fetch',vi.fn(async()=>new Response(payload)));
  vi.mocked(spawn).mockImplementationOnce(()=>{throw Error('synthetic launch error');});
  await f.updates.check();f.updates.beginInstall(update,async()=>{});await waitFor(()=>f.updates.snapshot().phase==='error');assert.equal(f.updates.snapshot().errorCode,'UPDATER_START_FAILED');assert.equal(f.runtime.releaseDrain.mock.calls.length,1);
});
