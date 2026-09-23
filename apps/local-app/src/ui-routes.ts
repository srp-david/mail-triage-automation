import {createHash} from 'node:crypto';
import type express from 'express';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {ApiError,uuid} from '../../../packages/contracts/src/v1.js';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import type {MailSource} from './source-client.js';
import {analysisStatus,searchByAnalysis} from './mail-search.js';
import {searchThreads,scanThreadMails} from './mail-threads.js';
import {ThreadSearchCache} from './thread-cache.js';
import {attachmentDownload} from './attachments.js';
// cacheScope is backend-only and binds snapshots to the authenticated user and MCP instance/endpoint.
export type LocalSelection={sourceId:string;cacheScope?:string;collectionId?:string;runnerId?:string;agent:'codex'|'claude';original?:MailSource};
export interface LocalUiContext {
  selection():Promise<LocalSelection>;
  configure(input:unknown):Promise<unknown>;
  registerSource(input:unknown):Promise<unknown>;
  registerRunner(input:unknown):Promise<unknown>;
  status():Promise<unknown>;
  environment?():{mailConfigured:boolean;agents:('codex'|'claude')[];evidenceRootCount:number;dbConfigured:boolean};
}
const number=z.coerce.number().int().positive().safe();
function original(s:LocalSelection){if(!s.original)throw new ApiError(409,'ORIGINAL_UNAVAILABLE');return s.original;}
function identity(mail:any,expected?:{id:number;messageId?:string|null;fetchedAt?:string}){
  const value=z.object({id:number,messageId:z.string().max(4000).nullable(),fetchedAt:z.string().min(1).max(100),subject:z.string().max(10000)}).parse({...mail,messageId:mail.messageId??null});
  if(expected&&(value.id!==expected.id||expected.messageId!==undefined&&value.messageId!==expected.messageId||expected.fetchedAt!==undefined&&value.fetchedAt!==expected.fetchedAt))throw new ApiError(409,'MAIL_IDENTITY_CHANGED');return value;
}
const present=(r:any,selection:LocalSelection)=>({...r,store_id:r.sourceId??selection.sourceId,mail_id:r.mailId,message_id:r.messageId,identity_kind:r.identityKind,handled_at:r.handledAt,created_at:r.createdAt,started_at:r.startedAt,finished_at:r.finishedAt,progress_events:r.progress,source:r.agent==='unknown'?'legacy':'web',
  relatedMails:r.relatedMails?.map((x:any)=>({...x,store_id:r.sourceId,available:!!selection.original&&r.sourceId===selection.sourceId&&x.store_id===r.storeId}))});
