import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readFile,mkdir } from 'node:fs/promises';
const env=Object.fromEntries((await readFile('.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],unexpected=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().includes('/injected-request'))unexpected.push(r.url());});
try{
 await page.goto('http://localhost:'+(env.TRIAGE_PORT??3080));
 await page.locator('#token').fill(env.TRIAGE_TOKEN);await page.locator('#login-form button').click();
 await page.locator('#mails .mail').first().waitFor({timeout:30000});
 const security=await page.evaluate(async()=>{
   const {renderMailBody}=await import('/mail-body.js');
   const attachments=[{attachmentId:'1.2',contentType:'image/png',filename:'screen.png'}];
   const result=renderMailBody({
     html:'<p id="login" onclick="alert(1)">Before<img src="cid:screen%40example">After</p>'
      +'<p>Again<img src="cid:screen%40example"></p><img src="/injected-request">'
      +'<img srcset="/injected-request 1x" src="cid:missing">'
      +'<script>window.injected=true</script><iframe src="/injected-request"></iframe>'
      +'<style>body{background:url(/injected-request)}</style>'
      +'<svg><image href="/injected-request"></image></svg>'
      +'<a href="javascript:alert(1)">bad</a><a href="https://example.com">good</a>',
     inlineImages:[{contentId:'screen@example',attachmentId:'1.2'}]
   },attachments,async()=>({content:[]}));
   document.querySelector('#detail').append(result.element);
   const card=result.element.querySelector('.inline-image');
   const ambiguous=renderMailBody({html:'<img src="cid:same">',inlineImages:[
     {contentId:'same',attachmentId:'1.2'},{contentId:'same',attachmentId:'1.2'}
   ]},attachments,async()=>({content:[]}));
   return {
     before:card.previousSibling.textContent,after:card.nextSibling.textContent,
     repeated:result.cards.length,used:[...result.used],ambiguous:ambiguous.cards.length,
     active:result.element.querySelectorAll('script,iframe,style,svg,[id],[onclick],[srcset],a[href^="javascript:"]').length,
     unknown:result.element.querySelectorAll('.image-unavailable').length,
     goodLink:result.element.querySelector('a[href]')?.getAttribute('rel')
   };
 });
 assert.deepEqual(security,{before:'Before',after:'After',repeated:2,used:['1.2'],ambiguous:0,active:0,unknown:2,goodLink:'noopener noreferrer'});
 const list=await page.evaluate(async()=>(await fetch('/api/mails?limit=30')).json());
 let chosen;
 for(let index=0;index<list.emails.length;index++){
   if(!list.emails[index].hasAttachments)continue;
   const id=list.emails[index].id;
   const info=await page.evaluate(async id=>{
     const [mail,body]=await Promise.all([fetch('/api/mails/'+id).then(r=>r.json()),fetch('/api/mails/'+id+'/body').then(r=>r.json())]);
     return {mail,body};
   },id);
   if(info.body.html&&info.body.inlineImages?.length){chosen={index,...info};break;}
 }
 assert.ok(chosen,'Need a real HTML mail with CID images');
 await page.locator('#mails .mail').nth(chosen.index).click();
 await page.locator('#detail .mail-body .inline-image img').first().waitFor({timeout:30000});
 await page.waitForFunction(()=>[...document.querySelectorAll('#detail .attachment-card')].every(c=>c.querySelector('img')?.naturalWidth>0),null,{timeout:30000});
 const actual=await page.locator('#detail .mail-body .inline-image').evaluateAll(nodes=>nodes.map(n=>({
   id:n.dataset.attachmentId,width:n.querySelector('img').naturalWidth,
   height:n.querySelector('img').naturalHeight,parent:n.parentElement.tagName
 })));
 assert.ok(actual.length>0);
 const gallery=await page.locator('#detail .mail-images .attachment-card').count();
 for(const id of new Set(actual.map(x=>x.id)))assert.ok(chosen.body.inlineImages.some(x=>x.attachmentId===id));
 const firstId=actual[0].id;
 // Fetch failures remain retryable at exactly the same position.
 let attempts=0;
 await page.route('**/api/mails/'+chosen.mail.id+'/attachments/'+firstId,async route=>{
   if(attempts++===0)return route.fulfill({json:{isError:true,structuredContent:{message:'인라인 이미지 테스트 실패'},content:[]}});
   await route.continue();
 });
 await page.locator('#mails .mail').nth(chosen.index).click();
 const first=page.locator('#detail .inline-image[data-attachment-id="'+firstId+'"]').first();
 await first.getByText('인라인 이미지 테스트 실패',{exact:true}).waitFor();
 await first.getByRole('button',{name:'다시 불러오기'}).click();
 await first.locator('img').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('#detail .attachment-card')].every(c=>c.querySelector('img')?.naturalWidth>0));
 assert.equal(await page.locator('#detail .mail-body .inline-image').count(),actual.length);
 await mkdir('.runtime',{recursive:true});
 await page.locator('#detail').screenshot({path:'.runtime/inline-images-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await page.locator('#detail').screenshot({path:'.runtime/inline-images-mobile.png'});
 // Older/offline MCP falls back to the full plain body and on-demand attachment previews.
 await page.route('**/api/mails/'+chosen.mail.id+'/body',route=>route.fulfill({status:503,json:{error:'test unavailable'}}));
 await page.locator('#mails .mail').nth(chosen.index).click();
 await page.getByText('본문 서식을 불러오지 못해 텍스트로 표시합니다. 이미지는 첨부파일 목록의 미리보기로 확인할 수 있습니다.',{exact:true}).waitFor();
 assert.equal(await page.locator('#detail .mail-images .attachment-card').count(),0);
 assert.equal(await page.locator('#detail > pre').textContent(),chosen.mail.body);
 assert.equal(await page.locator('#detail .mail-body').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 console.log(JSON.stringify({mailId:chosen.mail.id,inlineImages:actual,remainingGallery:gallery,security,inlineRetry:true,plainFallback:true,mobileOverflow:false,pageErrors:errors,unexpectedRequests:unexpected}));
}finally{await browser.close();}
