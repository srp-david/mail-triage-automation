import express from 'express';
import {timingSafeEqual,createHash} from 'node:crypto';
import type {HistoryClient} from '../../../packages/history-client/src/index.js';
// Minimal loopback facade; full UI routing moves here after v1 feature parity.
export function createLocalApp(history:HistoryClient,sessionToken:string,port:number){
  if(sessionToken.length<32)throw new Error('Strong local session required');
  const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
  const hash=(s:string)=>createHash('sha256').update(s).digest();
  app.use((req,res,next)=>{
    if(req.get('host')!==`127.0.0.1:${port}`||req.get('origin')&&req.get('origin')!==`http://127.0.0.1:${port}`||req.get('sec-fetch-site')==='cross-site')return res.sendStatus(403);
    if(!timingSafeEqual(hash(req.get('authorization')??''),hash('Bearer '+sessionToken)))return res.sendStatus(401);
    next();
  });
  app.get('/local-api/me',async(_req,res)=>res.json(await history.request('/me')));
  app.get('/local-api/runs/:id',async(req,res)=>res.json(await history.get(String(req.params.id))));
  return app;
}
