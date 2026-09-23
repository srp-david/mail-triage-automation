import type express from 'express';
import {z} from 'zod';
import {uuid} from '../../../packages/contracts/src/v1.js';
import {SharedHistory} from './shared-history.js';
export function sharedHistoryRoutes(app:express.Express,h=new SharedHistory()){
  app.post('/api/v1/runs/:id/reviews',async(req,res)=>res.status(201).json(await h.review(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.post('/api/v1/runs/:id/handling',async(req,res)=>res.json(await h.handling(res.locals.actor,uuid.parse(req.params.id),z.object({completed:z.boolean()}).strict().parse(req.body).completed)));
  app.post('/api/v1/runs/:id/related-mails',async(req,res)=>res.json(await h.related(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.post('/api/v1/runs/:id/related-mails/:linkId/unlink',async(req,res)=>res.json(await h.unlinkRelated(res.locals.actor,uuid.parse(req.params.id),uuid.parse(req.params.linkId))));
  app.post('/api/v1/sources/:id/mail-analysis',async(req,res)=>res.json(await h.summaries(res.locals.actor,uuid.parse(req.params.id),z.object({mailIds:z.array(z.number().int().positive().safe()).max(100)}).strict().parse(req.body).mailIds)));
  app.get('/api/v1/sources/:id/thread-links',async(req,res)=>res.json(await h.threads(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/sources/:id/thread-links',async(req,res)=>res.json(await h.addThread(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.post('/api/v1/sources/:id/thread-links/detach',async(req,res)=>res.json(await h.detachThread(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.post('/api/v1/sources/:id/thread-links/:linkId/unlink',async(req,res)=>res.json(await h.removeThread(res.locals.actor,uuid.parse(req.params.id),uuid.parse(req.params.linkId))));
}
