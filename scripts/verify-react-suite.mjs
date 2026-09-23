import {spawnSync} from 'node:child_process';
const names=process.argv.slice(2);
if(names.some(name=>!["pre-p1-ux","status-filter","mail-threads","manual-threads","mail-scroll","image-preview","preview","mail-analysis","analysis-progress","handling-ui","related-mails","history-ui","markdown","maintenance-ui","sync-refresh","mui-ui"].includes(name)))throw Error('Unknown React scenario');
const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test',...names.map(name=>'test/e2e/'+name+'.spec.ts')],{stdio:'inherit',env:{...process.env,PREVIEW_BASE_URL:''}});
process.exitCode=result.status??1;
