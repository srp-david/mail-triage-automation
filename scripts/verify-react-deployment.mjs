// Read-only deployment evidence. Never starts an analysis or a mail sync.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {client,sha256} from './admin-client.mjs';
const mode=process.argv[2];assert.ok(['before','after'].includes(mode));
const directory='.runtime/react-deployment';await mkdir(directory,{recursive:true});
const {api}=await client(),status=await api('/status');
async function all(path){const result=[];for(let offset=0;;offset+=100){const rows=await api(path+'?offset='+offset);result.push(...rows);if(rows.length<100)return result;}}
const runs=await all('/runs'),legacy=await all('/legacy');
assert.equal(runs.filter(r=>['queued','running'].includes(r.status)).length,0,'Active analysis must finish first');
assert.ok(!['running','retrying','stopping'].includes(status.sync?.status),'Active sync must finish first');
const hashes=[];
for(const run of runs){const detail=await api('/runs/'+run.id);hashes.push(['run:'+run.id,sha256(JSON.stringify({result:detail.result,reviews:detail.reviews,handled_at:detail.handled_at,relatedMails:detail.relatedMails}))]);}
for(const item of legacy){const detail=await api('/legacy/'+item.id);hashes.push(['legacy:'+item.id,sha256(JSON.stringify(detail))]);}
hashes.push(['thread-links',sha256(JSON.stringify(await api('/thread-links')))]);hashes.sort((a,b)=>a[0].localeCompare(b[0]));
const containers=Object.fromEntries(['db','worker'].map(service=>[service,JSON.parse(execFileSync('docker',['inspect','mail-triage-web-'+service+'-1','--format','{{json .}}'],{encoding:'utf8'})).Id]));
const snapshot={hashes,containers,runs:runs.length,legacy:legacy.length,worker:status.worker?.state,online:status.worker?.online,sync:status.sync?.status};
if(mode==='before'){await writeFile(directory+'/before.json',JSON.stringify(snapshot,null,2));console.log(JSON.stringify({ready:true,runs:runs.length,legacy:legacy.length,worker:snapshot.worker,online:snapshot.online,sync:snapshot.sync}));}
else{
 const before=JSON.parse(await readFile(directory+'/before.json','utf8'));assert.deepEqual(hashes,before.hashes);assert.deepEqual(containers,before.containers);
 const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
 const base='http://localhost:'+(env.TRIAGE_PORT??3080),html=await readFile('public/react/index.html','utf8');
 const index=await fetch(base+'/');assert.equal(index.status,200);const servedHtml=await index.text();
 const nonce=servedHtml.match(/<meta name="csp-nonce" content="([A-Za-z0-9+/=]+)">/);assert.ok(nonce);assert.ok(index.headers.get('content-security-policy').includes("'nonce-"+nonce[1]+"'"));
 assert.equal(sha256(servedHtml.replace(nonce[0],'')),sha256(html));
 const assets=[...html.matchAll(/(?:src|href)="(\/react\/[^\"]+)"/g)].map(m=>m[1]);
 for(const path of assets){const response=await fetch(base+path);assert.equal(response.status,200);assert.equal(sha256(Buffer.from(await response.arrayBuffer())),sha256(await readFile('public'+path)));}
 assert.equal((await fetch(base+'/health')).status,200);
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],mutations=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')mutations.push(new URL(r.url()).pathname);});
 let mailRead=false,reportRead=false;
 try{
  await page.goto(base);await page.locator('#token').fill(env.TRIAGE_TOKEN);await page.locator('#login-form button').click();await page.locator('#workspace:not([hidden])').waitFor();
  await page.locator('#mails .mail').first().waitFor({state:'attached'});
  if(await page.locator('#mails .mail').count()){
   if(!await page.locator('.mail:visible').count())await page.locator('.thread-summary').first().click();
   await page.locator('.mail:visible').first().click();await page.locator('.mail-actions').waitFor();mailRead=true;
  }
  if(runs.length){await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#runs button').first().click();await page.locator('#report > h2').waitFor();reportRead=true;await page.keyboard.press('Escape');}
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.deepEqual(mutations,['/api/login']);
 }finally{await browser.close();}
 const result={health:true,assetHashes:true,preservedRuns:runs.length,preservedLegacy:legacy.length,threadLinksPreserved:true,dbWorkerContainersUnchanged:true,workerOnline:snapshot.online,mailRead,reportRead,mobile:true,pageErrors:errors,mutations};
 await writeFile(directory+'/after.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
