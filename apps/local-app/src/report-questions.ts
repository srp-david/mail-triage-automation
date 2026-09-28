import {z} from 'zod';
import {ApiError,uuid} from '../../../packages/contracts/src/v1.js';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import type {Executor,ReceiptStore} from '../../../packages/runner/src/runner.js';
export async function askReport(history:HistoryClient,receipts:ReceiptStore,executor:Executor,actorId:string,runnerId:string,device:string,reportId:string,input:unknown,signal:AbortSignal){
 const b=z.object({requestId:uuid,agent:z.enum(['codex','claude']),expectedVersion:z.number().int().positive(),question:z.string().trim().min(1).max(20000),allowEvidence:z.boolean()}).strict().parse(input);
 const key='report-question-'+b.requestId,request={...b,runnerId};
 let receipt:any;try{receipt=await receipts.read(key);}catch(e:any){if(e.code!=='ENOENT')throw e;}
 if(receipt&&(receipt.actorId!==actorId||receipt.reportId!==reportId||JSON.stringify(receipt.request)!==JSON.stringify(request)))throw new ApiError(409,'REQUEST_CONFLICT');
 if(!receipt){receipt={actorId,reportId,request,state:'pending'};await receipts.write(key,receipt);}
 // Register/revalidate ACL even for an outbox retry. Never replay a possibly executed agent.
 const job=await history.request('/reports/'+reportId+'/questions',request,device);
 if(job.status==='completed')return {id:job.id,status:job.status};
 if(receipt.state==='outbox'){
  const result=await history.request('/report-questions/'+job.id+'/result',{result:receipt.result},device);
  await receipts.write(key,{...receipt,state:'saved'});return result;
 }
 if(!job.execute)throw new ApiError(409,'QUESTION_EXECUTION_UNCERTAIN');
 try{
  await receipts.write(key,{...receipt,state:'running'});
  const result=await executor.execute({reportOnly:true,agent:b.agent,reportContext:job.context,answer:b.question,allowEvidence:b.allowEvidence},signal);
  signal.throwIfAborted();receipt={...receipt,state:'outbox',result};await receipts.write(key,receipt);
 }catch(error){await history.request('/report-questions/'+job.id+'/fail',{},device).catch(()=>{});throw error;}
 const result=await history.request('/report-questions/'+job.id+'/result',{result:receipt.result},device);
 await receipts.write(key,{...receipt,state:'saved'});return result;
}
