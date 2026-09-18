import type express from 'express';
import {z} from 'zod';
import {uuid} from '../../../packages/contracts/src/v1.js';
import {SharedArchive} from './shared-archive.js';
export function sharedArchiveRoutes(app:express.Express,a=new SharedArchive()){
  app.get('/api/v1/collections',async(_req,res)=>res.json(await a.collections(res.locals.actor)));
  app.post('/api/v1/collections',async(req,res)=>res.status(201).json(await a.create(res.locals.actor,req.body)));
  app.post('/api/v1/collections/:id/grants',async(req,res)=>res.json(await a.grant(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.get('/api/v1/collections/:id/documents',async(req,res)=>{const q=z.object({offset:z.coerce.number().int().min(0).default(0),query:z.string().max(1000).default('')}).strict().parse(req.query);res.json(await a.list(res.locals.actor,uuid.parse(req.params.id),q.offset,q.query));});
  app.post('/api/v1/collections/:id/documents',async(req,res)=>res.status(201).json(await a.import(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.get('/api/v1/legacy/:id',async(req,res)=>res.json(await a.get(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/legacy/:id/link',async(req,res)=>res.json(await a.link(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.get('/api/v1/sources/:id/mails/:mailId/legacy',async(req,res)=>res.json(await a.mailDocuments(res.locals.actor,uuid.parse(req.params.id),z.coerce.number().int().positive().safe().parse(req.params.mailId))));
  app.post('/api/v1/knowledge',async(req,res)=>res.status(201).json(await a.prepareKnowledge(res.locals.actor,req.body)));
  app.get('/api/v1/knowledge/:id',async(req,res)=>res.json(await a.knowledge(res.locals.actor,uuid.parse(req.params.id))));
}
