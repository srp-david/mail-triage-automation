import {createHistoryApp,errors} from './app.js';
import {Directory} from './directory.js';
import {Runs} from './runs.js';
import {directoryRoutes} from './directory-routes.js';
import {runRoutes} from './run-routes.js';
import {syncRoutes} from './sync-routes.js';
import {tokenVerifier} from './auth.js';
import {schemaReady,migrateVersioned} from './migrations.js';
import {pool} from './db.js';
import {z} from 'zod';
if(process.argv.includes('--migrate')){await migrateVersioned();await pool.end();}
else{
  const env=z.object({AUTH_ISSUER:z.string().url(),AUTH_AUDIENCE:z.string().min(1),AUTH_NAMESPACE:z.string().url(),COMPANY_DOMAINS:z.string().min(1),TEAM_ID:z.string().uuid(),ADMIN_SUBJECT:z.string().optional()}).parse(process.env);
  const verify=tokenVerifier({issuer:env.AUTH_ISSUER,audience:env.AUTH_AUDIENCE,namespace:env.AUTH_NAMESPACE,domains:env.COMPANY_DOMAINS.split(',').map(x=>x.trim())});
  const directory=new Directory(env.TEAM_ID,env.ADMIN_SUBJECT),runs=new Runs();
  await schemaReady();
  const app=createHistoryApp(runs,async token=>directory.login(await verify(token)));
  directoryRoutes(app,directory);runRoutes(app,runs);syncRoutes(app);
  app.get('/health/ready',async(_req,res)=>{try{await schemaReady();res.json({ok:true});}catch{res.status(503).json({ok:false});}});
  const server=errors(app).listen(Number(process.env.PORT??3081),process.env.HISTORY_BIND??'127.0.0.1');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{void pool.end();}));
}
