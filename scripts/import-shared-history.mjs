// Operator-only. Input files contain private data and must live outside Git.
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {databaseConnection} from '../dist/apps/history-api/src/db-connection.js';
import {importHistory} from '../dist/apps/history-api/src/import-history.js';
const [bundlePath,planPath,option,confirmation]=process.argv.slice(2);
if(!bundlePath||!planPath||option&&option!=='--confirm'||option&&!/^[a-f0-9]{64}$/.test(confirmation??''))throw Error('Usage: import-shared-history.mjs BUNDLE PLAN [--confirm HASH]');
if(!process.env.MIGRATION_DATABASE_URL_FILE)throw Error('MIGRATION_DATABASE_URL_FILE required');
const c=new pg.Client(databaseConnection((await readFile(process.env.MIGRATION_DATABASE_URL_FILE,'utf8')).trim(),process.env.HISTORY_DB_CA_BASE64));
try{await c.connect();await c.query('SET search_path TO triage_private');const result=await importHistory(c,JSON.parse(await readFile(bundlePath,'utf8')),JSON.parse(await readFile(planPath,'utf8')),confirmation);console.log(JSON.stringify(result));}
catch(error){console.error(/^[A-Z_]+$/.test(error.message)?error.message:'HISTORY_IMPORT_FAILED');process.exitCode=1;}finally{await c.end();}
