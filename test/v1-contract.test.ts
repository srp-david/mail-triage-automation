import {test} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {HistoryClient} from '../packages/history-client/src/index.js';
import {createHistoryApp,errors} from '../apps/history-api/src/app.js';
import {ApiError,runInput} from '../packages/contracts/src/v1.js';
test('DB-free HTTP client sends version, input, device credential and retry identity to fixture repository',async()=>{
  const records=new Map<string,any>();const actor={userId:randomUUID()};
  const server=errors(createHistoryApp({
    async start(_actor,input){const row=records.get(input.requestId)??{id:input.requestId,...input};records.set(input.requestId,row);return row;},
    async get(_actor,id){return records.get(id);},
    async complete(_actor,id,input,device){assert.equal(device,'fixture-device');const row=records.get(id);row.result=input;return row;},
  },async token=>{if(token!=='fixture')throw new ApiError(401,'UNAUTHENTICATED');return actor;})).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try{
    const base='http://127.0.0.1:'+(server.address() as any).port;
    const client=new HistoryClient(base,async()=>'fixture');
    const input={sourceId:randomUUID(),mailId:1,messageId:null,subject:'Synthetic',requestId:randomUUID(),runnerId:randomUUID(),agent:'codex' as const,executorKind:'local' as const,verifiedAt:new Date().toISOString()};
    const row=await client.start(input);assert.equal((await client.start(input)).id,row.id);
    assert.equal(runInput.safeParse({...input,executorKind:'service'}).success,false);
    await client.complete(row.id,{runnerId:input.runnerId,leaseToken:'x'.repeat(32),generation:1},randomUUID(),{outcome:'completed',project:'unknown',report:'fixture',question:'',knowledge:'',evidence:[]},'fixture-device');
    assert.equal((await client.get(row.id)).result.result.report,'fixture');
    assert.equal((await fetch(base+'/api/runs')).status,404);
    await assert.rejects(new HistoryClient(base,async()=>'wrong').get(row.id),/UNAUTHENTICATED/);
    assert.equal((await fetch(base+'/api/v1/me',{headers:{authorization:'Bearer fixture'}})).status,409);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('HTTP parser and validation errors are safe JSON; final handler preserves later feature routes',async()=>{
  let completions=0;
  const app=createHistoryApp({async start(){},async get(){throw Object.assign(new Error('secret path and body'),{status:418});},async complete(){completions++;}},async()=>({userId:randomUUID()}));
  app.get('/api/v1/later',(_req,res)=>res.json({ok:true}));
  const server=errors(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+(server.address() as any).port;
  const headers={authorization:'Bearer fixture','x-contract-version':'1','content-type':'application/json'};
  try{
    for(const [body,status,code] of [['{secret',400,'INVALID_INPUT'],[JSON.stringify({secret:'x'.repeat(2*1024*1024)}),413,'PAYLOAD_TOO_LARGE']] as const){
      const response=await fetch(base+'/api/v1/runs',{method:'POST',headers,body});const data=await response.json();
      assert.equal(response.status,status);assert.equal(data.code,code);assert.ok(data.message);assert.equal(data.requestId,response.headers.get('x-request-id'));assert.match(data.requestId,/^[\da-f-]{36}$/);assert.equal(JSON.stringify(data).includes('secret'),false);assert.equal(response.headers.get('cache-control'),'no-store');
    }
    assert.equal((await fetch(base+'/api/v1/later',{headers})).status,200);
    assert.equal((await fetch(base+'/api/v1/me',{headers:{...headers,'sec-fetch-mode':'navigate','sec-fetch-dest':'document'}})).status,403);
    const invalid=await fetch(base+'/api/v1/runs/'+randomUUID()+'/result',{method:'POST',headers,body:'{"leaseToken":1}'});assert.equal(invalid.status,400);assert.equal(completions,0);
    const unexpected=await fetch(base+'/api/v1/runs/'+randomUUID(),{headers});assert.equal(unexpected.status,500);assert.equal((await unexpected.json()).code,'INTERNAL_ERROR');
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
