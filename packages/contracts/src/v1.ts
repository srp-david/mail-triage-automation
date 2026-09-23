import {z} from 'zod';
import {resultSchema} from './schema.js';
export {resultSchema};
export const contractVersion='1' as const;
export const uuid=z.string().uuid();
export const runInput=z.object({
  sourceId:uuid,mailId:z.number().int().positive().safe(),messageId:z.string().max(2000).nullable(),
  subject:z.string().max(2000),requestId:uuid,runnerId:uuid,
  agent:z.enum(['codex','claude']),executorKind:z.literal('local').default('local'),
  verifiedAt:z.string().datetime(),parentId:uuid.optional(),answer:z.string().max(20000).optional(),
}).strict();
export type RunInput=z.infer<typeof runInput>;
export type Principal={userId:string;sessionId?:string};
export type Lease={runnerId:string;leaseToken:string;generation:number};
export const leaseSchema=z.object({runnerId:uuid,leaseToken:z.string().min(32).max(200),generation:z.number().int().positive()});
export const completionSchema=leaseSchema.extend({requestId:uuid,result:resultSchema}).strict();
export const runFailureCode=z.enum(['AGENT_FAILED','TIMEOUT','CANCELLED','SOURCE_CHANGED','NETWORK_ERROR','AUTH_REJECTED','APP_STOPPED','LEASE_EXPIRED']);
export type RunFailureCode=z.infer<typeof runFailureCode>;
export type Completion=z.infer<typeof completionSchema>;
export class ApiError extends Error {
  constructor(public status:number,public code:string,public upstreamRequestId?:string){super(code);}
}
