import {test,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {askReport} from '../apps/local-app/src/report-questions.js';
test('question outbox retries delivery without executing AI twice or switching owners',async()=>{
 const data=new Map(),receipts={async read(k:string){if(!data.has(k))throw Object.assign(Error(),{code:'ENOENT'});return data.get(k);},async write(k:string,v:any){data.set(k,v);}};
 let admitted=false,executions=0,deliveries=0;
 const history:any={async request(path:string){if(path.endsWith('/questions')){const execute=!admitted;admitted=true;return {id:'job',status:'running',execute,context:{report:'Snapshot'}};}deliveries++;if(deliveries===1)throw Error('Lost response');return {status:'completed'};}};
 const executor={async execute(){executions++;return {report:'Answer'};}};
 const request={requestId:randomUUID(),agent:'codex',expectedVersion:1,question:'Explain',allowEvidence:false};
 const call=()=>askReport(history,receipts,executor,'a','runner','secret','report',request,new AbortController().signal);
 await expect(call()).rejects.toThrow('Lost response');expect(executions).toBe(1);
 expect(await call()).toEqual({status:'completed'});expect(executions).toBe(1);
 await expect(askReport(history,receipts,executor,'b','runner','secret','report',request,new AbortController().signal)).rejects.toThrow('REQUEST_CONFLICT');
});
