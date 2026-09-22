import {test} from 'vitest';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {request} from 'node:http';
import {createLocalApp} from '../apps/local-app/src/app.js';
import {ApiError} from '../packages/contracts/src/v1.js';
import {randomUUID} from 'node:crypto';
test('local facade denies wrong Host, cross-origin and missing session; reports are never cached',async()=>{
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
  const token='synthetic-'.repeat(5);let calls=0;
  const history:any={async request(){calls++;return {userId:'synthetic'};}};
  const server=createLocalApp(history,token,port).listen(port,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
    const base='http://127.0.0.1:'+port+'/local-api/me';
    assert.equal((await fetch(base)).status,401);
    const wrongHost=await new Promise<number|undefined>((resolve,reject)=>{const req=request(base,{headers:{host:'hostile.example',authorization:'Bearer '+token}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
    assert.equal(wrongHost,403);
    assert.equal((await fetch(base,{headers:{origin:'https://hostile.example',authorization:'Bearer '+token}})).status,403);
    assert.equal(calls,0);const response=await fetch(base,{headers:{authorization:'Bearer '+token}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,1);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('local facade rejects path injection before upstream and returns safe upstream auth/conflict errors',async()=>{
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
  let calls=0,status=401;const token='x'.repeat(40);
  const server=createLocalApp({async get(){calls++;throw new ApiError(status,status===401?'UNAUTHENTICATED':'LEASE_CONFLICT');}} as any,token,port).listen(port,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+port+'/local-api/runs/';const headers={authorization:'Bearer '+token};
  try{
    assert.equal((await fetch(base+'abc%3Fadmin%3D1',{headers})).status,400);assert.equal(calls,0);
    for(status of [401,409]){const response=await fetch(base+randomUUID(),{headers});assert.equal(response.status,status);const data=await response.json();assert.ok(data.requestId);assert.ok(data.message);assert.equal(data.stack,undefined);}
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
