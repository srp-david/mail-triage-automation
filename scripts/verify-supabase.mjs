import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {generateKeyPair,exportJWK} from 'jose';
import pg from 'pg';
import assert from 'node:assert/strict';
const id='triage-free-'+randomUUID().slice(0,8),dir=resolve('.runtime',id),dbName=id+'-db',edgeName=id+'-edge';
await mkdir(dir,{recursive:true});
const docker=(args,options={})=>{const r=spawnSync('docker',args,{encoding:'utf8',...options});if(r.status!==0)throw Error('DOCKER_FAILED '+args[0]+' '+(r.stderr??''));return r.stdout.trim();};
let admin;
const result={id,hosted:false,checks:[],metrics:{}};
const pass=name=>{result.checks.push(name);console.log('PASS '+name);};
let pool;
try{
 docker(['network','create',id]);
 const dbPassword=randomBytes(24).toString('hex');await writeFile(dir+'/db.env','POSTGRES_PASSWORD='+dbPassword+'\nPOSTGRES_DB=triage\n');
 docker(['run','-d','--name',dbName,'--label','triage.poc='+id,'--network',id,'--env-file',dir+'/db.env','-p','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data','postgres:17']);
 const port=docker(['port',dbName,'5432/tcp']).split(':').at(-1);process.env.DATABASE_URL=`postgresql://postgres:${dbPassword}@127.0.0.1:${port}/triage`;
 process.env.NODE_ENV='test';process.env.HISTORY_SCHEMA='triage_private';
 for(let n=0;n<50;n++){try{admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();break;}catch{await admin?.end().catch(()=>{});admin=null;await delay(200);}}
 if(!admin)throw Error('DB_NOT_READY');
 await admin.query('CREATE SCHEMA triage_private');
 ({pool}=await import('../apps/history-api/src/db.ts'));
 const {migrateVersioned}=await import('../apps/history-api/src/migrations.ts');await migrateVersioned();await migrateVersioned();
 await admin.query("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE triage_runtime LOGIN; ALTER ROLE triage_runtime PASSWORD '"+dbPassword+"'");
 await admin.query(await readFile('deploy/supabase/private-grants.sql','utf8'));
 const teamId=randomUUID();await admin.query('INSERT INTO triage_private.team VALUES($1,$2)',[teamId,'Synthetic team']);
 const {privateKey}=await generateKeyPair('ES256',{extractable:true}),jwk=await exportJWK(privateKey);
 const {UsernameAuth}=await import('../apps/history-api/src/username-auth.ts');
 const auth=await UsernameAuth.create('https://poc.invalid/auth','mail-triage',teamId,jwk);
 const initial=await auth.createUser(null,{username:'Admin.One',displayName:'합성 관리자',role:'admin'});
 await assert.rejects(auth.createUser(null,{username:'Other.Admin',displayName:'Other',role:'admin'}),/BOOTSTRAP_ALREADY_DONE/);
 pass('migration replay and operator bootstrap');
 const runtimeUrl=`postgresql://triage_runtime:${dbPassword}@${dbName}:5432/triage`;
 await writeFile(dir+'/edge.env',[`DATABASE_URL=${runtimeUrl}`,'HISTORY_SCHEMA=triage_private','HISTORY_POOL_MAX=2','AUTH_ISSUER=https://poc.invalid/auth','AUTH_AUDIENCE=mail-triage',`TEAM_ID=${teamId}`,`AUTH_SIGNING_JWK=${JSON.stringify(jwk)}`].join('\n'));
 docker(['run','-d','--name',edgeName,'--label','triage.poc='+id,'--network',id,'--env-file',dir+'/edge.env','-p','127.0.0.1::9000','-v',resolve('supabase/functions')+':/home/deno/functions:ro','supabase/edge-runtime:v1.76.2','start','--main-service','/home/deno/functions/local-gateway']);
 const edgePort=docker(['port',edgeName,'9000/tcp']).split(':').at(-1),base=`http://127.0.0.1:${edgePort}/functions/v1/history`;
 const call=async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-contract-version':'1',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={code:'NON_JSON'};}return {status:r.status,data,bytes:Buffer.byteLength(text),cache:r.headers.get('cache-control')};};
 let health;for(let n=0;n<40;n++){try{health=await call('/health/live');if(health.status===200)break;}catch{}await delay(500);}
 if(health?.status!==200)throw Error('EDGE_BOOT_FAILED');pass('Supabase Edge runtime boots with Express pg jose WASM');
 assert.equal((await call('/health/ready')).status,200);
 const bench=await fetch(`http://127.0.0.1:${edgePort}/local-benchmark`);assert.equal(bench.status,200);result.metrics.edgeArgon2=await bench.json();
 const login=async(name,password)=>{const r=await call('/auth/login',{username:name,password});assert.equal(r.status,200,r.data.code);return r.data;};
 let a=await login('ADMIN.ONE',initial.temporaryPassword);
 assert.equal((await call('/api/v1/sources',undefined,a.access_token)).status,403);
 assert.equal((await call('/api/v1/admin/users',undefined,a.access_token)).status,403);
 assert.equal((await call('/auth/password',{currentPassword:initial.temporaryPassword,newPassword:'Synthetic password ONE 123!'},a.access_token)).status,200);
 assert.equal((await call('/auth/me',undefined,a.access_token)).status,401);
 a=await login('admin.one','Synthetic password ONE 123!');pass('temporary restriction password change revoked JWT');
 const created=await call('/api/v1/admin/users',{username:'Analyst.Two',displayName:'합성 분석자',role:'analyst'},a.access_token);assert.equal(created.status,201,created.data.code);
 assert.equal(created.cache,'no-store');
 assert.equal((await call('/api/v1/admin/users',{username:'ANALYST.TWO',displayName:'Duplicate',role:'analyst'},a.access_token)).status,409);
 let b=await login('analyst.two',created.data.temporaryPassword);
 await call('/auth/password',{currentPassword:created.data.temporaryPassword,newPassword:'Synthetic password TWO 123!'},b.access_token);b=await login('analyst.two','Synthetic password TWO 123!');
 assert.equal((await call('/api/v1/admin/users',undefined,b.access_token)).status,403);
 assert.equal((await call('/api/v1/admin/users/'+initial.id,{displayName:'admin',role:'viewer',active:true},a.access_token)).data.code,'LAST_ADMIN');
 pass('two users normalized uniqueness direct admin denial last admin');
 const source=await call('/api/v1/sources',{instanceId:randomUUID(),displayName:'합성 개인 출처'},b.access_token);assert.equal(source.status,201,source.data.code);
 assert.deepEqual((await call('/api/v1/sources',undefined,a.access_token)).data,[]);
 const device=await call('/api/v1/runners',{requestId:randomUUID(),displayName:'Synthetic PC',agents:['codex'],sourceIds:[source.data.id]},b.access_token);assert.equal(device.status,201,device.data.code);
 const deviceCall=async(path,body)=>{const r=await fetch(base+'/api/v1'+path,{method:'POST',headers:{authorization:'Bearer '+b.access_token,'x-contract-version':'1','content-type':'application/json','x-device-credential':device.data.credential},body:JSON.stringify(body)});return {status:r.status,data:r.status===204?null:await r.json()};};
 const request={sourceId:source.data.id,mailId:1,messageId:'<synthetic@invalid>',subject:'Synthetic only',requestId:randomUUID(),runnerId:device.data.id,agent:'codex',verifiedAt:new Date().toISOString()};
 const run=await call('/api/v1/runs',request,b.access_token);assert.equal(run.status,201,run.data.code);
 assert.equal((await call('/api/v1/runs',request,b.access_token)).data.id,run.data.id);
 assert.equal((await call('/api/v1/runs/'+run.data.id,undefined,a.access_token)).status,404);
 const claim=await deviceCall('/runners/'+device.data.id+'/claim',{requestId:randomUUID()});assert.equal(claim.status,200,claim.data?.code);
 const lease={runnerId:device.data.id,leaseToken:claim.data.leaseToken,generation:claim.data.generation};
 assert.equal((await deviceCall('/runs/'+run.data.id+'/heartbeat',lease)).status,200);
 const fixture={outcome:'completed',project:'unknown',report:'# Synthetic',knowledge:'',question:'',evidence:[]};
 const complete=await deviceCall('/runs/'+run.data.id+'/result',{...lease,requestId:randomUUID(),result:fixture});assert.equal(complete.status,200,complete.data?.code);
 result.metrics.reportResponseBytes=(await call('/api/v1/runs/'+run.data.id,undefined,b.access_token)).bytes;
 pass('source ACL admin private denial run admission claim heartbeat result');
 const {Runner}=await import('../packages/runner/src/runner.ts'),{HistoryClient}=await import('../packages/history-client/src/index.ts'),{ProtectedStore}=await import('../apps/local-app/src/protected-store.ts');
 let executions=0,lose=true,runnerToken=b.access_token;
 const runnerClient=new HistoryClient(base,async()=>runnerToken,async(url,init)=>{const r=await fetch(url,init);if(String(url).endsWith('/result')&&r.ok&&lose){lose=false;await r.text();throw TypeError('synthetic response lost');}return r;});
 const receipts=new ProtectedStore(resolve(dir,'runner-receipts'));
 const runner=new Runner(runnerClient,receipts,{async execute(){executions++;return fixture;}},device.data.id,device.data.credential);
 const secondRun=await call('/api/v1/runs',{...request,mailId:2,requestId:randomUUID()},b.access_token);assert.equal(secondRun.status,201);
 await assert.rejects(runner.tick(),/synthetic response lost/);assert.equal((await runner.recovery()).state,'outbox');
 runnerToken=a.access_token;await assert.rejects(runner.tick());assert.equal((await runner.recovery()).state,'outbox');
 runnerToken=b.access_token;await runner.tick();assert.equal(executions,1);assert.equal((await runner.recovery()).state,'idle');
 pass('actual Runner DPAPI outbox survives response loss wrong account and replay without rerun');
 if(process.argv.includes('--browser')){
   const {verifyUsernameBrowser}=await import('./verify-username-browser.mjs');
   await verifyUsernameBrowser({base,dir,adminPassword:'Synthetic password ONE 123!'});pass('Chrome username admin first change DPAPI restart local CSRF token boundary');
 }
 const pair=await Promise.all([call('/auth/refresh',{refresh_token:b.refresh_token}),call('/auth/refresh',{refresh_token:b.refresh_token})]);
 assert.deepEqual(pair.map(x=>x.status).sort(),[200,401]);
 assert.equal((await call('/auth/me',undefined,pair.find(x=>x.status===200).data.access_token)).status,401);pass('concurrent refresh exactly one rotation replay revokes family');
 const actor=await auth.authenticate(a.access_token);await auth.updateUser(actor,created.data.id,{displayName:'disabled',role:'analyst',active:false});
 assert.equal((await call('/auth/me',undefined,b.access_token)).status,401);pass('disable revokes sessions');
 const deniedLogin=await call('/auth/login',{username:'missing.user',password:'Incorrect password 123!'});assert.equal(deniedLogin.status,401);
 for(let n=0;n<10;n++)await call('/auth/login',{username:'missing.user',password:'Incorrect password 123!'});
 assert.equal((await call('/auth/login',{username:'missing.user',password:'Incorrect password 123!'})).status,429);pass('persistent login rate limit');
 const deniedRole=new pg.Client({connectionString:process.env.DATABASE_URL});await deniedRole.connect();try{await deniedRole.query('SET ROLE anon');await assert.rejects(deniedRole.query('SELECT * FROM triage_private.user_credential'),/permission denied/);}finally{await deniedRole.end();}pass('Data API roles cannot access private schema');
 const {hashPassword,verifyPassword,passwordPolicy}=await import('../apps/history-api/src/password.ts');const cpu=process.cpuUsage(),start=performance.now();let hash;for(let n=0;n<5;n++){hash=await hashPassword('Synthetic benchmark 123!');assert.equal(await verifyPassword('Synthetic benchmark 123!',hash),true);}
 result.metrics.nodeHashAndVerify={pairs:5,wallMs:Math.round(performance.now()-start),cpuMicros:process.cpuUsage(cpu),rssBytes:process.memoryUsage().rss,policy:passwordPolicy};
 // Binary dump goes straight to a local artifact, never stdout or Git.
 docker(['exec',dbName,'pg_dump','-U','postgres','-d','triage','-Fc','-f','/tmp/poc.dump']);docker(['cp',dbName+':/tmp/poc.dump',dir+'/synthetic.dump']);
 docker(['exec',dbName,'createdb','-U','postgres','restored']);docker(['exec',dbName,'pg_restore','-U','postgres','-d','restored','--no-owner','/tmp/poc.dump']);
 const restored=new pg.Client({connectionString:process.env.DATABASE_URL.replace('/triage','/restored')});await restored.connect();
 try{for(const table of ['app_user','source','v1_run','analysis_run','report_version']){const sql=`SELECT md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) AS hash FROM triage_private.${table} t`;assert.equal((await restored.query(sql)).rows[0].hash,(await admin.query(sql)).rows[0].hash);}
 await restored.query('UPDATE triage_private.auth_session SET revoked_at=now()');assert.equal((await restored.query('SELECT count(*)::int AS n FROM triage_private.auth_session WHERE revoked_at IS NULL')).rows[0].n,0);
 }finally{await restored.end();}pass('dump restore identity ACL reports hashes preserved all restored sessions revoked');
 result.metrics.dbBytes=Number((await admin.query('SELECT pg_database_size(current_database()) AS bytes')).rows[0].bytes);
 result.metrics.privateTableBytes=Number((await admin.query("SELECT sum(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename))) AS bytes FROM pg_tables WHERE schemaname='triage_private'")).rows[0].bytes);
 result.ok=true;
}catch(error){result.ok=false;result.error=error.message;process.exitCode=1;console.error(error.stack);}
finally{
 await writeFile(dir+'/result.json',JSON.stringify(result,null,2));
 for(const name of [edgeName,dbName]){try{const log=spawnSync('docker',['logs',name],{encoding:'utf8'});await writeFile(dir+'/'+name+'.log',(log.stdout??'')+(log.stderr??''));}catch{}try{docker(['rm','-f',name]);}catch{}}
 await pool?.end().catch(()=>{});await admin?.end().catch(()=>{});try{docker(['network','rm',id]);}catch{}
 console.log(JSON.stringify({artifact:dir+'/result.json',ok:result.ok,checks:result.checks.length}));
}
