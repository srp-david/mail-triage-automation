import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {mapLegacy} from '../dist/apps/history-api/src/mapping.js';
const [file,option,confirm]=process.argv.slice(2);
if(!file||option&&option!=='--confirm'||option&&!/^[a-f0-9]{64}$/.test(confirm??''))throw new Error('Usage: map-v1-legacy.mjs PLAN_JSON [--confirm PREVIEW_SHA256]');
if(!process.env.MIGRATION_DATABASE_URL)throw new Error('MIGRATION_DATABASE_URL required; runtime credentials are not used');
const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
try{await client.connect();const result=await mapLegacy(client,JSON.parse(await readFile(file,'utf8')),confirm);console.log(JSON.stringify(result,null,2));}
catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'MAPPING_FAILED');process.exitCode=1;}
finally{await client.end();}
