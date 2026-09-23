import type express from 'express';
import {z} from 'zod';
import {uuid} from '../../../packages/contracts/src/v1.js';
import {SourceSync} from './source-sync.js';
export function syncRoutes(app:express.Express,sync=new SourceSync()){
  app.get('/api/v1/runners/:id/sync-next',async(req,res)=>res.json(await sync.next(res.locals.actor,uuid.parse(req.params.id),req.get('x-device-credential')??'')));
  app.get('/api/v1/sources/:id/sync-latest',async(req,res)=>res.json(await sync.latest(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/sync-runs',async(req,res)=>res.status(201).json(await sync.start(res.locals.actor,req.body)));
  app.get('/api/v1/sync-runs/:id',async(req,res)=>res.json(await sync.get(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/sync-runs/:id/claim',async(req,res)=>res.json(await sync.claim(res.locals.actor,uuid.parse(req.params.id),z.object({requestId:uuid}).strict().parse(req.body).requestId,req.get('x-device-credential')??'')));
  for(const action of ['heartbeat','beginBatch','batch'] as const)app.post('/api/v1/sync-runs/:id/'+action,async(req,res)=>res.json(await sync[action](res.locals.actor,uuid.parse(req.params.id),req.body,req.get('x-device-credential')??'')));
  app.post('/api/v1/sync-runs/:id/stop',async(req,res)=>res.json(await sync.stop(res.locals.actor,uuid.parse(req.params.id))));
}
