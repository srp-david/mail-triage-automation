import type express from 'express';
import {uuid} from '../../../packages/contracts/src/v1.js';
import type {Directory} from './directory.js';
export function directoryRoutes(app:express.Express,d:Directory){
  app.get('/api/v1/members',async(_req,res)=>res.json(await d.members(res.locals.actor)));
  app.get('/api/v1/runners',async(_req,res)=>res.json(await d.runners(res.locals.actor)));
  app.get('/api/v1/sources',async(_req,res)=>res.json(await d.sources(res.locals.actor)));
  app.post('/api/v1/sources',async(req,res)=>res.status(201).json(await d.registerSource(res.locals.actor,req.body)));
  app.post('/api/v1/sources/:id/grants',async(req,res)=>res.json(await d.grant(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.post('/api/v1/runners',async(req,res)=>res.status(201).json(await d.registerRunner(res.locals.actor,req.body)));
  app.post('/api/v1/runners/:id/revoke',async(req,res)=>res.json(await d.revoke(res.locals.actor,uuid.parse(req.params.id))));
  app.post('/api/v1/users/:id/disable',async(req,res)=>res.json(await d.disable(res.locals.actor,uuid.parse(req.params.id))));
}
