// Operator workstation only. Config path contains server DB connection and key-file path.
import {readFile,writeFile} from 'node:fs/promises';
import {generateKeyPair,exportJWK} from 'jose';
import {randomUUID} from 'node:crypto';
async function main(){
const [command,path,name,display]=process.argv.slice(2);
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('INTERACTIVE_OPERATOR_TERMINAL_REQUIRED');
if(command==='keygen'){
 const {privateKey}=await generateKeyPair('ES256',{extractable:true});
 await writeFile(path,JSON.stringify(await exportJWK(privateKey)),{flag:'wx',mode:0o600});
 console.log('Signing key created. Keep its directory restricted to the operator.');
}else{
 const config=JSON.parse(await readFile(path,'utf8'));
 process.env.DATABASE_URL=config.databaseUrl;process.env.HISTORY_SCHEMA='triage_private';
 const {pool,transaction}=await import('../apps/history-api/src/db.ts');
 try{
  const {UsernameAuth}=await import('../apps/history-api/src/username-auth.ts');
  const auth=await UsernameAuth.create(config.issuer,config.audience,config.teamId,JSON.parse(await readFile(config.signingKeyFile,'utf8')));
  if(command==='bootstrap'){
   await transaction(async c=>{await c.query('INSERT INTO team(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[config.teamId,config.teamName]);});
   const r=await auth.createUser(null,{username:name,displayName:display,role:'admin'});
   console.log('User ID: '+r.id+'\nTemporary password (24h, first change required): '+r.temporaryPassword);
  }else if(command==='recover-admin'||command==='map-user'){
   const {operatorAccount}=await import('../apps/history-api/src/operator.ts');
   const result=await operatorAccount(command,config.teamId,name,display);
   console.log('Temporary password (24h): '+result.temporaryPassword);
  }else throw Error('Use keygen PATH | bootstrap CONFIG USERNAME DISPLAY | recover-admin CONFIG UUID | map-user CONFIG UUID USERNAME');
 }finally{await pool.end();}
}

}
main().catch(()=>{console.error("OPERATOR_ACTION_FAILED");process.exitCode=1;});
