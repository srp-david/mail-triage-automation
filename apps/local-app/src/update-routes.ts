import type express from 'express';
import {z} from 'zod';
import type {LocalUpdates} from './updates.js';
export function updateRoutes(app:express.Express,updates:LocalUpdates,installed:()=>Promise<unknown>){
  app.get('/api/updates',(_req,res)=>res.json(updates.snapshot()));
  app.post('/api/updates/check',async(_req,res)=>res.json(await updates.check(true)));
  app.post('/api/updates/defer',(_req,res)=>res.json(updates.defer()));
  app.post('/api/updates/install',(req,res)=>{
    const input=z.object({releaseId:z.string().max(80),assetSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);
    res.status(202).json(updates.beginInstall(input,installed));
  });
}
