import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dragThread,touchThread} from './thread-dnd-browser.mjs';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-manual-threads-'.repeat(3);
const {createApp}=await import('../src/server.ts'),{config}=await import('../src/config.ts');
const mails=Array.from({length:4},(_,i)=>({id:i+1,messageId:`<${i+1}@example.test>`,fetchedAt:'2026-01-01T00:00:00Z',
 subject:['배송 일정 확인','Re: 배송 일정 확인','전달받은 배송 문의','별도 문의'][i],from:[{name:'합성 발신자',address:'sender@example.test'}],
 sentAt:'2026-01-01T00:00:00Z',inReplyTo:i===1?['<1@example.test>']:[],references:[]}));
let links=[],writes=0,failSave=false,failRefresh=false,failDetach=false;const errors=[];
const store={list:async()=>links,add:async(storeId,source,target)=>{
 writes++;if(failSave){failSave=false;throw Error('Synthetic save failure');}
 const link={id:randomUUID(),storeId,source,target,createdAt:new Date().toISOString()};links.push(link);return {link,created:true};
},remove:async(_store,id)=>{links=links.filter(link=>link.id!==id);return {ok:true};},detach:async(_store,mail,ids)=>{
 if(failDetach){failDetach=false;throw Error('Synthetic detach failure');}
 assert.ok(links.filter(link=>ids.includes(link.id)).every(link=>link.source.id===mail.id||link.target.id===mail.id));
 const before=links.length;links=links.filter(link=>!ids.includes(link.id));return {ok:true,removed:before-links.length};
}};
const server=createApp(async(name,args)=>{
 if(name==='get_email')return mails[args.id-1];
 if(name==='get_email_html')return {html:''};
 assert.equal(name,'search_emails');if(failRefresh){failRefresh=false;throw Error('Synthetic refresh failure');}
 return {emails:mails,nextOffset:null};
},async id=>({...mails[id-1],body:'합성 메일 본문 '+id,attachments:[]}),undefined,store,async()=> 'synthetic-sync').listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const context=await browser.newContext({viewport:{width:1440,height:1000},hasTouch:true,extraHTTPHeaders:{Authorization:'Bearer '+config.token}});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);await page.clock.install();
await page.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.violatedDirective));});
await page.route('**/api/status',route=>route.fulfill({json:{storeId:config.store,sync:null,worker:null}}));
await page.route('**/api/mail-analysis?*',route=>route.fulfill({json:[]}));
const status=page.locator('#thread-action-status'),group=()=>page.locator('.mail-thread').first();
const source=id=>page.locator('.thread-singleton .mail[data-mail-id="'+id+'"]');
const member=id=>page.locator('.mail-thread .mail[data-mail-id="'+id+'"]');
const detachZone=page.locator('#thread-detach-zone');
const count=async n=>page.getByText(n+'개 대화 · 4개 메일',{exact:true}).waitFor();
const undo=async()=>{await status.getByRole('button',{name:'되돌리기'}).click();await count(3);};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await count(3);
 assert.equal(await source(3).getAttribute('data-rfd-draggable-id'),'mail:3');
 assert.ok(await source(3).getAttribute('data-rfd-drag-handle-draggable-id'));
 assert.equal(await page.locator('[data-thread-pick]').count(),0);assert.equal(await detachZone.isVisible(),false);
 // Foreign and self drops never create a relation.
 const transfer=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('application/x-mail-triage-thread','foreign');return d;});
 await group().locator('summary').dispatchEvent('drop',{dataTransfer:transfer});assert.equal(writes,0);
 // Keyboard cancellation, linking and detaching use the library sensor too.
 await source(3).focus();await page.keyboard.press('Space');await page.clock.runFor(50);
 await page.keyboard.press('Escape');await page.clock.runFor(500);assert.equal(writes,0);
 await source(3).focus();await page.keyboard.press('Space');await page.clock.runFor(50);
 await page.keyboard.press('ArrowDown');await page.clock.runFor(250);
 await page.keyboard.press('Space');await page.clock.runFor(500);await count(2);assert.equal(links.length,1);
 await member(3).focus();await page.keyboard.press('Space');await page.clock.runFor(50);
 await page.keyboard.press('ArrowDown');await page.clock.runFor(250);
 await page.keyboard.press('Space');await page.clock.runFor(500);await count(3);assert.equal(links.length,0);
 const beforeSelf=writes;
 await dragThread(page,source(3),source(3));assert.equal(writes,beforeSelf);
 await dragThread(page,source(3),group().locator('summary'));await count(2);assert.equal(links.length,1);
 await page.locator('.thread-manual-badge').waitFor();assert.equal(await group().locator('.mail').count(),3);
 await group().locator('.mail[data-mail-id="3"]').click();await page.getByText('합성 메일 본문 3',{exact:true}).waitFor();
 await page.screenshot({path:'.runtime/manual-threads-desktop.png'});
 await undo();assert.equal(links.length,0);
 // A linked member can be dragged out after reload, without a pick button.
 await dragThread(page,source(3),group().locator('summary'));await count(2);
 await page.reload();await count(2);await page.locator('.thread-manual-badge').waitFor();
 await group().locator('summary').click();await member(3).waitFor({state:'visible'});
 assert.equal(await member(1).getAttribute('draggable'),null,'mail without a manual edge is not detachable');
 const beforeLinkedDrop=writes;await dragThread(page,member(3),source(4));assert.equal(writes,beforeLinkedDrop);assert.equal(links.length,1);
 await detachZone.evaluate(el=>{const dataTransfer=new DataTransfer();dataTransfer.setData('application/x-mail-triage-thread','foreign');el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer}));});assert.equal(links.length,1);
 failDetach=true;await dragThread(page,member(3),detachZone);await status.getByText(/해제하지 못했습니다/).waitFor();assert.equal(links.length,1);
 await dragThread(page,member(3),detachZone);await count(3);assert.equal(links.length,0);
 await page.reload();await count(3);assert.equal(await detachZone.isVisible(),false);
 await dragThread(page,source(3),group().locator('summary'));await count(2);
 await page.locator('#thread-link-manager>summary').click();await page.locator('#thread-link-list').getByRole('button',{name:'연결 해제'}).click();await count(3);
 await page.getByText('저장된 수동 연결이 없습니다.',{exact:true}).waitFor();
 // The connection popover covers list targets at narrow widths; close it before dragging.
 await page.locator('#thread-link-manager>summary').click();
 // Failed saves leave the list alone. A failed refresh after a save preserves undo.
 failSave=true;await dragThread(page,source(3),group().locator('summary'));await status.getByText(/연결하지 못했습니다/).waitFor();assert.equal(links.length,0);await count(3);
 failRefresh=true;await dragThread(page,source(3),group().locator('summary'));await status.getByText(/목록을 갱신하지 못했습니다/).waitFor();assert.equal(links.length,1);
 await undo();assert.equal(links.length,0);
 await page.setViewportSize({width:390,height:844});
 const back=page.getByRole('button',{name:'메일 목록으로',exact:true});if(await back.isVisible())await back.click();
 await dragThread(page,source(3),source(4));await count(2);assert.equal(links.length,1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.runtime/manual-threads-mobile.png'});
 await dragThread(page,member(3),detachZone);await count(3);assert.equal(links.length,0);
 await touchThread(page,source(3),source(4));await count(2);assert.equal(links.length,1);
 await touchThread(page,member(3),detachZone);await count(3);assert.equal(links.length,0);
 const beforeViewChange=writes;
 await source(3).focus();await page.keyboard.press('Space');await page.clock.runFor(50);
 await page.locator('#mail-view').selectOption('individual');await page.locator('#manual-thread-tools').waitFor({state:'hidden'});assert.equal(await detachZone.isVisible(),false);
 await page.clock.runFor(500);assert.equal(writes,beforeViewChange);assert.equal(await page.locator('[data-rfd-drag-handle-draggable-id]').count(),0);
 assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({library:'@hello-pangea/dnd',dragConnectAndDetach:true,keyboardConnectDetachCancel:true,touchConnectDetach:true,viewChangeCancels:true,noPickButtons:true,foreignSelfAndLinkedDropRejected:true,reload:true,unlink:true,undo:true,saveDetachAndRefreshFailure:true,narrowViewportMouseDrag:true,mailSelection:true,cspViolations:0,pageErrors:errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
await standalone(import.meta.url,verify);
