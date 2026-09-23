import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {testDatabase} from './test-database.mjs';
const args=process.argv.slice(2),all=args.includes('--all'),external=args.includes('--external');
if(external&&!process.env.TRIAGE_CLI_SOURCE)throw Error('Provide TRIAGE_CLI_SOURCE for the external erp-manager CLI contract test');
const db=await testDatabase();
try{
 const projects=external?['external']:all?['unit','ui','integration']:['integration'];
 const result=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...projects.flatMap(name=>['--project',name]),...args.filter(x=>!['--all','--external'].includes(x))],{env:{...process.env,TEST_DATABASE_URL:db.url,DATABASE_URL:db.url,HISTORY_SCHEMA:''},encoding:'utf8',maxBuffer:20*1024*1024});
 await writeFile(db.directory+'/tests.log',(result.stdout??'')+(result.stderr??''));
 console.log((result.stdout??'').split('\n').slice(-14).join('\n'));
 if(result.status!==0)console.error(result.stderr);
 console.log('Artifact: '+db.directory+'/tests.log');process.exitCode=result.status??1;
}finally{await db.close();}
