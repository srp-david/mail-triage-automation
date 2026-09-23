import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {LocalProfile} from '../apps/local-app/src/profile.js';
test('thread cache scope follows the authenticated user and bound source instance',async()=>{
  const sourceId=randomUUID(),instance=randomUUID(),records=new Map<string,any>();let userId=randomUUID(),visible=true;
  const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return records.get(k);},async write(k:string,v:any){records.set(k,v);}};
  const endpoint='http://127.0.0.1:17082/mcp';records.set('source-instance',{id:instance,endpoint});
  const history:any={request:async()=>visible?[{id:sourceId,instance_id:instance}]:[]};
  const profile=new LocalProfile(history,{identity:async()=>({userId})} as any,store,endpoint);
  const select=()=>records.set('profile-'+userId,{sourceId,agent:'codex'});select();
  const first=await profile.selection();assert.ok(first.original);assert.ok(first.cacheScope);
  assert.equal((await profile.selection()).cacheScope,first.cacheScope);
  userId=randomUUID();select();assert.notEqual((await profile.selection()).cacheScope,first.cacheScope);
  visible=false;assert.equal((await profile.selection()).original,undefined);assert.equal((await profile.selection()).cacheScope,undefined);
});
test('source reconnection requires same-store confirmation and fresh matching historical identities',async()=>{
  const sourceId=randomUUID(),instance=randomUUID(),userId=randomUUID(),runId=randomUUID(),records=new Map<string,any>();let mismatch=false;
  const store={async read(k:string){if(!records.has(k))throw Object.assign(new Error(),{code:'ENOENT'});return structuredClone(records.get(k));},async write(k:string,v:any){records.set(k,structuredClone(v));}};
  const history:any={async request(path:string){return path==='/sources'?[{id:sourceId,instance_id:instance}]:[{id:runId,mailId:17}];},async get(){return {sourceId,mailId:17,messageId:'<fixture>',subject:'Synthetic'};}};
  const profile=new LocalProfile(history,{identity:async()=>({userId})} as any,store,'http://127.0.0.1:17082/mcp',(()=>({call:async()=>({id:17,messageId:mismatch?'changed':'<fixture>',subject:'Synthetic'})})) as any);
  const preview=await profile.previewReconnect({sourceId});assert.equal(preview.matchedMails,1);
  await assert.rejects(profile.applyReconnect({ticket:preview.ticket,confirmedSameStore:false}));assert.equal(records.has('source-instance'),false);
  mismatch=true;await assert.rejects(profile.applyReconnect({ticket:preview.ticket,confirmedSameStore:true}),/RECONNECT_IDENTITY_MISMATCH/);assert.equal(records.has('source-instance'),false);
  mismatch=false;await profile.applyReconnect({ticket:preview.ticket,confirmedSameStore:true});assert.equal(records.get('source-instance').id,instance);
  await assert.rejects(profile.applyReconnect({ticket:preview.ticket,confirmedSameStore:true}),/RECONNECT_EXPIRED/);
});
