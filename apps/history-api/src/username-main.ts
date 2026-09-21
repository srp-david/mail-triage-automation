import {readFile} from 'node:fs/promises';
import {schemaReady,migrateVersioned} from './migrations.js';
import {pool} from './db.js';
import {UsernameAuth,parseSigningKey} from './username-auth.js';
import {createUsernameApp} from './username-app.js';
if(process.argv.includes('--migrate')){await migrateVersioned();await pool.end();}
else{
  await schemaReady();
  if(!process.env.AUTH_SIGNING_KEY_FILE)throw new Error('AUTH_SIGNING_KEY_FILE required');
  const auth=await UsernameAuth.create(process.env.AUTH_ISSUER!,process.env.AUTH_AUDIENCE!,process.env.TEAM_ID!,parseSigningKey(await readFile(process.env.AUTH_SIGNING_KEY_FILE,'utf8')));
  const server=createUsernameApp(auth).listen(Number(process.env.PORT??3081),process.env.HISTORY_BIND??'127.0.0.1');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{void pool.end();}));
}
