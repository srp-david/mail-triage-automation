import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://localhost:'+(env.TRIAGE_PORT??3080));
 await page.locator('#token').fill(env.TRIAGE_TOKEN);await page.locator('#login-form button').click();
 await page.locator('#mails .mail').first().waitFor({timeout:30000});
 const list=await page.evaluate(async()=>{const r=await fetch('/api/mails?limit=30');return r.json();});
 let chosen;
 for(let index=0;index<list.emails.length;index++){
   if(!list.emails[index].hasAttachments)continue;
   const mail=await page.evaluate(async id=>(await fetch('/api/mails/'+id)).json(),list.emails[index].id);
   const images=(mail.attachments??[]).filter(a=>a.contentType?.startsWith('image/')&&a.attachmentId);
   if(images.length){chosen={index,mail,images};break;}
 }
 assert.ok(chosen,'Need a real mail with images');
 await page.locator('#mails .mail').nth(chosen.index).click();
 await page.waitForFunction(count=>document.querySelectorAll('#detail .attachment-card img').length>=count&&[...document.querySelectorAll('#detail .attachment-card')].every(c=>c.querySelector('img')?.naturalWidth>0),chosen.images.length,{timeout:30000});
 const dimensions=await page.locator('#detail .attachment-card img').evaluateAll(imgs=>imgs.map(i=>({width:i.naturalWidth,height:i.naturalHeight})));
 assert.ok(dimensions.length>=chosen.images.length); // A CID image may legitimately recur in quoted replies.
 // A failed image must show a local retry and then recover, without duplicating the card.
 const target='**/api/mails/'+chosen.mail.id+'/attachments/'+encodeURIComponent(chosen.images[0].attachmentId);
 let attempts=0;
 await page.route(target,async route=>{
   if(attempts++===0)return route.fulfill({json:{isError:true,structuredContent:{message:'첨부 조회 테스트 실패'},content:[]}});
   await route.continue();
 });
 await page.locator('#mails .mail').nth(chosen.index).click();
 const inline=page.locator('#detail .inline-image[data-attachment-id="'+chosen.images[0].attachmentId+'"]');
 const first=await inline.count()?inline.first():page.locator('#detail .mail-images .attachment-card').first();
 await first.getByText('첨부 조회 테스트 실패',{exact:true}).waitFor();
 await first.getByRole('button',{name:'다시 불러오기'}).click();
 await page.waitForFunction(count=>document.querySelectorAll('#detail .attachment-card img').length>=count&&[...document.querySelectorAll('#detail .attachment-card')].every(c=>c.querySelector('img')?.naturalWidth>0),chosen.images.length,{timeout:30000});
 assert.equal(await page.locator('#detail .attachment-card').count(),dimensions.length);
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/images-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
 assert.equal(overflow,false);assert.deepEqual(errors,[]);
 await page.screenshot({path:'.runtime/images-mobile.png',fullPage:true});
 console.log(JSON.stringify({mailId:chosen.mail.id,automaticImages:dimensions,failedImageRetry:true,duplicateCards:false,mobileOverflow:overflow,pageErrors:errors}));
}finally{await browser.close();}
