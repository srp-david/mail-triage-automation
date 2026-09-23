import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dragThread} from './thread-dnd-browser.mjs';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-scroll-'.repeat(4);
const {createApp}=await import('../src/server.ts'),{config}=await import('../src/config.ts');
const mails=Array.from({length:90},(_,i)=>({id:i+1,messageId:`<${i+1}@example.test>`,subject:'합성 문의 '+(i+1),
 fetchedAt:'2026-01-01T00:00:00Z',sentAt:new Date(Date.UTC(2026,0,i+1)).toISOString(),from:[{name:'합성 발신자',address:'sender@example.test'}],inReplyTo:[],references:[]}));
let links=[];const queries=[],errors=[];
const store={list:async()=>links,add:async(storeId,source,target)=>{const link={id:randomUUID(),storeId,source,target,createdAt:new Date().toISOString()};links.push(link);return {link,created:true};},
 remove:async(_store,id)=>{links=links.filter(link=>link.id!==id);return {ok:true};},detach:async(_store,_mail,ids)=>{const n=links.length;links=links.filter(link=>!ids.includes(link.id));return {ok:true,removed:n-links.length};}};
const server=createApp(async(name,args)=>{
 if(name==='get_email')return mails[args.id-1];if(name==='get_email_html')return {html:''};assert.equal(name,'search_emails');return {emails:mails,nextOffset:null};
},async id=>({...mails[id-1],body:Array.from({length:220},(_,i)=>'합성 본문 '+id+' · '+(i+1)+'번째 줄').join('\n'),attachments:[]}),undefined,store,async()=> 'synthetic-sync').listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const page=await browser.newPage({viewport:{width:1440,height:900},extraHTTPHeaders:{Authorization:'Bearer '+config.token}});page.setDefaultTimeout(10000);await page.clock.install();
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const url=new URL(r.url());if(url.pathname==='/api/mails')queries.push(Object.fromEntries(url.searchParams));});
await page.route('**/api/status',r=>r.fulfill({json:{storeId:config.store,sync:null,worker:{online:true,state:'ready'}}}));
await page.route('**/api/mail-analysis?*',r=>r.fulfill({json:[]}));await page.route('**/api/runs?*',r=>r.fulfill({json:[]}));
const list=page.locator('#mails'),detail=page.locator('#detail'),mail=id=>page.locator('.mail[data-mail-id="'+id+'"]');
const settle=()=>page.waitForFunction(()=>!document.querySelector('#mails').hasAttribute('aria-busy'));
const viewport=()=>page.evaluate(()=>({pageScroll:scrollY,pageOverflow:document.documentElement.scrollHeight>innerHeight,horizontal:document.documentElement.scrollWidth>innerWidth,
 listScroll:document.querySelector('#mails').scrollTop,detailScroll:document.querySelector('#detail').scrollTop}));
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await mail(90).waitFor();
 const head=await page.locator('.toolbar').boundingBox(),pager=await page.locator('.pager').boundingBox();
 assert.equal((await viewport()).pageOverflow,false);assert.ok(pager.y+pager.height<=900);
 await list.hover();await page.mouse.wheel(0,650);await page.waitForFunction(()=>document.querySelector('#mails').scrollTop>200);
 assert.equal((await viewport()).pageScroll,0);assert.deepEqual(await page.locator('.toolbar').boundingBox(),head);assert.deepEqual(await page.locator('.pager').boundingBox(),pager);
 await mail(82).click();await detail.locator('pre').waitFor();const listBefore=await list.evaluate(el=>el.scrollTop);
 await detail.hover();await page.mouse.wheel(0,800);await page.waitForFunction(()=>document.querySelector('#detail').scrollTop>400);
 const reading=await detail.evaluate(el=>el.scrollTop);assert.equal(await list.evaluate(el=>el.scrollTop),listBefore);assert.equal((await viewport()).pageScroll,0);
 assert.equal(await detail.locator('pre').evaluate(el=>getComputedStyle(el).overflowY),'visible');
 await mail(81).click();await page.waitForFunction(()=>document.querySelector('#detail h2').textContent==='합성 문의 81');assert.equal(await detail.evaluate(el=>el.scrollTop),0);
 await mail(82).click();await page.waitForFunction(()=>document.querySelector('#detail h2').textContent==='합성 문의 82');assert.equal(await detail.evaluate(el=>el.scrollTop),reading);
 // Refresh and manual mutations on page two retain the current page and visible anchor.
 await page.getByRole('button',{name:'다음',exact:true}).click();await mail(60).waitFor();await settle();assert.equal(await list.evaluate(el=>el.scrollTop),0);
 await list.evaluate(el=>el.scrollTop=500);await page.getByRole('button',{name:'검색',exact:true}).click();await mail(90).waitFor();await settle();
 await page.getByRole('button',{name:'다음',exact:true}).click();await mail(60).waitFor();await settle();await list.evaluate(el=>el.scrollTop=500);
 const visible=await list.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('.mail')].filter(m=>{const r=m.getBoundingClientRect();return r.top>b.top&&r.bottom<b.bottom;}).map(m=>Number(m.dataset.mailId));});
 assert.ok(visible.length>=2);const [source,target]=visible;
 await dragThread(page,mail(source),mail(target));await page.getByText('89개 대화 · 90개 메일',{exact:true}).waitFor();await settle();assert.equal(queries.at(-1).offset,'30');assert.ok(await list.evaluate(el=>el.scrollTop)>200);
 const zone=page.locator('#thread-detach-zone'),zoneBox=await zone.boundingBox();assert.ok(zoneBox.y+zoneBox.height<900);
 await dragThread(page,mail(source),zone);await page.getByText('90개 대화 · 90개 메일',{exact:true}).waitFor();await settle();assert.equal(queries.at(-1).offset,'30');assert.ok(await list.evaluate(el=>el.scrollTop)>200);
 await page.screenshot({path:'.runtime/mail-scroll-desktop.png'});
 for(const [width,height] of [[1920,1080],[1280,720],[1024,750],[901,701]]){
  await page.setViewportSize({width,height});assert.equal((await viewport()).pageOverflow,false,`${width}x${height}`);assert.equal((await viewport()).horizontal,false);
  const box=await list.boundingBox(),bottom=await page.locator('.pager').boundingBox();assert.ok(box.height>70,JSON.stringify(box));assert.ok(bottom.y+bottom.height<=height);
 }
 // Mobile has document scrolling only, and restores both the list and the reading position.
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'메일 목록으로',exact:true}).click();
 assert.equal(await list.evaluate(el=>getComputedStyle(el).overflowY),'visible');
 await page.locator('#thread-link-manager>summary').click();await page.getByText('저장된 수동 연결이 없습니다.',{exact:true}).waitFor();
 const popup=await page.locator('#thread-link-list').boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=390);await page.locator('#thread-link-manager>summary').click();
 await mail(50).scrollIntoViewIfNeeded();const mobileList=await page.evaluate(()=>scrollY);await mail(50).click();await detail.locator('pre').waitFor();
 await page.evaluate(()=>window.scrollTo(0,900));const mobileReading=await page.evaluate(()=>scrollY);
 await page.getByRole('button',{name:'메일 목록으로',exact:true}).click();assert.ok(Math.abs(await page.evaluate(()=>scrollY)-mobileList)<2);
 await mail(50).click();await detail.locator('pre').waitFor();assert.ok(Math.abs(await page.evaluate(()=>scrollY)-mobileReading)<2);
 assert.equal(await detail.locator('pre').evaluate(el=>getComputedStyle(el).overflowY),'visible');assert.equal((await viewport()).horizontal,false);
 await page.screenshot({path:'.runtime/mail-scroll-mobile.png'});
 await page.setViewportSize({width:1280,height:500});assert.equal(await list.evaluate(el=>getComputedStyle(el).overflowY),'visible');assert.equal((await viewport()).horizontal,false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({independentPaneScroll:true,fixedToolbarAndPager:true,noNestedBodyScroll:true,readingPosition:true,manualMutationPageAndScroll:true,smallDesktopHeights:true,mobileSingleScroll:true,mobilePositions:true,shortWindowFallback:true,pageErrors:errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
}
await standalone(import.meta.url,verify);
