import express from 'express';
import {z} from 'zod';
import {ApiError,contractVersion,runInput,uuid,type Principal,type RunInput} from '../../../packages/contracts/src/v1.js';
export interface HistoryRepository {
  start(actor:Principal,input:RunInput):Promise<unknown>;
  get(actor:Principal,id:string):Promise<unknown>;
  complete(actor:Principal,id:string,input:unknown,device:string):Promise<unknown>;
}
export type Authenticator=(token:string)=>Promise<Principal>;
// Authentication is mandatory and injected; this app never mounts the v0 token routes.
export function createHistoryApp(repository:HistoryRepository,authenticate:Authenticator){
  const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}));
  app.use((_req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});next();});
  app.get('/health/live',(_req,res)=>res.json({ok:true}));
  app.use('/api/v1',async(req,res,next)=>{
    if(req.get('origin')||req.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'BROWSER_ACCESS_DENIED');
    if(req.get('x-contract-version')!==contractVersion)throw new ApiError(409,'CONTRACT_VERSION');
    const match=/^Bearer (\S+)$/.exec(req.get('authorization')??'');
    if(!match)throw new ApiError(401,'UNAUTHENTICATED');
    res.locals.actor=await authenticate(match[1]);next();
  });
  app.get('/api/v1/me',(_req,res)=>res.json(res.locals.actor));
  app.post('/api/v1/runs',async(req,res)=>res.status(201).json(await repository.start(res.locals.actor,runInput.parse(req.body))));
  app.get('/api/v1/runs/:id',async(req,res)=>res.json(await repository.get(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/runs/:id/result',async(req,res)=>res.json(await repository.complete(res.locals.actor,uuid.parse(req.params.id),req.body,req.get('x-device-credential')??'')));
  return app;
}
export function errors(app:express.Express){
  app.use((_req,res)=>res.status(404).json({code:'NOT_FOUND'}));
  app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    const status=error instanceof ApiError?error.status:error instanceof z.ZodError?400:error.code==='23505'?409:500;
    res.status(status).json({code:error instanceof ApiError?error.code:status===400?'INVALID_INPUT':status===409?'CONFLICT':'INTERNAL_ERROR'});
  });return app;
}
