import {z} from 'zod';
import {uuid} from './v1.js';
export const historyFilters=z.object({
  sourceId:uuid.optional(),offset:z.coerce.number().int().min(0).default(0),
  mailId:z.coerce.number().int().positive().safe().optional(),query:z.string().max(1000).default(''),
  authorId:uuid.optional(),status:z.enum(['queued','running','completed','needs_input','failed','cancelled']).optional(),
  from:z.string().datetime({offset:true}).optional(),to:z.string().datetime({offset:true}).optional(),
}).strict().refine(x=>!x.mailId||!!x.sourceId,{message:'MAIL_SOURCE_REQUIRED'})
  .refine(x=>!x.from||!x.to||Date.parse(x.from)<=Date.parse(x.to),{message:'INVALID_DATE_RANGE'});
export type HistoryFilters=z.infer<typeof historyFilters>;
