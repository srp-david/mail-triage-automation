import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {LocalSession} from '../apps/local-app/src/session.js';
import {Scheduler} from '../packages/runner/src/scheduler.js';
test('logout cancels username exchange before tokens can be published',async()=>{
 let release!:(value:any)=>void,data:any={phase:'signed_out'},revoked=0;
 const userId=randomUUID(),driver:any={mode:'username',issuer:'https://fixture/',clientId:'https://fixture',audience:'triage',cancel(){},credentials:()=>new Promise(r=>release=r),async revoke(){revoked++;return true;}};
 const session=new LocalSession(driver,{async read(){return data;},async write(_key,value){data=value;}},async()=>({userId}));
 const accepting=session.credentials({username:'test.user',password:'Synthetic password 123!'});await new Promise(r=>setImmediate(r));
 const logout=session.logout();release({access_token:'access',refresh_token:'refresh',token_type:'Bearer',subject:userId,expires_in:300});
 await assert.rejects(accepting,/LOGIN_CANCELLED/);await logout;assert.equal(data.phase,'signed_out');assert.equal(revoked,1);
});
test('idle Runner reduces requests and authorization failure parks the loop',async()=>{
 let calls=0;const loop=new Scheduler(async()=>{calls++;return null;},20,80);loop.start();await delay(180);await loop.stop();assert.ok(calls>=2&&calls<=4,'idle polls should back off');
 let attempts=0;const denied=new Scheduler(async()=>{attempts++;throw {status:401};},1,5);denied.start();await delay(20);assert.equal(attempts,1);assert.equal(denied.state,'recovery_required');await denied.stop();
});
