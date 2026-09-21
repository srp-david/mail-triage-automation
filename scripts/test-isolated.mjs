import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';
import {setTimeout as delay} from 'node:timers/promises';
const name='triage-free-tests-'+randomUUID().slice(0,8),dir=resolve('.runtime',name);await mkdir(dir,{recursive:true});
const password=randomBytes(24).toString('hex');await writeFile(dir+'/db.env','POSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=triage\n');
const docker=args=>{const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim();};
try{
 docker(['run','-d','--name',name,'--env-file',dir+'/db.env','-p','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data','postgres:17']);
 const port=docker(['port',name,'5432/tcp']).split(':').at(-1),url=`postgres://postgres:${password}@127.0.0.1:${port}/triage`;
 for(let i=0;i<50;i++){const c=new pg.Client({connectionString:url});try{await c.connect();await c.end();break;}catch{await c.end().catch(()=>{});await delay(200);}}
 const files=process.argv.slice(2).length?process.argv.slice(2):(await readdir('test')).filter(n=>n.endsWith('.test.ts')).map(n=>'test/'+n);
 const r=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=4',...files],{env:{...process.env,DATABASE_URL:url,HISTORY_SCHEMA:''},encoding:'utf8',maxBuffer:20*1024*1024});
 await writeFile(dir+'/tests.log',(r.stdout??'')+(r.stderr??''));console.log((r.stdout??'').split('\n').slice(-14).join('\n'));console.log('Artifact: '+dir+'/tests.log');process.exitCode=r.status??1;
}finally{docker(['rm','-f',name]);}
