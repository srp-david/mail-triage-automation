import express from 'express';
import {timingSafeEqual,createHash} from 'node:crypto';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
import {ApiError,uuid} from '../../../packages/contracts/src/v1.js';
import {requestContext,finishRoutes} from '../../../packages/contracts/src/http.js';
// Minimal loopback facade; full UI routing moves here after v1 feature parity.
export function createLocalApp(history:HistoryClient,sessionToken:string,port:number){
  if(sessionToken.length<32)throw new Error('Strong local session required');
  const app=express();app.disable('x-powered-by');app.use(requestContext);
  const hash=(s:string)=>createHash('sha256').update(s).digest();
  app.use((req,res,next)=>{
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if(req.get('host')!==`127.0.0.1:${port}`||req.get('origin')&&req.get('origin')!==`http://127.0.0.1:${port}`||req.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'LOCAL_ORIGIN_DENIED');
    if(!timingSafeEqual(hash(req.get('authorization')??''),hash('Bearer '+sessionToken)))throw new ApiError(401,'LOCAL_SESSION_REQUIRED');
    next();
  });
  app.use(express.json({limit:'2mb'}));
  app.get('/local-api/me',async(_req,res)=>res.json(await history.request('/me')));
  app.get('/local-api/runs/:id',async(req,res)=>res.json(await history.get(uuid.parse(req.params.id))));
  return finishRoutes(app);
}
