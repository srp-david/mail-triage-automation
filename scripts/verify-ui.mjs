import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:'+(env.TRIAGE_PORT??3080));
 await page.locator('#login:not([hidden])').waitFor();
 await page.locator('#token').fill(env.TRIAGE_TOKEN);
 await page.locator('#login-form button').click();
 await page.locator('#workspace:not([hidden])').waitFor();
 await page.locator('#mails .mail').first().waitFor({timeout:30000});
 const count=await page.locator('#mails .mail').count();
 const summaries=await page.evaluate(async()=>{
   const ids=[...document.querySelectorAll('.mail-analysis')].map(e=>e.dataset.mailId).join(',');
   const response=await fetch('/api/mail-analysis?'+new URLSearchParams({mailIds:ids}));
   if(!response.ok)throw new Error('Analysis summary request failed');return response.json();
 });
 await page.waitForFunction(rows=>rows.every(row=>{
   const item=document.querySelector('.mail-analysis[data-mail-id="'+row.mailId+'"]');
   return item&&Boolean(item.querySelector('.completed'))===(row.completedCount>0)
     && Boolean(item.querySelector('.legacy'))===(row.legacyCount>0);
 }),summaries);
 const completedMailCount=await page.locator('#mails .analysis-badge.completed').count();
 assert.equal(completedMailCount,summaries.filter(row=>row.completedCount>0).length);
 const status=await page.evaluate(()=>fetch('/api/status').then(r=>r.json()));
 if(status.sync){const display=await page.locator('#sync-status').textContent();assert.ok(display.includes('저장 '+status.sync.saved+'건'));}
 await page.getByRole('link',{name:'이전 이력',exact:true}).click();
 const legacyRows=await page.evaluate(()=>fetch('/api/legacy').then(r=>r.json()));
 if(legacyRows.length)await page.locator('#legacy-list .run').first().waitFor();
 assert.equal(await page.locator('#legacy-list .run').count(),legacyRows.length);
 await page.getByRole('link',{name:'메일함',exact:true}).click();
 await page.locator('#mails .mail').first().click();
 await page.locator('#detail > pre, #detail > .mail-body').first().waitFor({timeout:30000});
 await page.locator('#next').click();
 await page.waitForTimeout(1000);
 await page.locator('#previous').click();
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/ui-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'.runtime/ui-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 if(errors.length||overflow)throw new Error(JSON.stringify({errors,overflow}));
 const result={login:true,mailListCount:count,analysisBadgesMatch:true,completedMailCount,detail:true,pagination:true,legacyCount:legacyRows.length,syncDisplay:true,mobileOverflow:overflow,pageErrors:errors};
 await writeFile('.runtime/live-ui-validation.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
