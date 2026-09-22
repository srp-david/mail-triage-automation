import {test} from 'vitest';
import assert from 'node:assert/strict';
import {groupThreads,searchThreads} from '../src/mail-threads.js';
import type {ThreadLink} from '../src/thread-links.js';

const mail=(id:number,options:Record<string,unknown>={})=>({id,messageId:`<${id}@example.test>`,subject:'같은 제목',fetchedAt:'2026-01-01T00:00:00Z',sentAt:new Date(Date.UTC(2026,0,id)).toISOString(),inReplyTo:[],references:[],...options});
const ids=(threads:ReturnType<typeof groupThreads>)=>threads.map(t=>t.emails.map(m=>m.id));

test('manual edges are transitive, reversible and ignore missing or reused identities',()=>{
 const all=[mail(1),mail(2,{inReplyTo:['<1@example.test>']}),mail(3),mail(4)];
 const link=(a:number,b:number):ThreadLink=>({id:`edge-${a}-${b}`,storeId:'fixture',createdAt:'2026-01-01',source:all[a-1],target:all[b-1]});
 const edges=[link(1,3),link(3,4)];
 assert.deepEqual(ids(groupThreads(all,edges)),[[4,3,2,1]]);
 assert.equal(groupThreads(all,edges)[0].manualLinkIds.length,2);
 assert.deepEqual(groupThreads(all,edges)[0].emails.find(m=>m.id===3)?.manualLinkIds,['edge-1-3','edge-3-4']);
 assert.deepEqual(groupThreads(all,edges)[0].emails.find(m=>m.id===2)?.manualLinkIds,[]);
 assert.deepEqual(ids(groupThreads(all,[edges[0]])),[[4],[3,2,1]]);
 assert.deepEqual(ids(groupThreads(all,[])),[[4],[3],[2,1]]);
 assert.deepEqual(ids(groupThreads(all.filter(m=>m.id!==3),edges)),[[4],[2,1]]);
 assert.deepEqual(ids(groupThreads(all.map(m=>m.id===3?{...m,messageId:'<new-id>'}:m),edges)),[[4],[3],[2,1]]);
});

test('groups explicit replies across subject changes; same subjects alone do not merge',()=>{
 const threads=groupThreads([mail(1),mail(2,{inReplyTo:['<1@example.test>'],subject:'바뀐 제목'}),mail(3),mail(4,{references:['<1@example.test>','<2@example.test>']})]);
 assert.deepEqual(ids(threads),[[4,2,1],[3]]);
 assert.equal(threads[0].id,'thread:1');
});

test('missing ancestors, exact-case IDs, duplicates, malformed IDs and cycles',()=>{
 assert.deepEqual(ids(groupThreads([mail(1,{references:['<absent>']}),mail(2,{inReplyTo:['<absent>']})])),[[2,1]]);
 assert.deepEqual(ids(groupThreads([mail(1,{messageId:'<Case>'}),mail(2,{inReplyTo:['<case>']})])),[[2],[1]]);
 assert.deepEqual(ids(groupThreads([mail(1),mail(2,{messageId:'<1@example.test>'})])),[[2,1]]);
 assert.deepEqual(ids(groupThreads([mail(1,{messageId:null,inReplyTo:['bad']}),mail(2,{messageId:'bad',references:['bad']})])),[[2],[1]]);
 assert.deepEqual(ids(groupThreads([mail(1,{references:['<2@example.test>']}),mail(2,{references:['<1@example.test>']})])),[[2,1]]);
});

test('complete search is grouped before pagination and conditions reach every upstream page',async()=>{
 const all=Array.from({length:205},(_,i)=>mail(i+1,i===204?{inReplyTo:['<1@example.test>']}:{}));
 const calls:number[]=[];
 const search=async(args:any)=>{calls.push(args.offset);assert.equal(args.query,'needle');assert.equal(args.from_address,'from@example.test');assert.equal(args.sent_after,'2026-01-01T00:00:00Z');return {emails:all.slice(args.offset,args.offset+100),total:205,nextOffset:args.offset+100<205?args.offset+100:null};};
 const args={query:'needle',from_address:'from@example.test',sent_after:'2026-01-01T00:00:00Z',limit:2,offset:0};
 const first=await searchThreads(args,'all',search,async()=>{throw Error('not needed');});
 assert.equal(first.total,204);assert.equal(first.mailTotal,205);assert.equal(first.nextOffset,2);
 assert.deepEqual(ids(first.threads),[[205,1],[204]]);assert.deepEqual(calls,[0,100,200]);
 const last=await searchThreads({...args,offset:203},'all',search,async()=>[]);
 assert.deepEqual(ids(last.threads),[[2]]);assert.equal(last.nextOffset,null);
});

test('status filter retains connectivity through hidden intermediate mails and sorts by visible activity',async()=>{
 const all=[mail(1),mail(2,{inReplyTo:['<1@example.test>']}),mail(3,{inReplyTo:['<2@example.test>']}),mail(4),mail(5,{inReplyTo:['<1@example.test>']})];
 const rows=async(ids:number[])=>ids.map(mailId=>({mailId,runCount:1,legacyCount:0,latestStatus:[1,3,4].includes(mailId)?'completed':'failed'}));
 const result=await searchThreads({limit:30,offset:0},'completed',async()=>({emails:all,nextOffset:null}),rows);
 assert.deepEqual(ids(result.threads),[[4],[3,1]]);assert.equal(result.total,2);assert.equal(result.mailTotal,3);
});

test('no partial success for broken pages, missing metadata or upstream failure; deduplicates repeated rows',async()=>{
 const args={limit:30,offset:0};const summaries=async()=>[];
 await assert.rejects(searchThreads(args,'all',async()=>({emails:[{id:1}],nextOffset:null}),summaries),/MCP 업데이트/);
 await assert.rejects(searchThreads(args,'all',async()=>({emails:[mail(1)],nextOffset:0}),summaries),/진행되지/);
 await assert.rejects(searchThreads(args,'all',async a=>{if(a.offset)throw Error('upstream failed');return {emails:[mail(1)],nextOffset:100};},summaries),/upstream failed/);
 const result=await searchThreads(args,'all',async a=>({emails:a.offset?[mail(1),mail(2)]:[mail(1)],nextOffset:a.offset?null:100}),summaries);
 assert.deepEqual(ids(result.threads),[[2],[1]]);assert.equal(result.mailTotal,2);
});
