// Read-only smoke test. Does not create a business analysis/history entry.
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('/work/smoke',{recursive:true});
const prompt='This is a bounded integration check, not a mail-triage task. Do not read workspace instructions, sync mail or send reviews. Use mail.search_emails with limit=1, then mail.get_email with that ID and body_limit=1. Use db.execute_query against database sr with SELECT 1 AS CONNECTION_OK FROM DUAL and maxRows=1. Finally execute a shell command that checks whether /reference/tools/erp-nav.mjs and /erp/gg/src/main/webapp exist, without reading their contents. Reply with exactly one line containing MAIL_OK, DB_OK and FILES_OK only if those checks succeeded. Do not output email subjects, addresses, bodies, credentials, or DB connection details.';
const output='/work/smoke/result.txt';let buffer='';const calls=[];
const child=spawn('codex',['exec','--enable','use_legacy_landlock','--skip-git-repo-check','--sandbox','read-only','--json','-C','/work','-o',output,'-'],{stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME,CODEX_HOME:process.env.CODEX_HOME}});
let error='';
child.stdout.on('data',chunk=>{
 buffer+=String(chunk);
 while(buffer.includes('\n')){const end=buffer.indexOf('\n');const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  try{const e=JSON.parse(line);if(e.type==='item.completed'&&e.item?.type==='command_execution')calls.push({command:e.item.command,exit_code:e.item.exit_code,output:e.item.aggregated_output});if(e.type==='item.completed'&&e.item?.type==='mcp_tool_call')calls.push({server:e.item.server,tool:e.item.tool,status:e.item.status,isError:e.item.result?.isError??false,emailId:e.item.arguments?.id??null});}catch{}
 }
});
child.stderr.on('data',chunk=>{error=(error+String(chunk)).slice(-10000);});
child.stdin.end(prompt);
const timer=setTimeout(()=>child.kill('SIGTERM'),180000);
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);
await writeFile('/work/smoke/events.json',JSON.stringify(calls));
if(code!==0){await writeFile('/work/smoke/error.log',error);console.log(JSON.stringify({ok:false,exit:code,detail:'/work/smoke/error.log'}));process.exitCode=1;}
else{const summary=(await readFile(output,'utf8')).trim();console.log(JSON.stringify({ok:['search_emails','get_email','execute_query'].every(t=>calls.some(c=>c.tool===t&&c.status==='completed'&&!c.isError))&&calls.some(c=>c.command&&c.exit_code===0),calls},null,2));}
