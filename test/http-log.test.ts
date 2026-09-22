import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {request as httpRequest} from 'node:http';
import {createRequestContext,finishRoutes} from '../packages/contracts/src/http.js';
import type {HttpErrorLog,HttpLogSink} from '../packages/contracts/src/http-log.js';
import {ApiError} from '../packages/contracts/src/v1.js';
import {HistoryClient} from '../packages/history-client/src/index.js';

async function fixture(routes:(app:express.Express)=>void,log:HttpLogSink){
  const app=express();app.use(createRequestContext(log));app.use(express.json({limit:1024}));routes(app);
  const server=finishRoutes(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  return {base:'http://127.0.0.1:'+(server.address() as any).port,close:()=>new Promise<void>(r=>server.close(()=>r()))};
}

test('HTTP error log correlates response ID and keeps only route template, category and timing',async()=>{
  const logs:HttpErrorLog[]=[],secret='synthetic-private-mail-and-token';
  const f=await fixture(app=>{
    app.post('/runs/:id',()=>{throw new TypeError(secret);});
    app.get('/db',()=>{throw Object.assign(new Error(secret),{code:'23505',detail:secret,query:'SELECT '+secret,table:secret});});
    app.get('/ok',(_req,res)=>res.json({ok:true}));
  },entry=>logs.push(entry));
  try{
    const response=await fetch(f.base+'/runs/'+secret+'?query='+secret,{method:'POST',headers:{'content-type':'application/json','x-request-id':secret,authorization:'Bearer '+secret,cookie:'session='+secret},body:JSON.stringify({body:secret})});
    const body=await response.json();assert.equal(response.status,500);assert.equal(logs.length,1);
    assert.equal(logs[0].requestId,body.requestId);assert.equal(logs[0].requestId,response.headers.get('x-request-id'));assert.notEqual(logs[0].requestId,secret);
    assert.equal(logs[0].route,'/runs/:id');assert.equal(logs[0].method,'POST');assert.equal(logs[0].errorType,'TypeError');assert.equal(logs[0].code,'INTERNAL_ERROR');
    assert.equal(logs[0].level,'error');assert.equal(logs[0].status,500);assert.equal(logs[0].responseCompleted,true);assert.ok(logs[0].durationMs>=0);
    assert.equal((await fetch(f.base+'/db')).status,409);assert.equal(logs[1].databaseCode,'23505');assert.equal(logs[1].code,'CONFLICT');assert.equal(logs[1].errorType,'DatabaseError');
    assert.equal((await fetch(f.base+'/ok')).status,200);assert.equal(logs.length,2);
    assert.equal(JSON.stringify(logs).includes(secret),false);
    assert.equal('message' in logs[0],false);assert.equal('stack' in logs[0],false);
  }finally{await f.close();}
});

test('parser, auth and unknown-path errors never log raw URL or untrusted code and error name',async()=>{
  const logs:HttpErrorLog[]=[],secret='SYNTHETIC_PRIVATE_TOKEN';
  const f=await fixture(app=>{
    app.get('/upstream',()=>{throw new ApiError(502,secret,secret);});
    app.use('/protected',()=>{throw new ApiError(401,'LOGIN_REQUIRED');});
    app.get('/custom-name',()=>{throw Object.assign(new Error(secret),{name:secret});});
  },entry=>logs.push(entry));
  try{
    const malformed=await fetch(f.base+'/'+secret,{method:'POST',headers:{'content-type':'application/json'},body:'{'+secret});assert.equal(malformed.status,400);
    const large=await fetch(f.base+'/'+secret,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:secret.repeat(100)})});assert.equal(large.status,413);
    assert.equal((await fetch(f.base+'/protected/'+secret)).status,401);
    assert.equal((await fetch(f.base+'/'+secret)).status,404);
    assert.equal((await fetch(f.base+'/upstream')).status,502);
    assert.equal((await fetch(f.base+'/custom-name')).status,500);
    assert.equal(logs.length,6);assert.ok(logs.slice(0,4).every(x=>x.route==='<unmatched>'));
    assert.equal(logs[4].code,'REQUEST_FAILED');assert.equal(logs[4].upstreamRequestId,undefined);assert.equal(logs[5].errorType,'Error');
    assert.equal(JSON.stringify(logs).includes(secret),false);
  }finally{await f.close();}
});

test('local facade error links to the upstream history request without exposing tokens',async()=>{
  const remote:HttpErrorLog[]=[],local:HttpErrorLog[]=[],run=randomUUID();
  const history=await fixture(app=>app.get('/api/v1/runs/:id',()=>{throw new ApiError(503,'LOCAL_MCP_UNAVAILABLE');}),entry=>remote.push(entry));
  const client=new HistoryClient(history.base,async()=>'synthetic-private-auth');
  const facade=await fixture(app=>app.get('/api/runs/:id',async(req,res)=>res.json(await client.get(req.params.id))),entry=>local.push(entry));
  try{
    const response=await fetch(facade.base+'/api/runs/'+run),body=await response.json();
    assert.equal(response.status,503);assert.equal(local.length,1);assert.equal(remote.length,1);
    assert.equal(body.requestId,local[0].requestId);assert.notEqual(local[0].requestId,remote[0].requestId);assert.equal(local[0].upstreamRequestId,remote[0].requestId);
    const serialized=JSON.stringify({local,remote});assert.equal(serialized.includes(run),false);assert.equal(serialized.includes('synthetic-private-auth'),false);
  }finally{await facade.close();await history.close();}
});

test('logging sink failure cannot change an HTTP error response',async()=>{
  const f=await fixture(app=>app.get('/fail',()=>{throw new ApiError(409,'RESULT_CONFLICT');}),()=>{throw new Error('sink offline');});
  try{const response=await fetch(f.base+'/fail'),body=await response.json();assert.equal(response.status,409);assert.equal(body.code,'RESULT_CONFLICT');assert.equal(body.requestId,response.headers.get('x-request-id'));}finally{await f.close();}
});

test('failure after headers closes the partial response and emits one sanitized record',async()=>{
  const logs:HttpErrorLog[]=[];
  const f=await fixture(app=>app.get('/stream/:id',(_req,res,next)=>{res.write('synthetic chunk');setImmediate(()=>next(new Error('SYNTHETIC_PRIVATE_STACK')));}),entry=>logs.push(entry));
  try{
    await new Promise<void>(resolve=>{
      const request=httpRequest(f.base+'/stream/private-value',response=>{response.resume();response.on('end',resolve);response.on('error',()=>resolve());});
      request.on('error',()=>resolve());request.end();
    });
    await new Promise<void>(r=>setImmediate(r));assert.equal(logs.length,1);assert.equal(logs[0].responseCompleted,false);assert.equal(logs[0].status,500);assert.equal(logs[0].route,'/stream/:id');
    assert.equal(JSON.stringify(logs).includes('SYNTHETIC_PRIVATE_STACK'),false);
  }finally{await f.close();}
});
