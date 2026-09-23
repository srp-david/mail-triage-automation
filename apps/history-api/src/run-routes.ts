import {createHash} from 'node:crypto';
import type express from 'express';
import {z} from 'zod';
import {ApiError,uuid} from '../../../packages/contracts/src/v1.js';
import type {Runs} from './runs.js';
export function runRoutes(app:express.Express,runs:Runs){
  app.get('/api/v1/runs',async(req,res)=>{const q=z.object({sourceId:uuid,offset:z.coerce.number().int().min(0).default(0),mailId:z.coerce.number().int().positive().safe().optional(),query:z.string().max(1000).default('')}).strict().parse(req.query);res.json(await runs.list(res.locals.actor,q.sourceId,q.offset,q.mailId,q.query));});
  app.post('/api/v1/runners/:id/claim',async(req,res)=>{const b=z.object({requestId:uuid}).strict().parse(req.body);const value=await runs.claim(res.locals.actor,uuid.parse(req.params.id),b.requestId,req.get('x-device-credential')??'');value?res.json(value):res.sendStatus(204);});
  for(const action of ['heartbeat','progress','fail'] as const)app.post('/api/v1/runs/:id/'+action,async(req,res)=>res.json(await runs[action](res.locals.actor,uuid.parse(req.params.id),req.body,req.get('x-device-credential')??'')));
  app.post('/api/v1/runs/:id/cancel',async(req,res)=>res.json(await runs.cancel(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/runs/:id/recover',async(req,res)=>res.json(await runs.recover(res.locals.actor,uuid.parse(req.params.id),req.body,req.get('x-device-credential')??'')));
  app.get('/api/v1/runs/:id/export',async(req,res)=>{const r=await runs.get(res.locals.actor,uuid.parse(req.params.id));if(!r.result)throw new ApiError(409,'NO_REPORT');const body=r.result.report+r.reviews.map(x=>'\n\n## '+(x.authorDisplay??x.author)+' 리뷰\n\n'+x.body).join('');res.set('X-Report-SHA256',createHash('sha256').update(body).digest('hex')).type('text/markdown').send(body);});
}
