import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const workspace=fileURLToPath(new URL('..',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const args=['compose','--profile','verification','run','--no-deps','--rm'];
for(const dir of ['src','apps','packages','test','public','installer'])args.push('--volume',`${workspace}/${dir}:/app/${dir}:ro`);
args.push('tests','npm','test');
const result=spawnSync('docker',args,{stdio:'inherit'});process.exitCode=result.status??1;
