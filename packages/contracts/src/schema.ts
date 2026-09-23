import { z } from 'zod';
export const identitySchema = z.object({
  storeId: z.string().min(1).max(120), mailId: z.number().int().positive(),
  messageId: z.string().max(2000).nullable().default(null), subject: z.string().max(2000).default(''),
});
export const startSchema = identitySchema.extend({
  source: z.enum(['direct', 'web']), requestId: z.string().uuid(),
  parentId: z.string().uuid().optional(), answer: z.string().max(20000).optional(),
});
export const resultSchema = z.object({
  outcome: z.enum(['completed','needs_input']),
  project: z.enum(['gg','gg-fac','d-code','unknown']),
  report: z.string().min(1).max(1_000_000),
  question: z.string().max(20000),
  knowledge: z.string().max(100000),
  evidence: z.array(z.object({ kind: z.enum(['mail','db','code','document']), reference: z.string().max(3000), verified: z.boolean() })).max(300),
}).refine(x => x.outcome !== 'needs_input' || x.question.trim().length > 0, { message: '확인 필요 상태에는 질문이 필요합니다.' });
export const resultJsonSchema = {
  type:'object', additionalProperties:false,
  properties:{
    outcome:{type:'string',enum:['completed','needs_input']},
    project:{type:'string',enum:['gg','gg-fac','d-code','unknown']},
    report:{type:'string'}, question:{type:'string'}, knowledge:{type:'string'},
    evidence:{type:'array',items:{type:'object',additionalProperties:false,properties:{
      kind:{type:'string',enum:['mail','db','code','document']},reference:{type:'string'},verified:{type:'boolean'}
    },required:['kind','reference','verified']}}
  },required:['outcome','project','report','question','knowledge','evidence']
};
