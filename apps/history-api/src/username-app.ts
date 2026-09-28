import type {Express,Request} from 'express';
import {createHistoryApp,errors} from './app.js';
import {UsernameAuth} from './username-auth.js';
import {Directory} from './directory.js';
import {Runs} from './runs.js';
import {SourceSync} from './source-sync.js';
import {directoryRoutes} from './directory-routes.js';
import {runRoutes} from './run-routes.js';
import {syncRoutes} from './sync-routes.js';
import {sharedHistoryRoutes} from './shared-history-routes.js';
import {sharedArchiveRoutes} from './shared-archive-routes.js';
import {ApiError,contractVersion,uuid} from '../../../packages/contracts/src/v1.js';
import {transaction} from './db.js';
import {checkUpdate} from './updates.js';
const bearer=(req:Request)=>{const token=/^Bearer (\S+)$/.exec(req.get('authorization')??'')?.[1];if(!token)throw new ApiError(401,'UNAUTHENTICATED');return token;};
export function createUsernameApp(auth:UsernameAuth){
  const runs=new Runs(),sync=new SourceSync();
  const app=createHistoryApp(runs,t=>auth.authenticate(t),app=>{
    app.get('/health/ready',async(_req,res)=>{try{await transaction(c=>c.query("SELECT 1 FROM schema_migration WHERE id='005_username_auth.sql'").then(r=>{if(!r.rowCount)throw new Error('SCHEMA_NOT_READY');}));res.json({ok:true});}catch{res.status(503).json({ok:false});}});
    app.use('/auth',(req,res,next)=>{
      res.set('Cache-Control','no-store');
      if(req.get('origin')||req.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'BROWSER_ACCESS_DENIED');
      if(req.get('x-contract-version')!==contractVersion)throw new ApiError(409,'CONTRACT_VERSION');next();
    });
    app.post('/auth/login',async(req,res)=>res.json(await auth.login(req.body)));
    app.post('/auth/refresh',async(req,res)=>res.json(await auth.refresh(req.body)));
    app.post('/auth/logout',async(req,res)=>res.json(await auth.logout(req.body)));
    app.get('/auth/me',async(req,res)=>{const a=await auth.authenticate(bearer(req),true);res.json({userId:a.userId,role:a.role,mustChangePassword:a.mustChangePassword});});
    app.post('/auth/password',async(req,res)=>res.json(await auth.changePassword(await auth.authenticate(bearer(req),true),req.body)));
    app.use('/api/v1',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  });
  app.get('/api/v1/admin/users',async(_req,res)=>res.json(await auth.users(res.locals.actor)));
  app.post('/api/v1/admin/users',async(req,res)=>res.status(201).json(await auth.createUser(res.locals.actor,req.body)));
  app.post('/api/v1/admin/users/:id',async(req,res)=>res.json(await auth.updateUser(res.locals.actor,uuid.parse(req.params.id),req.body)));
  app.post('/api/v1/admin/users/:id/reset',async(req,res)=>res.json(await auth.resetPassword(res.locals.actor,uuid.parse(req.params.id))));
  app.get('/api/v1/updates/check',(req,res)=>res.json(checkUpdate(req.query,res.locals.actor,process.env.UPDATE_CATALOG_JSON)));
  directoryRoutes(app,new Directory(auth.teamId));runRoutes(app,runs);syncRoutes(app,sync);sharedHistoryRoutes(app);sharedArchiveRoutes(app);
  return errors(app);
}
