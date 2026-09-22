import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.js';
import {requestContext,finishRoutes} from '../packages/contracts/src/http.js';
test('local UI facade rechecks source identity before admission and supports history without originals',async()=>{
  const sourceId=randomUUID(),runId=randomUUID(),runnerId=randomUUID();let hasOriginal=true,messageId='<expected@test>',calls=0,started:any;
  const mail={id:1,messageId,fetchedAt:'2026-09-18T00:00:00Z',subject:'Synthetic'};
  const history:any={async start(input:any){started=input;return {id:runId};},async get(){return {id:runId,sourceId,mailId:1,messageId,storeId:sourceId,subject:'Synthetic',status:'completed',result:{report:'Saved synthetic report'},reviews:[],relatedMails:[]};}};
  const context:any={async selection(){return {sourceId,runnerId,agent:'codex',original:hasOriginal?{async call(){calls++;return {...mail,messageId};}}:undefined};}};
  const app=express();app.use(requestContext);app.use(express.json());localUiRoutes(app,history,context);const server=finishRoutes(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
  const input={storeId:sourceId,mailId:1,messageId:'<expected@test>',requestId:randomUUID()};
  const post=(body:any)=>fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  try{
    context.environment=()=>({mailConfigured:true,agents:['codex'],evidenceRootCount:2,dbConfigured:false});
    const settingsResponse=await (await fetch(base+'/api/settings')).json();
    assert.deepEqual(settingsResponse.environment,{mailConfigured:true,agents:['codex'],evidenceRootCount:2,dbConfigured:false});
    assert.equal(settingsResponse.originalAvailable,true);
    assert.equal(calls,0,'Settings only reports configuration; it must not query mail contents');
    assert.equal((await post({...input,storeId:randomUUID()})).status,409);assert.equal(calls,0);
    messageId='<changed@test>';assert.equal((await post(input)).status,409);assert.equal(started,undefined);
    messageId=input.messageId;assert.equal((await post(input)).status,201);assert.equal(started.sourceId,sourceId);assert.equal(started.runnerId,runnerId);assert.equal(started.subject,mail.subject);assert.ok(started.verifiedAt);
    hasOriginal=false;assert.equal((await post(input)).status,409);const report=await (await fetch(base+'/api/runs/'+runId)).json();assert.equal(report.result.report,'Saved synthetic report');assert.equal(report.store_id,sourceId);
    assert.equal((await fetch(base+'/api/mails/1')).status,409);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
