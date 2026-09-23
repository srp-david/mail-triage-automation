import {test} from 'vitest';
import assert from 'node:assert/strict';
import {analysisStatus,matchesAnalysis,searchByAnalysis} from '../src/mail-search.js';

test('latest status is independent of handled state and legacy-only is not unanalysed',()=>{
 const failed={mailId:1,runCount:2,legacyCount:0,latestStatus:'failed',handledAt:'2026-09-17'};
 assert.ok(matchesAnalysis('failed',failed));assert.ok(!matchesAnalysis('completed',failed));assert.ok(matchesAnalysis('handled',failed));
 for(const status of ['queued','running','needs_input','completed','failed'] as const){
  const row={...failed,latestStatus:status};assert.ok(matchesAnalysis(status,row));
 }
 const legacy={mailId:2,runCount:0,legacyCount:1,latestStatus:null};
 assert.ok(matchesAnalysis('legacy',legacy));assert.ok(!matchesAnalysis('unanalysed',legacy));assert.ok(!matchesAnalysis('completed',legacy));
 assert.ok(matchesAnalysis('unanalysed'));assert.ok(matchesAnalysis('unanalysed',{...legacy,legacyCount:0}));
 assert.ok(!analysisStatus.safeParse('invalid').success);
});

test('filter searches beyond upstream page, preserves conditions and paginates filtered total',async()=>{
 const args={query:'needle',from_address:'sender@example.test',sent_after:'2026-01-01T00:00:00Z',limit:2,offset:1};
 const all=Array.from({length:205},(_,i)=>({id:i+1}));const wanted=new Set([2,102,202,205]);const calls:number[]=[];
 const search=async(a:typeof args)=>{assert.equal(a.query,args.query);assert.equal(a.from_address,args.from_address);assert.equal(a.sent_after,args.sent_after);assert.equal(a.limit,100);calls.push(a.offset);return {emails:all.slice(a.offset,a.offset+a.limit),nextOffset:a.offset+100<205?a.offset+100:null,lastSync:{status:'success'}};};
 const summaries=async(ids:number[])=>ids.filter(id=>wanted.has(id)).map(mailId=>({mailId,runCount:1,legacyCount:0,latestStatus:'completed'}));
 const page=await searchByAnalysis(args,'completed',search as any,summaries);
 assert.deepEqual(page.emails.map(x=>x.id),[102,202]);assert.equal(page.total,4);assert.equal(page.nextOffset,3);assert.deepEqual(calls,[0,100,200]);
 const last=await searchByAnalysis({...args,offset:3},'completed',search as any,summaries);assert.deepEqual(last.emails,[{id:205}]);assert.equal(last.nextOffset,null);
 const empty=await searchByAnalysis({...args,offset:0},'failed',search as any,summaries);assert.equal(empty.total,0);assert.deepEqual(empty.emails,[]);assert.equal(empty.nextOffset,null);
 const fresh=await searchByAnalysis({...args,offset:0},'unanalysed',search as any,summaries);assert.equal(fresh.total,201);assert.deepEqual(fresh.emails,[{id:1},{id:3}]);
});

test('all delegates unchanged; broken pages and partial failures cannot masquerade as complete results',async()=>{
 const args={limit:30,offset:30};const response={emails:[{id:31}],total:50,nextOffset:null};
 assert.equal(await searchByAnalysis(args,'all',async a=>{assert.deepEqual(a,args);return response;},async()=>{throw Error('not needed');}),response);
 await assert.rejects(searchByAnalysis(args,'completed',async()=>({emails:[{id:1}],nextOffset:0}),async()=>[]),/진행되지/);
 await assert.rejects(searchByAnalysis(args,'completed',async a=>{if(a.offset)throw Error('upstream unavailable');return {emails:[{id:1}],nextOffset:100};},async()=>[]),/upstream unavailable/);
});
