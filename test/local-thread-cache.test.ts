import {test} from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.js';
import {requestContext,finishRoutes} from '../packages/contracts/src/http.js';
import {ApiError} from '../packages/contracts/src/v1.js';

test('v1 thread pages share scans while permissions, states, links, sync and scope remain fresh',async()=>{
  const sourceId=randomUUID(),mails=Array.from({length:205},(_,i)=>({id:i+1,messageId:`<${i}@example.test>`,fetchedAt:'2026-09-21T00:00:00Z',inReplyTo:[],references:[]}));
  let source=sourceId,scope='user-a:instance-a',allowed=true,completed=1,links:any[]=[],batch=0,fail=false;
  let calls=0,sessions=0,linkReads=0;
  const search=async(args:any)=>{calls++;if(fail)throw new ApiError(502,'LOCAL_MCP_UNAVAILABLE');return {emails:mails.slice(args.offset,args.offset+100),nextOffset:args.offset+100<mails.length?args.offset+100:null};};
  const original={call:async(name:string,args:any)=>{assert.equal(name,'search_emails');return search(args);},async withSearch(action:any){sessions++;return action(search);}};
  const history:any={async request(path:string,body:any){
    if(!allowed)throw new ApiError(404,'SOURCE_NOT_FOUND');
    if(path.endsWith('/thread-links')){linkReads++;return links;}
    if(path.endsWith('/sync-latest'))return {id:'sync',status:'running',saved:batch,batch_count:batch};
    if(path.endsWith('/mail-analysis'))return body.mailIds.map((mailId:number)=>({mailId,runCount:1,legacyCount:0,latestStatus:mailId===completed?'completed':'failed'}));
    throw new Error('Unexpected history request');
  }};
  const app=express();app.use(requestContext);
  localUiRoutes(app,history,{async selection(){return {sourceId:source,cacheScope:scope,original,agent:'codex'};}} as any);
  const server=finishRoutes(app).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const request=(query='')=>fetch('http://127.0.0.1:'+(server.address() as any).port+'/api/mails?view=threads&limit=30'+query);
  const read=async(query='')=>{const response=await request(query);assert.equal(response.status,200);return response.json();};
  try{
    const pages=await Promise.all([read(),read('&offset=30')]);assert.equal(pages[0].total,205);assert.equal(pages[1].threads.length,30);assert.equal(calls,3);assert.equal(sessions,1);
    assert.equal((await read('&analysis_status=completed')).threads[0].emails[0].id,1);
    completed=2;assert.equal((await read('&analysis_status=completed')).threads[0].emails[0].id,2);
    links=[{id:randomUUID(),storeId:source,source:mails[0],target:mails[1],createdAt:'2026-09-21'}];
    assert.equal((await read()).total,204);links=[];assert.equal((await read()).total,205);assert.equal(calls,3);assert.equal(linkReads,6);
    allowed=false;assert.equal((await request()).status,404);assert.equal(calls,3);allowed=true;
    batch++;await read();assert.equal(calls,6);
    await read('&refresh=1');assert.equal(calls,9);assert.equal((await request('&refresh=bad')).status,400);assert.equal(calls,9);
    scope='user-b:instance-a';await read();assert.equal(calls,12);
    source=randomUUID();await read();assert.equal(calls,15);
    scope='user-b:instance-b';await read();assert.equal(calls,18);
    await read('&query=synthetic');assert.equal(calls,21);await read('&query=synthetic&offset=30');assert.equal(calls,21);
    fail=true;assert.equal((await request('&refresh=1')).status,502);fail=false;await read();assert.equal(calls,25);
    scope='';await read();await read('&offset=30');assert.equal(calls,31);
  }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