export function localUiRoutes(app:express.Express,h:HistoryClient,context:LocalUiContext){
  const threadCache=new ThreadSearchCache<Awaited<ReturnType<typeof scanThreadMails>>>();
  const summaries=(sourceId:string,ids:number[])=>h.request<any[]>('/sources/'+sourceId+'/mail-analysis',{mailIds:ids}).then(x=>x??[]);
  app.get('/api/status',async(_req,res)=>res.json(await context.status()));
  app.get('/api/sources',async(_req,res)=>res.json(await h.request('/sources')));
  app.post('/api/sources',async(req,res)=>res.json(await context.registerSource(req.body)));
  app.get('/api/settings',async(_req,res)=>{const s=await context.selection();res.json({sourceId:s.sourceId,collectionId:s.collectionId,runnerId:s.runnerId,agent:s.agent,originalAvailable:!!s.original,...(context.environment?{environment:context.environment()}:{})});});
  app.post('/api/settings',async(req,res)=>res.json(await context.configure(req.body)));
  app.post('/api/runners',async(req,res)=>res.json(await context.registerRunner(req.body)));
  for(const name of ['runners','members','collections'])app.get('/api/'+name,async(_req,res)=>res.json(await h.request('/'+name)));
  app.post('/api/collections',async(req,res)=>res.json(await h.request('/collections',req.body)));
  for(const name of ['sources','collections'])app.post('/api/'+name+'/:id/grants',async(req,res)=>res.json(await h.request('/'+name+'/'+uuid.parse(req.params.id)+'/grants',req.body)));
  app.post('/api/runners/:id/revoke',async(req,res)=>res.json(await h.request('/runners/'+uuid.parse(req.params.id)+'/revoke',{})));
  app.get('/api/runs',async(req,res)=>{const s=await context.selection(),q=z.object({offset:z.coerce.number().int().min(0).default(0),mailId:number.optional()}).parse(req.query);res.json((await h.request<any[]>('/runs',undefined,undefined,{query:{sourceId:uuid.parse(s.sourceId),offset:String(q.offset),...(q.mailId?{mailId:String(q.mailId)}:{})}}))!.map(r=>present(r,s)));});
  app.get('/api/runs/:id',async(req,res)=>res.json(present(await h.get(uuid.parse(req.params.id)),await context.selection())));
  app.post('/api/runs',async(req,res)=>{
    const b=z.object({storeId:uuid,mailId:number,messageId:z.string().nullable().optional(),requestId:uuid,parentId:uuid.optional(),answer:z.string().max(20000).optional()}).parse(req.body),s=await context.selection();
    if(b.storeId!==s.sourceId)throw new ApiError(409,'SOURCE_CHANGED');if(!s.runnerId)throw new ApiError(409,'RUNNER_REQUIRED');
    const mail=identity(await original(s).call('get_email',{id:b.mailId,body_limit:1}),{id:b.mailId,messageId:b.messageId});
    res.status(201).json(await h.start({sourceId:s.sourceId,mailId:b.mailId,messageId:mail.messageId,subject:mail.subject,requestId:b.requestId,runnerId:s.runnerId,agent:s.agent,executorKind:'local',verifiedAt:new Date().toISOString(),parentId:b.parentId,answer:b.answer}));
  });
  for(const action of ['handling','reviews','cancel'])app.post('/api/runs/:id/'+action,async(req,res)=>res.json(await h.request('/runs/'+uuid.parse(req.params.id)+'/'+action,req.body)));
  app.get('/api/runs/:id/export',async(req,res)=>{const r=await h.get(uuid.parse(req.params.id));if(!r.result)throw new ApiError(409,'NO_REPORT');const body=r.result.report+r.reviews.map((x:any)=>'\n\n## '+(x.authorDisplay??x.author)+' 리뷰\n\n'+x.body).join('');res.set('X-Report-SHA256',createHash('sha256').update(body).digest('hex')).type('text/markdown').send(body);});
  app.get('/api/legacy',async(req,res)=>{const s=await context.selection(),q=z.object({mailId:number.optional(),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
    if(q.mailId)return res.json(await h.request('/sources/'+uuid.parse(s.sourceId)+'/mails/'+q.mailId+'/legacy'));
    res.json(s.collectionId?await h.request('/collections/'+s.collectionId+'/documents',undefined,undefined,{query:{offset:String(q.offset)}}):[]);
  });
  app.get('/api/legacy/:id',async(req,res)=>res.json(await h.request('/legacy/'+uuid.parse(req.params.id))));
  app.post('/api/legacy/:id/link',async(req,res)=>{const s=await context.selection(),b=z.object({mailId:number,messageId:z.string(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.body),mail=identity(await original(s).call('get_email',{id:b.mailId,body_limit:1}),{id:b.mailId,messageId:b.messageId});res.json(await h.request('/legacy/'+uuid.parse(req.params.id)+'/link',{...b,sourceId:s.sourceId,subject:mail.subject,verifiedAt:new Date().toISOString()}));});
  app.get('/api/mail-analysis',async(req,res)=>{const ids=z.string().max(2000).regex(/^\d+(,\d+)*$/).transform(x=>x.split(',').map(Number)).pipe(z.array(z.number().int().positive().safe()).max(100)).parse(req.query.mailIds);res.json(await summaries((await context.selection()).sourceId,ids));});
  app.get('/api/mails',async(req,res)=>{const s=await context.selection(),m=original(s),args=z.object({query:z.string().max(1000).optional(),from_address:z.string().max(320).optional(),sent_after:z.string().datetime({offset:true}).optional(),sent_before:z.string().datetime({offset:true}).optional(),limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query),status=analysisStatus.default('all').parse(req.query.analysis_status);
    const search=(args:any)=>m.call('search_emails',args),summary=(ids:number[])=>summaries(s.sourceId,ids);
    if(req.query.view!=='threads'){res.json(await searchByAnalysis(args,status,search,summary));return;}
    const refresh=z.enum(['1']).optional().parse(req.query.refresh)==='1';
    // Always recheck source access, current links and sync state, including cache hits.
    const [links,sync]=await Promise.all([h.request<any[]>('/sources/'+s.sourceId+'/thread-links'),h.request<any>('/sources/'+s.sourceId+'/sync-latest')]);
    const revision=JSON.stringify([s.cacheScope,s.sourceId,sync?.id,sync?.status,sync?.saved,sync?.batch_count,sync?.finished_at]);
    if(refresh)threadCache.clear();
    const scan=(conditions:typeof args)=>{
      const load=()=>m.withSearch?m.withSearch(search=>scanThreadMails(conditions,search)):scanThreadMails(conditions,search);
      if(!s.cacheScope)return load();
      const key=JSON.stringify([s.cacheScope,s.sourceId,conditions.query??'',conditions.from_address??'',conditions.sent_after??'',conditions.sent_before??'']);
      return threadCache.get(key,revision,load);
    };
    res.json(await searchThreads(args,status,search,summary,links??[],scan));
  });
  app.get('/api/mails/:id',async(req,res)=>res.json(await original(await context.selection()).full(number.parse(req.params.id))));
  app.get('/api/mails/:id/body',async(req,res)=>res.json(await original(await context.selection()).call('get_email_html',{id:number.parse(req.params.id)})));
  app.get('/api/mails/:id/attachments/:attachment',async(req,res)=>res.json(await original(await context.selection()).attachment(number.parse(req.params.id),z.string().max(2000).parse(req.params.attachment))));
  app.get('/api/mails/:id/attachments/:attachment/download',async(req,res)=>{const id=number.parse(req.params.id),attachment=z.string().max(2000).parse(req.params.attachment),file=attachmentDownload(await original(await context.selection()).attachment(id,attachment),id,attachment);res.attachment(file.filename).type('application/octet-stream').send(file.data);});
  app.get('/api/thread-links',async(_req,res)=>res.json(await h.request('/sources/'+(await context.selection()).sourceId+'/thread-links')));
  app.post('/api/thread-links',async(req,res)=>{const s=await context.selection(),b=z.object({storeId:uuid,source:z.object({id:number,messageId:z.string().nullable(),fetchedAt:z.string()}),target:z.object({id:number,messageId:z.string().nullable(),fetchedAt:z.string()})}).parse(req.body);if(s.sourceId!==b.storeId)throw new ApiError(409,'SOURCE_CHANGED');
    const [source,target]=await Promise.all([b.source,b.target].map(async e=>identity(await original(s).call('get_email',{id:e.id,body_limit:1}),e)));res.json(await h.request('/sources/'+s.sourceId+'/thread-links',{source,target,verifiedAt:new Date().toISOString()}));
  });
  app.post('/api/thread-links/detach',async(req,res)=>{const s=await context.selection(),{storeId,...body}=z.object({storeId:uuid,mail:z.object({id:number,messageId:z.string().nullable(),fetchedAt:z.string()}),linkIds:z.array(uuid).min(1).max(1000)}).strict().parse(req.body);if(storeId!==s.sourceId)throw new ApiError(409,'SOURCE_CHANGED');res.json(await h.request('/sources/'+s.sourceId+'/thread-links/detach',body));});
  app.post('/api/thread-links/:id/unlink',async(req,res)=>{const s=await context.selection();if(req.body.storeId!==s.sourceId)throw new ApiError(409,'SOURCE_CHANGED');res.json(await h.request('/sources/'+s.sourceId+'/thread-links/'+uuid.parse(req.params.id)+'/unlink',{}));});
  app.post('/api/runs/:id/related-mails',async(req,res)=>{const s=await context.selection(),id=uuid.parse(req.params.id),r=await h.get(id),b=z.object({storeId:uuid,mailId:number,messageId:z.string()}).parse(req.body);if(r.sourceId!==s.sourceId||b.storeId!==s.sourceId)throw new ApiError(409,'SOURCE_CHANGED');const mail=identity(await original(s).call('get_email',{id:b.mailId,body_limit:1}),{id:b.mailId,messageId:b.messageId});res.json(await h.request('/runs/'+id+'/related-mails',{mail,verifiedAt:new Date().toISOString()}));});
  app.get('/api/runs/:id/related-mails/:linkId',async(req,res)=>{const s=await context.selection(),r=await h.get(uuid.parse(req.params.id));if(r.sourceId!==s.sourceId)throw new ApiError(409,'ORIGINAL_UNAVAILABLE');const link=r.relatedMails.find((x:any)=>x.id===uuid.parse(req.params.linkId));if(!link)throw new ApiError(404,'LINK_NOT_FOUND');const mail=await original(s).full(Number(link.mail_id));identity(mail,{id:Number(link.mail_id),messageId:link.message_id});res.json(mail);});
  app.post('/api/runs/:id/related-mails/:linkId/unlink',async(req,res)=>res.json(await h.request('/runs/'+uuid.parse(req.params.id)+'/related-mails/'+uuid.parse(req.params.linkId)+'/unlink',{})));
  app.post('/api/sync',async(_req,res)=>{const s=await context.selection();original(s);if(!s.runnerId)throw new ApiError(409,'RUNNER_REQUIRED');res.status(202).json(await h.request('/sync-runs',{sourceId:s.sourceId,runnerId:s.runnerId,requestId:randomUUID()}));});
  app.post('/api/sync/:id/stop',async(req,res)=>res.json(await h.request('/sync-runs/'+uuid.parse(req.params.id)+'/stop',{})));
}
