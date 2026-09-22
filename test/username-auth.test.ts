import {test,afterAll as after} from 'vitest';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import pg from 'pg';
process.env.NODE_ENV='test';
const schema='triage_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE SCHEMA '+schema);process.env.PGOPTIONS='-c search_path='+schema;
const {pool}=await import('../apps/history-api/src/db.js');
const {migrateVersioned}=await import('../apps/history-api/src/migrations.js');await migrateVersioned();
const {UsernameAuth}=await import('../apps/history-api/src/username-auth.js');
const {username,hashPassword,verifyPassword}=await import('../apps/history-api/src/password.js');
const {Directory}=await import('../apps/history-api/src/directory.js');
const {UsernameLogin}=await import('../apps/local-app/src/username-login.js');
const {LocalSession}=await import('../apps/local-app/src/session.js');
const team=randomUUID();await pool.query('INSERT INTO team VALUES($1,$2)',[team,'Synthetic']);
const {privateKey}=await generateKeyPair('ES256',{extractable:true}),issuer='https://auth.fixture/',audience='triage';
const auth=await UsernameAuth.create(issuer,audience,team,await exportJWK(privateKey));
const pass='Synthetic secure password 123!';
const first=await auth.createUser(null,{username:'Admin.One',displayName:'One',role:'admin'});
const firstTokens=await auth.login({username:'ADMIN.ONE',password:first.temporaryPassword});
await auth.changePassword(await auth.authenticate(firstTokens.access_token,true),{currentPassword:first.temporaryPassword,newPassword:pass});
const login=()=>auth.login({username:'admin.one',password:pass});
after(async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();});
test('username and Argon2id enforce bounded policy without weak fallback',async()=>{
 assert.equal(username('ABC.User'),'abc.user');for(const value of [' abcd','ＡBCD','a@b','ab','abcd '])assert.throws(()=>username(value));
 await assert.rejects(hashPassword('short'),/PASSWORD_POLICY/);const hash=await hashPassword(pass);assert.ok(hash.startsWith('$argon2id$'));assert.equal(await verifyPassword('incorrect password 123!',hash),false);
 await assert.rejects(verifyPassword(pass,'sha256:abc'),/UNSUPPORTED/);
});
test('JWT signature issuer audience expiry and missing session are rejected',async()=>{
 const token=await login(),actor=await auth.authenticate(token.access_token);
 assert.equal(actor.userId,first.id);await assert.rejects(auth.authenticate(token.access_token.slice(0,-5)+'wrong'),/LOGIN_DENIED/);
 for(const mode of ['issuer','audience','expiry','session']){
  const signed=await new SignJWT({sid:mode==='session'?randomUUID():actor.sessionId}).setProtectedHeader({alg:'ES256'}).setSubject(first.id).setIssuer(mode==='issuer'?'https://wrong/':issuer).setAudience(mode==='audience'?'wrong':audience).setIssuedAt().setExpirationTime(mode==='expiry'?'0s':'5m').sign(privateKey);
  await assert.rejects(auth.authenticate(signed),/LOGIN_DENIED/);
 }
});
test('password reset expires old sessions, previous temporary passwords and expired temporary credentials',async()=>{
 const actor=await auth.authenticate((await login()).access_token);
 const u=await auth.createUser(actor,{username:'test.user',displayName:'User',role:'analyst'}),old=await auth.login({username:'test.user',password:u.temporaryPassword});
 await assert.rejects(auth.authenticate(old.access_token),/PASSWORD_CHANGE_REQUIRED/);
 const fresh=await auth.resetPassword(actor,u.id);await assert.rejects(auth.authenticate(old.access_token,true),/LOGIN_DENIED/);
 await assert.rejects(auth.login({username:'test.user',password:u.temporaryPassword}),/LOGIN_DENIED/);
 await pool.query("UPDATE user_credential SET temporary_until=now()-interval '1 second' WHERE user_id=$1",[u.id]);
 await assert.rejects(auth.login({username:'test.user',password:fresh.temporaryPassword}),/LOGIN_DENIED/);
 const count=await pool.query('SELECT count(*) FROM app_user');await assert.rejects(auth.login({username:'absent.user',password:pass}),/LOGIN_DENIED/);assert.equal((await pool.query('SELECT count(*) FROM app_user')).rows[0].count,count.rows[0].count);
});
test('concurrent refresh revokes returned token and stale authenticated principal cannot mutate',async()=>{
 const tokens=await login(),actor=await auth.authenticate(tokens.access_token);
 const r=await Promise.allSettled([auth.refresh({refresh_token:tokens.refresh_token}),auth.refresh({refresh_token:tokens.refresh_token})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(auth.authenticate(tokens.access_token),/LOGIN_DENIED/);
 await assert.rejects(new Directory(team).registerSource(actor,{instanceId:randomUUID(),displayName:'No stale writer'}),/SESSION_REVOKED/);
});
test('concurrent last administrator changes leave one active admin and revoke changed role sessions',async()=>{
 const a=await auth.authenticate((await login()).access_token),newAdmin=await auth.createUser(a,{username:'admin.two',displayName:'Two',role:'admin'});
 const temp=await auth.login({username:'admin.two',password:newAdmin.temporaryPassword});await auth.changePassword(await auth.authenticate(temp.access_token,true),{currentPassword:newAdmin.temporaryPassword,newPassword:pass});
 const b=await auth.authenticate((await auth.login({username:'admin.two',password:pass})).access_token);
 const r=await Promise.allSettled([auth.updateUser(a,a.userId,{displayName:'One',role:'analyst',active:true}),auth.updateUser(b,b.userId,{displayName:'Two',role:'analyst',active:true})]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM membership WHERE role='admin' AND active")).rows[0].n,1);
});
test('local username session binds credentials to API URL and persists rotation intent on loss',async()=>{
 let data:any={phase:'signed_out'},clock=0,refreshes=0;
 const id=randomUUID(),tokens={access_token:'a',refresh_token:'r',expires_in:120,token_type:'Bearer',subject:id};
 const transport:any=async(url:URL|string)=>{const path=new URL(url).pathname;if(path.endsWith('/refresh')){refreshes++;throw TypeError('response lost');}return Response.json(tokens);};
 const driver=new UsernameLogin('https://one.fixture/functions/v1/history',issuer,audience,transport),store={async read(){return data;},async write(_k:string,value:any){data=structuredClone(value);}},identify=async()=>({userId:id,role:'analyst',mustChangePassword:false});
 const s=new LocalSession(driver,store,identify,()=>clock);await s.credentials({username:'test.user',password:pass});assert.equal((await s.identity()).userId,id);
 const other=new LocalSession(new UsernameLogin('https://two.fixture/functions/v1/history',issuer,audience,transport),store,identify,()=>clock);await assert.rejects(other.token(),/LOGIN_REQUIRED/);
 clock=100000;await assert.rejects(s.token(),/LOGIN_REQUIRED/);assert.equal(data.phase,'renewing');await assert.rejects(new LocalSession(driver,store,identify,()=>clock).token(),/LOGIN_REQUIRED/);assert.equal(refreshes,1);
});
test('operator mapping preserves legacy UUID/source ownership and recovery only resets existing administrators',async()=>{
 const {operatorAccount}=await import('../apps/history-api/src/operator.js');
 const legacy=randomUUID(),sourceId=randomUUID();
 await pool.query('INSERT INTO app_user(id,issuer,subject,email) VALUES($1,$2,$3,$4)',[legacy,'https://old.fixture/','legacy-sub','same@fixture']);
 await pool.query("INSERT INTO membership VALUES($1,$2,'analyst',true)",[legacy,team]);
 await pool.query('INSERT INTO source(id,team_id,owner_user_id,instance_id,display_name,store_id) VALUES($1,$2,$3,$4,$5,$6)',[sourceId,team,legacy,randomUUID(),'Legacy source',sourceId]);
 const mapped=await operatorAccount('map-user',team,legacy,'Legacy.User');
 assert.equal((await pool.query('SELECT owner_user_id FROM source WHERE id=$1',[sourceId])).rows[0].owner_user_id,legacy);
 assert.equal((await auth.authenticate((await auth.login({username:'legacy.user',password:mapped.temporaryPassword})).access_token,true)).userId,legacy);
 await assert.rejects(operatorAccount('map-user',team,legacy,'new.name'),/ALREADY_MAPPED/);
 await assert.rejects(operatorAccount('recover-admin',team,legacy),/EXISTING_ADMIN_REQUIRED/);
 const current=(await pool.query("SELECT u.id,u.username FROM app_user u JOIN membership m ON m.user_id=u.id WHERE m.role='admin' AND m.active")).rows[0];
 const tokens=await auth.login({username:current.username,password:pass});
 await pool.query('UPDATE app_user SET active=false WHERE id=$1',[current.id]);
 const recovery=await operatorAccount('recover-admin',team,current.id);
 await assert.rejects(auth.authenticate(tokens.access_token),/LOGIN_DENIED/);
 assert.equal((await auth.login({username:current.username,password:recovery.temporaryPassword})).mustChangePassword,true);
});
