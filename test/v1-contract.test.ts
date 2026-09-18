import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {HistoryClient} from '../packages/history-client/src/index.js';
import {createHistoryApp,errors} from '../apps/history-api/src/app.js';
import {ApiError} from '../packages/contracts/src/v1.js';
test('DB-free HTTP client uses authenticated versioned contract and preserves retry identity',async()=>{
  const records=new Map<string,any>();const actor={userId:randomUUID()};
  const server=errors(createHistoryApp({
    async start(_actor,input){const row=records.get(input.requestId)??{id:input.requestId,...input};records.set(input.requestId,row);return row;},
    async get(_actor,id){return records.get(id);},
    async complete(_actor,id,input){const row=records.get(id);row.result=input;return row;},
  },async token=>{if(token!=='fixture')throw new ApiError(401,'UNAUTHENTICATED');return actor;})).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try{
    const base='http://127.0.0.1:'+(server.address() as any).port;
    const client=new HistoryClient(base,async()=>'fixture');
    const input={sourceId:randomUUID(),mailId:1,messageId:null,subject:'Synthetic',requestId:randomUUID(),runnerId:randomUUID(),agent:'codex' as const,executorKind:'local' as const,verifiedAt:new Date().toISOString()};
    const row=await client.start(input);assert.equal((await client.start(input)).id,row.id);
    await client.complete(row.id,{runnerId:input.runnerId,leaseToken:'x'.repeat(32),generation:1},randomUUID(),{report:'fixture'},'fixture');
    assert.equal((await client.get(row.id)).result.result.report,'fixture');
    assert.equal((await fetch(base+'/api/runs')).status,404);
    await assert.rejects(new HistoryClient(base,async()=>'wrong').get(row.id),/UNAUTHENTICATED/);
    assert.equal((await fetch(base+'/api/v1/me',{headers:{authorization:'Bearer fixture'}})).status,409);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
