import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const target=join(resolve(env.ERP_MANAGER_PATH),'.claude/mail/history.local.json');
try{await access(target);console.log('Existing history configuration preserved.');process.exit(0);}catch{}
const response=await fetch('http://localhost:'+(env.TRIAGE_PORT??3080)+'/api/status',{headers:{Authorization:'Bearer '+env.TRIAGE_TOKEN}});
if(!response.ok)throw new Error('API connection failed; configuration not written');
await writeFile(target,JSON.stringify({url:'http://localhost:'+(env.TRIAGE_PORT??3080),token:env.TRIAGE_TOKEN,storeId:env.MAIL_STORE_ID},null,2),{flag:'wx',mode:0o600});
console.log('Connected erp-manager to the shared history API. Token not printed.');
