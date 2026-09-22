import express from 'express';
import {readFile} from 'node:fs/promises';
import {sendUiDocument} from '../packages/ui/security.js';
import { z } from 'zod';
import { config, HttpError } from './config.js';
import { pool, migrate } from './db.js';
import { addReview, expireRuns, failRun, finishRun, getRun, heartbeat, listRuns, mailAnalysis, sameSecret, startRun, startExternalRun, recoverResult, setMailHandled } from './history.js';
import { importLegacy, listLegacy, getLegacy, linkLegacy, registerExternal, prepareKnowledge, getKnowledge, claimKnowledge, completeKnowledge, hashSchema } from './archive.js';
import { callMail, fullMail, withMcp, callAttachment, withMailSearch } from './mcp.js';
import { attachmentDownload } from './attachments.js';
import { startSchema } from './schema.js';
import { startSync, stopSync, recoverSync, startSyncScheduler } from './sync.js';
import { addRelatedMail, getRelatedMail, unlinkRelatedMail, relatedSource } from './related.js';
import { analysisStatus, searchByAnalysis } from './mail-search.js';
import { searchThreads, scanThreadMails } from './mail-threads.js';
import {ThreadSearchCache} from './thread-cache.js';
import {threadLinkStore,threadMailIdentity,verifyThreadMail} from './thread-links.js';
export function createApp(mailCall = callMail, mailRead = fullMail, attachmentRead = callAttachment, links = threadLinkStore,
  threadRevision=async()=>JSON.stringify((await pool.query('SELECT id,status,saved,batch_count,finished_at FROM sync_run ORDER BY started_at DESC LIMIT 1')).rows[0]??null)) {
  if(config.token.length<32) throw new Error('TRIAGE_TOKEN must have at least 32 characters');
  const app=express(); app.disable('x-powered-by');
  const threadCache=new ThreadSearchCache<Awaited<ReturnType<typeof scanThreadMails>>>();
  app.use((req,res,next)=>{
    // Only the packaged Office renderer permits WASM. The app document adds nonce-bound MUI styles below.
    // Document assets stay local; remote images/fonts/frames and form navigation are blocked.
    const preview=req.path.startsWith('/preview/');
    const csp=preview
      ? "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src data: blob:; font-src data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
      : "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'";
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp});next();
  });
  app.use(express.json({limit:'2mb'}));
  app.get('/health',async(_req,res)=>{await pool.query('SELECT 1');res.json({ok:true});});
  app.use('/api',(req,res,next)=>{
    // Reject cross-site browser requests; same-origin UI and authenticated CLI remain available.
    if(req.get('sec-fetch-site')==='cross-site') return res.status(403).json({error:'다른 사이트에서의 요청은 허용하지 않습니다.'});
    const origin=req.get('origin');
    if(origin && origin!==req.protocol+'://'+req.get('host')) return res.status(403).json({error:'요청 출처가 다릅니다.'});
    if(req.path==='/login') return next();
    const cookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('triage='));
    const credential=req.get('authorization')?.replace(/^Bearer /,'')??cookie?.slice(7)??'';
    if(!sameSecret(credential,config.token)) return res.status(401).json({error:'접속 토큰이 필요합니다.'});
    next();
  });
  app.post('/api/login',(req,res)=>{
    if(typeof req.body.token!=='string'||!sameSecret(req.body.token,config.token)) return res.status(401).json({error:'토큰이 일치하지 않습니다.'});
    res.cookie('triage',config.token,{httpOnly:true,sameSite:'strict',maxAge:8*3600*1000,path:'/api'});
    res.json({ok:true});
  });
  app.post('/api/logout',(_req,res)=>{res.clearCookie('triage',{path:'/api'});res.json({ok:true});});
  app.get('/api/status',async(_req,res)=>{
    res.json({storeId:config.store,sync:(await pool.query('SELECT * FROM sync_run ORDER BY started_at DESC LIMIT 1')).rows[0]??null,
      worker:(await pool.query("SELECT *,seen_at>now()-interval '90 seconds' AS online FROM worker_state WHERE name='codex'")).rows[0]??null});
  });
  app.get('/api/connections',async(_req,res)=>{
    const results=await Promise.allSettled([config.mailUrl,config.dbUrl].map(url=>withMcp(url,async c=>(await c.listTools()).tools.map(t=>t.name))));
    res.json(Object.fromEntries(results.map((r,i)=>[i===0?'mail':'db',r.status==='fulfilled'?{ok:true,tools:r.value}:{ok:false,error:'연결 실패'}])));
  });
  app.get('/api/mails',async(req,res)=>{
    const args=z.object({query:z.string().max(1000).optional(),from_address:z.string().max(320).optional(),
      sent_after:z.string().datetime({offset:true}).optional(),sent_before:z.string().datetime({offset:true}).optional(),
      limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
    const status=analysisStatus.default('all').parse(req.query.analysis_status);
    const view=z.enum(['individual','threads']).default('individual').parse(req.query.view);
    const search=(args:any)=>mailCall('search_emails',args),summaries=(ids:number[])=>mailAnalysis(config.store,ids);
    if(view==='individual'){res.json(await searchByAnalysis(args,status,search,summaries));return;}
    const refresh=z.enum(['1']).optional().parse(req.query.refresh)==='1';
    // Reading the shared revision also detects sync batches completed by another process.
    const [relations,revision]=await Promise.all([links.list(config.store),threadRevision()]);
    if(refresh)threadCache.clear();
    const scan=(conditions:typeof args)=>{
      const key=JSON.stringify([config.store,conditions.query??'',conditions.from_address??'',conditions.sent_after??'',conditions.sent_before??'']);
      return threadCache.get(key,revision,()=>mailCall===callMail
        ?withMailSearch(search=>scanThreadMails(conditions,search))
        :scanThreadMails(conditions,search));
    };
    res.json(await searchThreads(args,status,search,summaries,relations,scan));
  });
  app.get('/api/thread-links',async(_req,res)=>res.json(await links.list(config.store)));
  app.post('/api/thread-links',async(req,res)=>{
    const input=z.object({storeId:z.string().min(1).max(200),source:threadMailIdentity,target:threadMailIdentity}).strict().parse(req.body);
    if(input.storeId!==config.store)throw new HttpError(409,'현재 메일 저장소가 아닙니다. 목록을 다시 조회하세요.');
    if(input.source.id===input.target.id)throw new HttpError(400,'같은 메일에 연결할 수 없습니다.');
    const [source,target]=await Promise.all([input.source,input.target].map(async identity=>verifyThreadMail(identity,await mailCall('get_email',{id:identity.id,body_limit:1}))));
    res.json(await links.add(config.store,source,target));
  });
  app.post('/api/thread-links/detach',async(req,res)=>{
    const input=z.object({storeId:z.string().min(1).max(200),mail:threadMailIdentity,linkIds:z.array(z.string().uuid()).min(1).max(1000)}).strict().parse(req.body);
    if(input.storeId!==config.store)throw new HttpError(409,'현재 메일 저장소가 아닙니다.');
    res.json(await links.detach(config.store,input.mail,[...new Set(input.linkIds)]));
  });
  app.post('/api/thread-links/:id/unlink',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id),input=z.object({storeId:z.string().min(1).max(200)}).strict().parse(req.body);
    if(input.storeId!==config.store)throw new HttpError(409,'현재 메일 저장소가 아닙니다.');
    res.json(await links.remove(config.store,id));
  });
  app.get('/api/mail-analysis',async(req,res)=>{
    const ids=z.string().max(2000).regex(/^\d+(,\d+)*$/).transform(value=>value.split(',').map(Number))
      .pipe(z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(100)).parse(req.query.mailIds);
    res.json(await mailAnalysis(config.store,[...new Set(ids)]));
  });
  app.get('/api/mails/:id',async(req,res)=>res.json(await mailRead(z.coerce.number().int().positive().parse(req.params.id))));
  app.get('/api/mails/:id/body',async(req,res)=>{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    res.json(await mailCall('get_email_html',{id}));
  });
  app.get('/api/mails/:id/attachments/:attachment',async(req,res)=>{
    const email_id=z.coerce.number().int().positive().parse(req.params.id);
    const attachment_id=z.string().min(1).max(2000).parse(req.params.attachment);
    // Return JSON content blocks; the UI never executes embedded HTML/resources.
    res.json(await attachmentRead(email_id,attachment_id));
  });
  app.get('/api/mails/:id/attachments/:attachment/download',async(req,res)=>{
    const emailId=z.coerce.number().int().positive().parse(req.params.id);
    const attachmentId=z.string().min(1).max(2000).parse(req.params.attachment);
    const file=attachmentDownload(await attachmentRead(emailId,attachmentId),emailId,attachmentId);
    res.attachment(file.filename).type('application/octet-stream').send(file.data);
  });
  app.post('/api/sync',async(_req,res)=>res.status(202).json(await startSync()));
  app.post('/api/runs/:id/related-mails',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const b=z.object({storeId:z.string(),mailId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),messageId:z.string().min(1).max(4000)}).strict().parse(req.body);
    const source=await relatedSource(id);
    if(b.storeId!==config.store||source.store_id!==config.store)throw new HttpError(409,'현재 MCP 저장소가 아닙니다.');
    if(!source.handled_at)throw new HttpError(409,'처리 완료한 뒤 관련 메일을 연결하세요.');
    const mail=await mailCall('get_email',{id:b.mailId,body_limit:1});
    res.json(await addRelatedMail(id,b.storeId,b.mailId,b.messageId,mail));
  });
  app.get('/api/runs/:id/related-mails/:linkId',async(req,res)=>{
    const link=await getRelatedMail(z.string().uuid().parse(req.params.id),z.string().uuid().parse(req.params.linkId));
    const mail=await mailRead(Number(link.mail_id));
    if(Number(mail.id)!==Number(link.mail_id)||mail.messageId!==link.message_id)throw new HttpError(409,'연결한 원본 메일의 식별자가 변경되어 열 수 없습니다.');
    res.json(mail);
  });
  app.post('/api/runs/:id/related-mails/:linkId/unlink',async(req,res)=>{
    res.json(await unlinkRelatedMail(z.string().uuid().parse(req.params.id),z.string().uuid().parse(req.params.linkId)));
  });
  app.post('/api/runs/:id/handling',async(req,res)=>{
    const {completed}=z.object({completed:z.boolean()}).strict().parse(req.body);
    res.json(await setMailHandled(z.string().uuid().parse(req.params.id),completed));
  });
  app.post('/api/sync/:id/stop',async(req,res)=>res.json(await stopSync(z.string().uuid().parse(req.params.id))));
  app.get('/api/legacy',async(req,res)=>{
    const q=z.object({storeId:z.string().optional(),mailId:z.coerce.number().int().positive().optional(),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
    res.json(await listLegacy(q.storeId,q.mailId,q.offset));
  });
  app.post('/api/legacy',async(req,res)=>res.status(201).json(await importLegacy(req.body)));
  app.get('/api/legacy/:id',async(req,res)=>res.json(await getLegacy(z.string().uuid().parse(req.params.id))));
  app.post('/api/legacy/:id/link',async(req,res)=>{
    const b=z.object({hash:hashSchema,storeId:z.string(),mailId:z.number().int().positive(),messageId:z.string().min(1),verifiedBy:z.string().min(1).max(200)}).parse(req.body);
    if(b.storeId!==config.store)throw new HttpError(400,'현재 MCP 저장소가 아닙니다.');
    const mail=await mailCall('get_email',{id:b.mailId,body_limit:1});
    if(mail.messageId!==b.messageId)throw new HttpError(409,'실제 메일과 검토한 식별자가 다릅니다.');
    res.json(await linkLegacy(z.string().uuid().parse(req.params.id),b.hash,{...b,subject:mail.subject},b.verifiedBy));
  });
  app.post('/api/external-mails',async(req,res)=>res.status(201).json(await registerExternal(req.body)));
  app.post('/api/external-mails/:id/runs',async(req,res)=>{
    const b=z.object({requestId:z.string().uuid(),parentId:z.string().uuid().optional(),answer:z.string().max(20000).optional()}).parse(req.body);
    res.status(201).json(await startExternalRun(z.string().uuid().parse(req.params.id),b.requestId,b.parentId,b.answer));
  });
  app.post('/api/runs/:id/recover-result',async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const b=z.object({ownerToken:z.string().min(1),requestId:z.string().uuid(),revalidated:z.literal(true),result:z.unknown()}).parse(req.body);
    const old=await getRun(id);
    if(old.identity_kind==='mcp'){
      if(old.store_id!==config.store)throw new HttpError(409,'현재 MCP 저장소와 복구 대상이 다릅니다.');
      const mail=await mailCall('get_email',{id:Number(old.mail_id),body_limit:1});
      if(mail.messageId!==old.message_id)throw new HttpError(409,'복구 대상 메일의 식별자가 변경되었습니다.');
    }
    res.json(await recoverResult(id,b.ownerToken,b.result,b.requestId));
  });
  app.post('/api/knowledge',async(req,res)=>res.status(201).json(await prepareKnowledge(req.body)));
  app.get('/api/knowledge/:id',async(req,res)=>res.json(await getKnowledge(z.string().uuid().parse(req.params.id))));
  app.post('/api/knowledge/:id/claim',async(req,res)=>res.json(await claimKnowledge(z.string().uuid().parse(req.params.id))));
  app.post('/api/knowledge/:id/complete',async(req,res)=>{
    const b=z.object({ownerToken:z.string().min(1),hash:hashSchema}).parse(req.body);
    res.json(await completeKnowledge(z.string().uuid().parse(req.params.id),b.ownerToken,b.hash));
  });
  app.get('/api/runs',async(req,res)=>{
    const q=z.object({storeId:z.string().optional(),mailId:z.coerce.number().int().positive().optional(),offset:z.coerce.number().int().min(0).default(0)}).parse(req.query);
    res.json(await listRuns(q.storeId,q.mailId,q.offset));
  });
  app.post('/api/runs',async(req,res)=>{
    const input=startSchema.parse(req.body);
    if(input.storeId!==config.store) throw new HttpError(400,'현재 연결된 MCP 저장소가 아닙니다.');
    const mail=await mailCall('get_email',{id:input.mailId,body_limit:1});
    if(mail.messageId!==input.messageId) throw new HttpError(409,'선택한 메일의 Message-ID가 일치하지 않습니다.');
    res.status(201).json(await startRun({...input,subject:mail.subject}));
  });
  app.get('/api/runs/:id',async(req,res)=>res.json(await getRun(z.string().uuid().parse(req.params.id))));
  app.post('/api/runs/:id/heartbeat',async(req,res)=>{
    await heartbeat(z.string().uuid().parse(req.params.id),z.string().min(1).parse(req.body.ownerToken));res.json({ok:true});
  });
  app.post('/api/runs/:id/result',async(req,res)=>res.json(await finishRun(z.string().uuid().parse(req.params.id),z.string().min(1).parse(req.body.ownerToken),req.body.result)));
  app.post('/api/runs/:id/fail',async(req,res)=>{
    await failRun(z.string().uuid().parse(req.params.id),z.string().min(1).parse(req.body.ownerToken),z.string().min(1).max(2000).parse(req.body.error));res.json({ok:true});
  });
  app.post('/api/runs/:id/reviews',async(req,res)=>{
    const b=z.object({requestId:z.string().uuid(),author:z.string().min(1).max(100),body:z.string().min(1).max(500000)}).parse(req.body);
    res.status(201).json({id:await addReview(z.string().uuid().parse(req.params.id),b.requestId,b.author,b.body)});
  });
  app.get('/api/runs/:id/export',async(req,res)=>{
    const r=await getRun(z.string().uuid().parse(req.params.id));
    if(!r.result) throw new HttpError(409,'저장된 보고서가 없습니다.');
    res.set('X-Report-SHA256',r.reportHash).type('text/markdown').send(r.result.report+r.reviews.map((x:any)=>'\n\n## '+x.author+' 리뷰\n\n'+x.body).join(''));
  });
  // React uses the same origin, cookies and API contract as the API.
  app.get(['/','/react','/react/','/react/index.html'],async(_req,res)=>sendUiDocument(res,await readFile('public/react/index.html','utf8')));
  app.use(express.static('public'));
  app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=err instanceof z.ZodError?400:err instanceof HttpError?err.status:err.code==='23505'?409:500;
    res.status(status).json({error:status===500?'서버 처리 오류입니다. 실행 상태를 확인하세요.':err.message});
    if(status===500) console.error('request_failed',err.code??err.name);
  });
  return app;
}
if(process.env.NODE_ENV!=='test'){
  await migrate();await expireRuns();await recoverSync();
  startSyncScheduler();
  const timer=setInterval(()=>void expireRuns().catch(()=>{}),60000);timer.unref();
  createApp().listen(config.port,'0.0.0.0',()=>console.log('mail-triage-web ready on '+config.port));
}
