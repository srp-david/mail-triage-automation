import {test} from 'vitest';
import assert from 'node:assert/strict';
import {ThreadSearchCache} from '../src/thread-cache.js';
import {scanThreadMails,searchThreads} from '../src/mail-threads.js';

test('concurrent reads share a full scan; expiry and sync revision require fresh data',async()=>{
 let now=0,calls=0,release!:(value:number)=>void;
 const cache=new ThreadSearchCache<number>(15,8,1024,()=>now);
 const first=cache.get('store-a','sync-1',()=>{calls++;return new Promise(r=>release=r);});
 const second=cache.get('store-a','sync-1',async()=>99);
 await Promise.resolve();assert.equal(calls,1);release(1);
 assert.deepEqual(await Promise.all([first,second]),[1,1]);
 const load=async()=>++calls;
 now=14;assert.equal(await cache.get('store-a','sync-1',load),1);
 now=15;assert.equal(await cache.get('store-a','sync-1',load),2);
 assert.equal(await cache.get('store-a','sync-2',load),3);
 assert.equal(await cache.get('store-b','sync-2',load),4);
 assert.equal(await cache.get('store-a','sync-2',load,true),5);
});

test('failure is not cached; cleared pending responses never replace a new generation',async()=>{
 const cache=new ThreadSearchCache<number>();let release!:(value:number)=>void;
 await assert.rejects(cache.get('q','r',async()=>{throw Error('upstream');}),/upstream/);
 const old=cache.get('q','r',()=>new Promise(r=>release=r));await Promise.resolve();
 cache.clear();assert.equal(await cache.get('q','r',async()=>2),2);
 release(1);assert.equal(await old,1);assert.equal(await cache.get('q','r',async()=>3),2);
});

test('LRU count and serialized size bound retained snapshots',async()=>{
 let calls=0;const cache=new ThreadSearchCache<number>(15000,2,1024);
 const load=async()=>++calls;
 await cache.get('a','r',load);await cache.get('b','r',load);await cache.get('a','r',load);await cache.get('c','r',load);
 assert.equal(await cache.get('b','r',load),4);
 const small=new ThreadSearchCache<string>(15000,2,4);
 await small.get('large','r',async()=>'long-value');assert.equal(await small.get('large','r',async()=>'new'),'new');
});

test('page and analysis filters reuse snapshots while current states and links are reapplied',async()=>{
 const mails=Array.from({length:205},(_,i)=>({id:i+1,messageId:`<${i+1}@example.test>`,fetchedAt:'2026-01-01',inReplyTo:[],references:[]}));
 let calls=0,completed=1;
 const search=async(args:any)=>{calls++;return {emails:mails.slice(args.offset,args.offset+100),nextOffset:args.offset+100<205?args.offset+100:null};};
 const cache=new ThreadSearchCache<Awaited<ReturnType<typeof scanThreadMails>>>();
 const scan=(args:any)=>cache.get('store-a','revision',()=>scanThreadMails(args,search));
 const summaries=async(ids:number[])=>ids.map(mailId=>({mailId,runCount:1,legacyCount:0,latestStatus:mailId===completed?'completed':'failed'}));
 const first=await searchThreads({limit:30,offset:0},'all',search,summaries,[],scan);
 const next=await searchThreads({limit:30,offset:30},'all',search,summaries,[],scan);
 assert.equal(first.total,205);assert.equal(next.threads.length,30);assert.equal(calls,3);
 assert.equal((await searchThreads({limit:30,offset:0},'completed',search,summaries,[],scan)).threads[0].emails[0].id,1);
 completed=2;assert.equal((await searchThreads({limit:30,offset:0},'completed',search,summaries,[],scan)).threads[0].emails[0].id,2);
 const links=[{id:'link',storeId:'store-a',createdAt:'2026-01-01',source:mails[0],target:mails[1]}];
 assert.equal((await searchThreads({limit:30,offset:0},'all',search,summaries,links,scan)).total,204);
 assert.equal((await searchThreads({limit:30,offset:0},'all',search,summaries,[],scan)).total,205);
 assert.equal(calls,3);
});
