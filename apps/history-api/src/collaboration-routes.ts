import type {Express} from 'express';
import {uuid} from '../../../packages/contracts/src/v1.js';
import {z} from 'zod';
import {bindMail} from './common-mail.js';
import {SharedReports} from './shared-reports.js';
import {ReportCollaboration} from './report-collaboration.js';
import {ReportQuestions} from './report-questions.js';
export function collaborationRoutes(app:Express){
 const reports=new SharedReports();
 const collaboration=new ReportCollaboration();
 const questions=new ReportQuestions();
 app.post('/api/v1/reports/:id/questions',async(req,res)=>res.json(await questions.start(res.locals.actor,uuid.parse(req.params.id),req.body,req.get('x-device-credential')??'')));
 app.post('/api/v1/report-questions/:id/result',async(req,res)=>res.json(await questions.complete(res.locals.actor,uuid.parse(req.params.id),req.body,req.get('x-device-credential')??'')));
 app.post('/api/v1/report-questions/:id/fail',async(req,res)=>res.json(await questions.fail(res.locals.actor,uuid.parse(req.params.id),req.get('x-device-credential')??'')));
 app.get('/api/v1/reports/:id/collaboration',async(req,res)=>res.json(await collaboration.get(res.locals.actor,uuid.parse(req.params.id))));
 app.get('/api/v1/reports/:id/revisions/:version',async(req,res)=>res.json(await collaboration.revision(res.locals.actor,uuid.parse(req.params.id),z.coerce.number().int().positive().parse(req.params.version))));
 app.post('/api/v1/reports/:id/revisions',async(req,res)=>res.json(await collaboration.save(res.locals.actor,uuid.parse(req.params.id),req.body)));
 app.post('/api/v1/reports/:id/messages',async(req,res)=>res.json(await collaboration.message(res.locals.actor,uuid.parse(req.params.id),req.body)));
 app.get('/api/v1/reports/:id/export',async(req,res)=>{const value=await collaboration.get(res.locals.actor,uuid.parse(req.params.id));res.set('X-Report-SHA256',value.hash).type('text/markdown').send(value.report);});
 app.post('/api/v1/sources/:id/mail-identity',async(req,res)=>res.json(await bindMail(res.locals.actor,uuid.parse(req.params.id),req.body)));
 app.get('/api/v1/sources/:id/mails/:mailId/shared-reports',async(req,res)=>res.json(await reports.list(res.locals.actor,uuid.parse(req.params.id),z.coerce.number().int().positive().safe().parse(req.params.mailId))));
 app.get('/api/v1/reports/:id',async(req,res)=>res.json(await reports.get(res.locals.actor,uuid.parse(req.params.id))));
 app.post('/api/v1/reports/:id/share',async(req,res)=>res.json(await reports.share(res.locals.actor,uuid.parse(req.params.id),req.body)));
}
