import { randomBytes } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
try{await access('.env');console.log('.env already exists; unchanged.');process.exit(0);}catch{}
let text=await readFile('.env.example','utf8');
text=text.replace('POSTGRES_PASSWORD=replace-with-random-value','POSTGRES_PASSWORD='+randomBytes(24).toString('hex'));
text=text.replace('TRIAGE_TOKEN=replace-with-random-value','TRIAGE_TOKEN='+randomBytes(32).toString('hex'));
await writeFile('.env',text,{flag:'wx',mode:0o600});
console.log('Created .env. Keep it private.');
