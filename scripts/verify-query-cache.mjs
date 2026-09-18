import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-query-cache-'.repeat(3);
const {createApp}=await import('../src/server.ts');
const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage(),calls=[],errors=[];let sync=null,expired=false;
await page.clock.install();page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname;
 if(path==='/api/login'){expired=false;return route.fulfill({json:{ok:true}});}
 if(expired)return route.fulfill({status:401,json:{error:'expired'}});
 let json;
 if(path==='/api/status')json={storeId:'fixture',sync,worker:null};
 else if(path==='/api/mail-analysis')json=[];
 else if(path==='/api/mails'){
  const offset=Number(url.searchParams.get('offset'));calls.push({offset,view:url.searchParams.get('view'),force:url.searchParams.get('refresh')});
  json={emails:Array.from({length:30},(_,i)=>({id:offset+i+1,subject:'Synthetic '+(offset+i+1),from:[]})),total:90,nextOffset:offset<60?offset+30:null};
 }else throw Error('Unexpected request '+path);
 await route.fulfill({json});
});
const first=id=>page.locator('#mails .mail').first().filter({has:page.getByText('Synthetic '+id,{exact:true})}).waitFor();
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await first(1);
 await page.locator('#next').click();await first(31);assert.equal(calls.length,2);
 await page.locator('#previous').click();await first(1);assert.equal(calls.length,2,'Previous page uses React Query cache');
 await page.locator('#mail-view').selectOption('individual');await first(1);assert.equal(calls.length,3);
 await page.locator('#mail-view').selectOption('threads');await first(1);assert.equal(calls.length,3,'View cache keys are isolated and reusable');
 await page.clock.fastForward(16000);await page.locator('#next').click();await first(31);assert.equal(calls.length,4,'Expired page is fetched again');
 sync={id:'synthetic-sync',status:'completed',saved:1,failed:0,remaining:0,batch_count:1};
 await page.clock.fastForward(10000);await first(1);assert.equal(calls.at(-1).force,'1');
 const afterSync=calls.length;await page.locator('#next').click();await first(31);assert.equal(calls.length,afterSync+1,'Sync invalidates other cached pages');
 expired=true;await page.clock.fastForward(10000);await page.locator('#login:not([hidden])').waitFor();
 await page.locator('#token').fill('synthetic');await page.locator('#login-form button').click();await page.locator('#workspace:not([hidden])').waitFor();await first(31);
 const afterLogin=calls.length;await page.locator('#previous').click();await first(1);assert.equal(calls.length,afterLogin+1,'401 clears pages from the previous session');
 assert.deepEqual(errors,[]);
 const result={pageCache:true,viewIsolation:true,ttl:true,syncInvalidation:true,sessionClear:true,pageErrors:errors};
 await mkdir('.runtime/query-cache',{recursive:true});await writeFile('.runtime/query-cache/browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
