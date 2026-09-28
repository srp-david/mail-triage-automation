import {test} from 'vitest';
import assert from 'node:assert/strict';
import {UsernameLogin} from '../apps/local-app/src/username-login.js';
import {LocalSession} from '../apps/local-app/src/session.js';
import {randomUUID} from 'node:crypto';

function fixture(identityStatus=200,passwordStatus=401,passwordCode='LOGIN_DENIED'){
  const calls:string[]=[];
  const transport:typeof fetch=async(input)=>{
    const path=new URL(String(input)).pathname;calls.push(path);
    if(path.endsWith('/password'))return Response.json({code:passwordCode},{status:passwordStatus});
    if(path.endsWith('/me'))return Response.json(identityStatus===200?{userId:randomUUID(),mustChangePassword:true}:{code:identityStatus===401?'LOGIN_DENIED':'AUTH_UNAVAILABLE'},{status:identityStatus});
    throw Error('Unexpected request');
  };
  return {driver:new UsernameLogin('https://fixture.invalid','https://fixture.invalid/auth','triage',transport),calls};
}
test('wrong current password is retryable only after server session validation',async()=>{
  const {driver,calls}=fixture();
  await assert.rejects(driver.password('synthetic',{}),{status:400,code:'CURRENT_PASSWORD_INCORRECT'});
  assert.deepEqual(calls,['/auth/password','/auth/me']);
});
test('invalid session stays unauthorized and unavailable validation never claims wrong password',async()=>{
  await assert.rejects(fixture(401).driver.password('synthetic',{}),{status:401,code:'LOGIN_DENIED'});
  await assert.rejects(fixture(503).driver.password('synthetic',{}),{status:503,code:'AUTH_UNAVAILABLE'});
  const limited=fixture(200,429,'LOGIN_RATE_LIMIT');
  await assert.rejects(limited.driver.password('synthetic',{}),{status:429,code:'LOGIN_RATE_LIMIT'});
  assert.equal(limited.calls.length,1);
});
test('failed change retains the local session; successful retry clears it',async()=>{
  const userId=randomUUID();let fail=true,revoked=0;
  let data:any={phase:'ready',accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:Date.now()+300000,subject:userId,userId,issuer:'https://fixture.invalid/auth',clientId:'https://fixture.invalid',audience:'triage',mustChangePassword:true};
  const driver=new UsernameLogin('https://fixture.invalid','https://fixture.invalid/auth','triage',async(input)=>{
    const path=new URL(String(input)).pathname;
    if(path.endsWith('/password'))return fail?Response.json({code:'LOGIN_DENIED'},{status:401}):Response.json({ok:true,loginRequired:true});
    if(path.endsWith('/me'))return Response.json({userId,mustChangePassword:true});
    if(path.endsWith('/logout')){revoked++;return Response.json({ok:true});}
    throw Error('Unexpected request');
  });
  const session=new LocalSession(driver,{async read(){return data;},async write(_key,value){data=value;}},token=>driver.identify(token));
  await assert.rejects(session.password({}),{code:'CURRENT_PASSWORD_INCORRECT'});
  assert.equal(data.phase,'ready');assert.equal(await session.token(),'synthetic-access');assert.equal(revoked,0);
  fail=false;await session.password({});assert.equal(data.phase,'signed_out');assert.equal(revoked,1);
});
