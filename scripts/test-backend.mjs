import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['scripts/test-isolated.mjs','--all',...process.argv.slice(2)],{stdio:'inherit'});
process.exitCode=result.status??1;
