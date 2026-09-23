import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runCommand} from '../apps/local-app/src/cli.js';
import {createBrowserApp} from '../apps/local-app/src/browser-app.js';
import {createServer} from 'node:net';
import {controlRequest} from '../apps/local-app/src/control-client.js';
import {shutdownLocal} from '../apps/local-app/src/shutdown.js';
test('CLI maps explicit commands to local routes and rejects unsafe run identifiers',async()=>{
  const id=randomUUID(),calls:any[]=[];const call=async(path:string,body?:unknown)=>{calls.push({path,body});return {ok:true};},read=async()=>'{"body":"synthetic","requestId":"'+randomUUID()+'"}';
  await runCommand(['review',id,'fixture.json'],call,read);assert.equal(calls[0].path,'/runs/'+id+'/reviews');
  await runCommand(['runner','start','sync'],call,read);assert.equal(calls[1].body.kind,'sync');
  await runCommand(['recovery','recover'],call,read);assert.equal(calls[2].body.action,'recover');
  await assert.rejects(runCommand(['get','abc?admin=1'],call,read));assert.equal(calls.length,3);
});
test('local CLI capability shares backend session but does not bypass browser CSRF',async()=>{
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
  const control='synthetic-control-'.repeat(3),session:any={async token(){return 'backend-only';}};
  const server=createBrowserApp(session,{port,controlToken:control,features:app=>app.post('/api/test',(_req,res)=>res.json({ok:true}))}).listen(port,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+port;
  try{
    const headers={authorization:'Bearer '+control,'x-local-client':'1','content-type':'application/json'};
    assert.equal((await controlRequest({port,token:control,pid:process.pid},'/api/test',{})).status,200);
    assert.equal((await fetch(origin+'/api/test',{method:'POST',headers,body:'{}'})).status,200);
    assert.equal((await fetch(origin+'/api/test',{method:'POST',headers:{...headers,origin},body:'{}'})).status,401);
    assert.equal((await fetch(origin+'/api/test',{method:'POST',headers:{...headers,authorization:'Bearer wrong'},body:'{}'})).status,401);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('stale listener cannot receive the local capability before authenticating itself',async()=>{
  const requests:any[]=[];const transport=(async(url:any,init:any)=>{requests.push({url,headers:init.headers});return Response.json({proof:'0'.repeat(64)});}) as typeof fetch;
  await assert.rejects(controlRequest({port:3080,pid:process.pid,token:'synthetic-private-capability'.repeat(2)},'/api/test',{},transport),/LOCAL_SERVER_IDENTITY_MISMATCH/);
  assert.equal(requests.length,1);assert.equal(requests[0].headers,undefined);assert.match(requests[0].url,/local-challenge\?nonce=[a-f0-9]{64}$/);
});
test('shutdown releases a stopped app lock even when credential cleanup fails',async()=>{
  const order:string[]=[];const step=(name:string,fail=false)=>async()=>{order.push(name);if(fail)throw new Error('synthetic failure');};
  assert.deepEqual(await shutdownLocal({stop:step('stop'),close:step('close'),clear:step('clear',true),release:step('release')}),{ok:false,lockReleased:true});assert.deepEqual(order,['stop','close','clear','release']);
  assert.deepEqual(await shutdownLocal({stop:step('stop',true),close:step('close'),clear:step('clear'),release:async()=>{throw new Error('must not release active worker');}}),{ok:false,lockReleased:false});
});
