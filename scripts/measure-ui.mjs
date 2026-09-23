import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-ui-timing-'.repeat(3);
const {createApp}=await import('../src/server.ts');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const measurements=[];
try{
 for(const variant of process.env.LEGACY_BASE_URL?['legacy','react']:['react']){
  const server=variant==='react'?createApp().listen(0,'127.0.0.1'):null;if(server)await new Promise(r=>server.once('listening',r));
  const base=server?'http://127.0.0.1:'+server.address().port:process.env.LEGACY_BASE_URL;
  try{for(let sample=0;sample<3;sample++){
   const page=await browser.newPage({viewport:{width:1280,height:900}}),requests=[];
   page.on('request',r=>requests.push(r.url()));
   await page.route('**/api/**',route=>{const p=new URL(route.request().url()).pathname;let json;
    if(p==='/api/status')json={storeId:'fixture',sync:null,worker:null};
    else if(p==='/api/mails')json={emails:Array.from({length:1000},(_,i)=>({id:i+1,subject:'합성 메일 '+(i+1),from:[]})),total:1000,nextOffset:null};
    else if(p==='/api/mail-analysis')json=[];
    else if(p==='/api/mails/1')json={id:1,subject:'합성 메일 1',body:'합성 본문\n'.repeat(200),attachments:[]};
    else if(p.endsWith('/body'))json={html:''};
    else throw Error(p);
    return route.fulfill({json});});
   const start=performance.now();await page.goto(base);await page.locator('.mail').nth(999).waitFor({state:'attached'});const listMs=performance.now()-start;
   const select=performance.now();await page.locator('.mail').first().click();await page.locator('#detail pre').waitFor();const detailMs=performance.now()-select;
   assert.ok(!requests.some(url=>url.includes('.wasm')||url.includes('/preview/')));
   const assets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>['script','link'].includes(r.initiatorType)).map(r=>({name:new URL(r.name).pathname,bytes:r.decodedBodySize})));
   measurements.push({variant,sample,rows:1000,listMs:Math.round(listMs),detailMs:Math.round(detailMs),requests:requests.length,assetBytes:assets.reduce((n,r)=>n+r.bytes,0),officeLoaded:false});await page.close();
  }}finally{if(server)await new Promise(r=>server.close(r));}
 }
 await mkdir('.runtime/react-validation',{recursive:true});await writeFile('.runtime/react-validation/timing.json',JSON.stringify(measurements,null,2));console.log(JSON.stringify(measurements));
}finally{await browser.close();}
