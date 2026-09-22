import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {LocalSession} from '../apps/local-app/src/session.js';
import {createBrowserApp} from '../apps/local-app/src/browser-app.js';
function fixture(){
  let data:any={phase:'signed_out'},time=0,refreshes=0,failWrite=false,failRefresh=false;
  const userId=randomUUID(),tokens={access_token:'access-1',refresh_token:'refresh-1',expires_in:120,token_type:'Bearer',subject:'fixture'};
  const login:any={issuer:'https://fixture.test/',clientId:'native',audience:'history',begin:()=> 'https://fixture.test/authorize',cancel(){},async callback(){return tokens;},async refresh(){refreshes++;if(failRefresh)throw new Error('lost response');return {...tokens,access_token:'access-2',refresh_token:'refresh-2'};},async revoke(){return true;}};
  const store={async read(){return structuredClone(data);},async write(_key:string,value:any){if(failWrite)throw new Error('disk failure');data=structuredClone(value);}};
  const make=()=>new LocalSession(login,store,async()=>({userId}),()=>time);
  return {session:make(),make,login,store,userId,tick(){time=100000;},data:()=>data,count:()=>refreshes,failWrite(){failWrite=true;},failRefresh(){failRefresh=true;}};
}
test('session persists before use, serializes token rotation and fails closed on uncertain refresh/restart',async()=>{
  const f=fixture();f.session.begin();await f.session.accept(new URL('http://127.0.0.1:3080/auth/callback'));
  assert.equal(await f.session.token(),'access-1');f.tick();assert.deepEqual(await Promise.all([f.session.token(),f.session.token()]),['access-2','access-2']);assert.equal(f.count(),1);assert.equal(f.data().refreshToken,'refresh-2');
  await f.session.logout();await assert.rejects(f.make().token(),/LOGIN_REQUIRED/);
  const failed=fixture();await failed.session.accept(new URL('http://127.0.0.1:3080/auth/callback'));failed.tick();failed.failRefresh();
  await assert.rejects(failed.session.token(),/LOGIN_REQUIRED/);assert.equal(failed.data().phase,'renewing');await assert.rejects(failed.make().token(),/LOGIN_REQUIRED/);assert.equal(failed.count(),1);
  const disk=fixture();disk.failWrite();await assert.rejects(disk.session.accept(new URL('http://127.0.0.1:3080/auth/callback')),/disk failure/);await assert.rejects(disk.session.token(),/LOGIN_REQUIRED/);
});
test('logout cancels an in-flight login before it can publish a session',async()=>{
  const f=fixture();let release!:(v:any)=>void;
  f.login.callback=()=>new Promise(r=>release=r);f.session.begin();const accepting=f.session.accept(new URL('http://127.0.0.1:3080/auth/callback'));
  await new Promise(r=>setImmediate(r));const logout=f.session.logout();release({access_token:'access',refresh_token:'refresh',token_type:'Bearer',expires_in:120,subject:'fixture'});
  await assert.rejects(accepting,/LOGIN_CANCELLED/);await logout;assert.equal(f.data().phase,'signed_out');
});
test('non-rotating refresh must be explicitly configured; uncertain responses still require login',async()=>{
  const f=fixture();const original=f.login.refresh;f.login.refresh=async()=>{const tokens=await original();delete tokens.refresh_token;return tokens;};
  const session=new LocalSession(f.login,f.store,async()=>({userId:f.userId}),()=>100000,'static');
  await f.session.accept(new URL('http://127.0.0.1:3080/auth/callback'));assert.equal(await session.token(),'access-2');assert.equal(f.data().refreshToken,'refresh-1');
  const rotating=fixture();rotating.login.refresh=async()=>({access_token:'access-2',expires_in:120,token_type:'Bearer',subject:'fixture'});
  await rotating.session.accept(new URL('http://127.0.0.1:3080/auth/callback'));rotating.tick();await assert.rejects(rotating.session.token(),/LOGIN_REQUIRED/);
});
test('browser login uses HttpOnly cookie, CSRF, callback cookie binding, rotation and server-only tokens',async()=>{
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
  const f=fixture(),origin='http://127.0.0.1:'+port;
  const control='synthetic-control-'.repeat(3);
  const server=createBrowserApp(f.session,{port,controlToken:control,features(app){app.post('/api/mutate',(_req,res)=>res.json({ok:true}));}}).listen(port,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
    assert.equal((await fetch(origin+'/api/session',{headers:{origin:'https://evil.test'}})).status,403);
    let response=await fetch(origin+'/api/session');assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);
    assert.equal((await fetch(origin+'/api/browser-ticket',{method:'POST'})).status,401);
    response=await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}});const ticket=await response.json();
    response=await fetch(ticket.url,{redirect:'manual'});assert.equal(response.status,302);let cookie=response.headers.get('set-cookie')!.split(';')[0];assert.ok(response.headers.get('set-cookie')!.includes('HttpOnly'));
    assert.equal((await fetch(ticket.url,{redirect:'manual'})).status,401);
    response=await fetch(origin+'/api/session',{headers:{cookie}});const initial=await response.json();assert.equal(initial.authenticated,false);
    const headers={origin,cookie,'x-csrf-token':initial.csrf,'content-type':'application/json'};
    assert.equal((await fetch(origin+'/auth/login',{method:'POST',headers:{cookie,origin},body:'{}'})).status,403);
    response=await fetch(origin+'/auth/login',{method:'POST',headers,body:'{}'});assert.equal(response.status,200);const loginCookie=response.headers.get('set-cookie')!.split(';')[0];
    response=await fetch(origin+'/auth/callback?code=fixture&state=fixture',{headers:{cookie:loginCookie,'sec-fetch-site':'cross-site'},redirect:'manual'});assert.equal(response.status,302);cookie=response.headers.getSetCookie().find(x=>x.startsWith('triage-local='))!.split(';')[0];
    response=await fetch(origin+'/api/session',{headers:{cookie}});const signedIn=await response.json();assert.equal(signedIn.authenticated,true);assert.equal(signedIn.userId,f.userId);assert.equal(JSON.stringify(signedIn).includes('access-1'),false);assert.notEqual(signedIn.csrf,initial.csrf);
    assert.equal((await fetch(origin+'/api/mutate',{method:'POST',headers:{...headers,cookie},body:'{}'})).status,403);
    assert.equal((await fetch(origin+'/api/session',{headers:{cookie:'triage-local=wrong'}})).status,401);
    assert.equal((await fetch(origin+'/api/session')).status,401);
    const authenticated={...headers,cookie,'x-csrf-token':signedIn.csrf};assert.equal((await fetch(origin+'/api/mutate',{method:'POST',headers:authenticated,body:'{}'})).status,200);
    response=await fetch(origin+'/api/logout',{method:'POST',headers:authenticated,body:'{}'});assert.equal(response.status,200);assert.equal((await fetch(origin+'/api/mutate',{method:'POST',headers:authenticated,body:'{}'})).status,401);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
