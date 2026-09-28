import {afterEach,beforeEach,test,vi} from 'vitest';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {checkUpdate} from '../apps/history-api/src/updates.js';
import {LocalUpdates} from '../apps/local-app/src/updates.js';
import {updatePublicKeys,updateSigningBytes} from '../packages/contracts/src/updates.js';

const keys=generateKeyPairSync('ed25519'),keyId='fedcba9876543210';
const admin={userId:'admin-fixture',role:'admin'},pilot={userId:'pilot-fixture',role:'analyst'},other={userId:'other-fixture',role:'analyst'};
beforeEach(()=>{
  (updatePublicKeys as Record<string,string>)[keyId]=keys.publicKey.export({type:'spki',format:'pem'}).toString();
  vi.stubEnv('UPDATE_TEST_USER_IDS','pilot-fixture');
});
afterEach(()=>{delete (updatePublicKeys as Record<string,string>)[keyId];vi.unstubAllEnvs();});
function catalog(channel:'test'|'stable'='test'){
  const value={metadataVersion:1 as const,releaseId:'v0.3.12',version:'0.3.12',channel,platform:'win32-x64' as const,sourceCommit:'a'.repeat(40),apiContract:'1' as const,
    assetUrl:'https://github.com/srp-david/mail-triage-automation/releases/download/v0.3.12/0.3.12-setup.exe',releaseNotesUrl:'https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.12',
    assetSha256:'b'.repeat(64),assetSize:123,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),keyId};
  return JSON.stringify({...value,signature:sign(null,updateSigningBytes(value),keys.privateKey).toString('base64url')});
}
const query=(version='0.3.11',channel='stable')=>({version,platform:'win32-x64',channel});

test('numeric pilot clients receive signed test updates only for eligible accounts',()=>{
  const metadata=catalog();
  for(const actor of [admin,pilot]){
    const result=checkUpdate(query(),actor,metadata);
    assert.equal(result.status,'offered');
    assert.equal('update' in result&&result.update.channel,'test');
  }
  for(const channel of ['stable','test'])assert.deepEqual(checkUpdate(query('0.3.11',channel),other,metadata),{status:'channel_denied'});
  vi.stubEnv('UPDATE_TEST_USER_IDS','');
  assert.deepEqual(checkUpdate(query(),pilot,metadata),{status:'channel_denied'});
});

test('candidate, current, newer and stable releases retain version and channel policy',()=>{
  assert.equal(checkUpdate(query('0.3.0-candidate.10','test'),admin,catalog()).status,'offered');
  for(const version of ['0.3.12','0.3.13'])assert.equal(checkUpdate(query(version),pilot,catalog()).status,'current');
  assert.equal(checkUpdate(query(),other,catalog('stable')).status,'offered');
  assert.equal(checkUpdate(query('0.3.11','test'),other,catalog('stable')).status,'channel_denied');
});

test('missing, tampered, expired metadata and invalid versions cannot produce an offer',()=>{
  assert.equal(checkUpdate(query(),admin).status,'unavailable');
  const metadata=JSON.parse(catalog());metadata.version='0.3.13';
  assert.throws(()=>checkUpdate(query(),admin,JSON.stringify(metadata)),{code:'UPDATE_CATALOG_INVALID'});
  const expired=JSON.parse(catalog());expired.issuedAt=new Date(Date.now()-20000).toISOString();expired.expiresAt=new Date(Date.now()-10000).toISOString();
  expired.signature=sign(null,updateSigningBytes(expired),keys.privateKey).toString('base64url');
  assert.throws(()=>checkUpdate(query(),admin,JSON.stringify(expired)),{code:'UPDATE_CATALOG_INVALID'});
  assert.throws(()=>checkUpdate(query('not-a-version'),admin,catalog()),{code:'INVALID_APP_VERSION'});
});

test('unchanged installed numeric client and server policy produce an offer on manual check',async()=>{
  const metadata=catalog(),calls:unknown[]=[];
  const history={async request(path:string,_body:unknown,_signal:unknown,options:{query:unknown}){
    assert.equal(path,'/updates/check');calls.push(options.query);
    return checkUpdate(options.query,admin,metadata);
  }};
  const client=new LocalUpdates('synthetic-not-used','0.3.11',history as any,{} as any);
  const result=await client.check(true);
  assert.deepEqual(calls,[query()]);assert.equal(result.status,'offered');assert.equal(result.update?.version,'0.3.12');
});
