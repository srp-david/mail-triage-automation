import type {Express} from 'express';
import {uuid} from '../../../packages/contracts/src/v1.js';
import {z} from 'zod';
import {bindMail} from './common-mail.js';
import {SharedReports} from './shared-reports.js';
export function collaborationRoutes(app:Express){
 const reports=new SharedReports();
 app.post('/api/v1/sources/:id/mail-identity',async(req,res)=>res.json(await bindMail(res.locals.actor,uuid.parse(req.params.id),req.body)));
 app.get('/api/v1/sources/:id/mails/:mailId/shared-reports',async(req,res)=>res.json(await reports.list(res.locals.actor,uuid.parse(req.params.id),z.coerce.number().int().positive().safe().parse(req.params.mailId))));
 app.get('/api/v1/reports/:id',async(req,res)=>res.json(await reports.get(res.locals.actor,uuid.parse(req.params.id))));
 app.post('/api/v1/reports/:id/share',async(req,res)=>res.json(await reports.share(res.locals.actor,uuid.parse(req.params.id),req.body)));
}
