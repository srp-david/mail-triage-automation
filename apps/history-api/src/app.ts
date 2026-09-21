import express from 'express';
import {ApiError,contractVersion,runInput,uuid,completionSchema,type Completion,type Principal,type RunInput} from '../../../packages/contracts/src/v1.js';
import {requestContext,finishRoutes} from '../../../packages/contracts/src/http.js';
export interface HistoryRepository {
  start(actor:Principal,input:RunInput):Promise<unknown>;
  get(actor:Principal,id:string):Promise<unknown>;
  complete(actor:Principal,id:string,input:Completion,device:string):Promise<unknown>;
}
export type Authenticator=(token:string)=>Promise<Principal>;
// Authentication is mandatory and injected; this app never mounts the v0 token routes.
export function createHistoryApp(repository:HistoryRepository,authenticate:Authenticator,beforeAuth?:(app:express.Express)=>void){
  const app=express();app.disable('x-powered-by');app.use(requestContext);app.use(express.json({limit:'2mb'}));
  app.get('/health/live',(_req,res)=>res.json({ok:true}));
  beforeAuth?.(app);
  app.use('/api/v1',async(req,res,next)=>{
    if(req.get('origin')||req.get('sec-fetch-site')==='cross-site'||req.get('sec-fetch-mode')==='navigate'||req.get('sec-fetch-dest')==='document')throw new ApiError(403,'BROWSER_ACCESS_DENIED');
    if(req.get('x-contract-version')!==contractVersion)throw new ApiError(409,'CONTRACT_VERSION');
    const match=/^Bearer (\S+)$/.exec(req.get('authorization')??'');
    if(!match)throw new ApiError(401,'UNAUTHENTICATED');
    res.locals.actor=await authenticate(match[1]);next();
  });
  app.get('/api/v1/me',(_req,res)=>res.json(res.locals.actor));
  app.post('/api/v1/runs',async(req,res)=>res.status(201).json(await repository.start(res.locals.actor,runInput.parse(req.body))));
  app.get('/api/v1/runs/:id',async(req,res)=>res.json(await repository.get(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/runs/:id/result',async(req,res)=>res.json(await repository.complete(res.locals.actor,uuid.parse(req.params.id),completionSchema.parse(req.body),req.get('x-device-credential')??'')));
  return app;
}
export const errors=finishRoutes;
