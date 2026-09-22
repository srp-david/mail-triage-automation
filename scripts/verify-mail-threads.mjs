import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {standalone} from './browser-scenario.mjs';

export async function verify(browser){
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-thread-token-'.repeat(3);
const {createApp}=await import('../src/server.ts');
const mail=id=>({id,messageId:id===1?'<root@example.test>':`<${id}@example.test>`,subject:id<=105?'배송 일정 확인':'같은 제목의 별개 문의',
 from:[{name:'합성 발신자',address:'sender@example.test'}],sentAt:id===105?'2026-02-01T00:00:00Z':'2026-01-01T00:00:00Z',
 fetchedAt:'2026-01-01T00:00:00Z',inReplyTo:id>1&&id<=105?['<root@example.test>']:[],references:[]});
const all=Array.from({length:140},(_,index)=>mail(index+1));
let missingMetadata=false,failSearch=false;const searchCalls=[],analysisBatches=[],errors=[];
const server=createApp(async(name,args)=>{
 if(name==='get_email_html')return {html:''};
 assert.equal(name,'search_emails');searchCalls.push(args);
 if(failSearch){failSearch=false;throw Error('Synthetic search failure');}
 let emails=args.query==='없음'?[]:all;
 const total=emails.length;emails=emails.slice(args.offset,args.offset+args.limit);
 if(missingMetadata)emails=emails.map(({inReplyTo,references,...rest})=>rest);
 return {emails,total,nextOffset:args.offset+args.limit<total?args.offset+args.limit:null};
},async id=>({...mail(id),body:'개별 메일 본문 '+id,attachments:[]}),undefined,{list:async()=>[]},async()=> 'synthetic-sync').listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const context=await browser.newContext({viewport:{width:1280,height:900},extraHTTPHeaders:{Authorization:'Bearer '+process.env.TRIAGE_TOKEN}});
const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
await page.clock.install();
await page.route('**/api/status',route=>route.fulfill({json:{storeId:'synthetic',sync:null,worker:null}}));
await page.route('**/api/mail-analysis?*',route=>{
 const ids=new URL(route.request().url()).searchParams.get('mailIds').split(',').map(Number);analysisBatches.push(ids.length);assert.ok(ids.length<=100);
 return route.fulfill({json:ids.map(mailId=>({mailId,runCount:mailId===105?1:0,completedCount:mailId===105?1:0,handledAt:mailId===104?'2026-02-01':null,legacyCount:0,latestStatus:mailId===105?'completed':null}))});
});
const button=name=>page.getByRole('button',{name,exact:true});
const first=()=>page.locator('.mail-thread').first();
const search=async()=>{await button('검색').click();};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByText('36개 대화 · 140개 메일',{exact:true}).waitFor();
 assert.equal(await page.locator('.mail-thread').count(),1);assert.equal(await first().getAttribute('open'),null);
 await first().locator('summary .analysis-badge.completed').getByText('✓ 분석 완료 1/105',{exact:true}).waitFor();
 await first().locator('summary .analysis-badge.handled').getByText('✓ 처리 완료 1/105',{exact:true}).waitFor();
 assert.equal(await page.locator('#mails > .thread-singleton').count(),29);
 await first().locator('summary').focus();await page.keyboard.press('Enter');
 await first().locator('.mail').first().waitFor({state:'visible'});
 assert.equal(await first().locator('.mail').count(),105);
 await first().locator('.mail').first().click();await button('결과 보기').waitFor();
 assert.equal(await page.locator('#detail pre').textContent(),'개별 메일 본문 105');
 await first().locator('summary').click();await page.waitForFunction(()=>!document.querySelector('.mail-thread').open);
 await search();await page.waitForFunction(()=>document.querySelector('#mails').getAttribute('aria-busy')===null);
 assert.equal(await first().getAttribute('open'),null);assert.equal(await button('결과 보기').isVisible(),true);
 await button('다음').click();await page.waitForFunction(()=>document.querySelectorAll('#mails > .thread-singleton').length===6);
 assert.equal(await button('다음').isDisabled(),true);await button('이전').click();await first().waitFor();
 await page.locator('#mail-view').selectOption('individual');await page.getByText('140건',{exact:true}).waitFor();assert.equal(await page.locator('.mail-thread').count(),0);
 await page.locator('#mail-view').selectOption('threads');await first().waitFor();
 await page.locator('#query').fill('조건');await page.locator('#from').fill('sender@example.test');await page.locator('#after').fill('2026-01-01');
 await search();await page.waitForFunction(()=>document.querySelector('#mails').getAttribute('aria-busy')===null);
 assert.equal(searchCalls.at(-1).query,'조건');assert.equal(searchCalls.at(-1).from_address,'sender@example.test');assert.ok(searchCalls.at(-1).sent_after);
 await page.locator('#query').fill('없음');await search();await button('검색 조건 초기화').waitFor();await button('검색 조건 초기화').click();await first().waitFor();
 failSearch=true;await search();await button('다시 조회').waitFor();await button('다시 조회').click();await first().waitFor();
 missingMetadata=true;await search();await page.locator('#mails').getByText(/MCP 업데이트/).waitFor();
 await page.locator('#mail-view').selectOption('individual');await page.getByText('140건',{exact:true}).waitFor();
 missingMetadata=false;await page.locator('#mail-view').selectOption('threads');await first().waitFor();
 await first().locator('summary').click();await first().locator('.mail').first().waitFor({state:'visible'});
 await first().locator('.mail .analysis-badge.completed').waitFor();await first().locator('.mail .analysis-badge.handled').waitFor();
 await mkdir('.runtime',{recursive:true});await page.screenshot({path:'.runtime/mail-threads-desktop.png'});
 await page.setViewportSize({width:390,height:844});await button('메일 목록으로').click();
 await first().locator('.mail').first().click();await page.locator('#mail-list').waitFor({state:'hidden'});
 await button('메일 목록으로').click();
 assert.equal(await page.locator('.mail.is-selected').evaluate(node=>node===document.activeElement),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'.runtime/mail-threads-mobile.png'});
 assert.ok(analysisBatches.includes(100));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({threadPagination:true,keyboardExpand:true,collapsePreserved:true,individualMailSelection:true,analysisBatches:true,viewSwitch:true,searchAndRetry:true,oldMcpFallback:true,mobileFocus:true,pageErrors:errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
await standalone(import.meta.url,verify);
