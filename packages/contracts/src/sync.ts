import {z} from 'zod';
export const retryableSyncCodes=new Set(['SYNC_TIMEOUT','POP3_TIMEOUT','POP3_FAILED','SYNC_IN_PROGRESS','SERVER_STOPPING','MESSAGE_RETRIEVAL_FAILED']);
export const syncResponse=z.object({status:z.enum(['success','partial','error']),saved:z.number().int().min(0).max(100),failed:z.number().int().min(0),remaining:z.number().int().min(0).nullable(),errors:z.array(z.string()).max(100).transform(values=>values.map(x=>retryableSyncCodes.has(x)?x:'MCP_ERROR'))}).strict();
export function normalizeSync(value:any){
  const errors=Array.isArray(value?.errors)?value.errors.map((x:any)=>typeof x==='string'?x:x?.code??'MCP_ERROR'):['MCP_ERROR'];
  return syncResponse.parse({status:value.status==='failed'?'error':value.status,saved:value.saved,failed:value.failed,remaining:value.remaining,errors});
}
