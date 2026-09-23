import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';

export async function testDatabase(){
 const name='triage-test-'+randomUUID().slice(0,8),directory=resolve('.runtime',name);
 await mkdir(directory,{recursive:true});
 const password=randomBytes(24).toString('hex'),envFile=directory+'/db.env';
 await writeFile(envFile,'POSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=triage\n');
 const docker=args=>{const result=spawnSync('docker',args,{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr||'Docker is required for isolated integration tests');return result.stdout.trim();};
 let created=false;
 const close=async()=>{if(created){docker(['rm','-f',name]);created=false;}await unlink(envFile).catch(()=>{});};
 try{
  docker(['run','-d','--name',name,'--env-file',envFile,'-p','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data','postgres:17']);created=true;
  const port=docker(['port',name,'5432/tcp']).split(':').at(-1),url=`postgres://postgres:${password}@127.0.0.1:${port}/triage`;
  for(let attempt=0;attempt<60;attempt++){
   const client=new pg.Client({connectionString:url});
   try{await client.connect();await client.end();return {url,directory,close};}
   catch{await client.end().catch(()=>{});await delay(250);}
  }
  throw Error('Isolated test PostgreSQL did not become ready');
 }catch(error){await close();throw error;}
}
