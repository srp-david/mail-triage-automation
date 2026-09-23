import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.ts';
import {ApiError} from '../packages/contracts/src/v1.ts';
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port,sourceId=randomUUID(),runId=randomUUID();
let logged=false,userId=randomUUID(),selected='';
const session={login:{},begin(){return origin+'/auth/callback?code=synthetic&state=synthetic';},async accept(){logged=true;},async identity(){if(!logged)throw new ApiError(401,'LOGIN_REQUIRED');return {userId};},async token(){if(!logged)throw new ApiError(401,'LOGIN_REQUIRED');return 'backend-only-fixture';},async logout(){logged=false;return {ok:true};}};
const run={id:runId,sourceId,storeId:sourceId,mailId:1,messageId:'<fixture@test>',subject:'합성 공유 보고서',status:'needs_input',agent:'codex',identityKind:'mcp',reviews:[],relatedMails:[],result:{report:'# 합성 저장 보고서',question:'합성 확인 질문',knowledge:''}};
const history={async get(){return run;},async request(path){if(path==='/sources')return [{id:sourceId,display_name:'공유 테스트 출처'}];if(path==='/collections'||path==='/runners'||path==='/members'||path.endsWith('/legacy'))return [];if(path==='/runs')return [run];throw Error('Unexpected fixture route '+path);}};
const context={async selection(){return {sourceId:selected,agent:'codex'};},async configure(value){selected=value.sourceId;return {ok:true};},async status(){return {storeId:selected,originalAvailable:false,sync:null,worker:{online:false,state:'stopped'}};}};
const control='synthetic-control-'.repeat(3);
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>localUiRoutes(app,history,context)}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const ticket=await (await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}})).json();
 await page.goto(ticket.url);await page.getByRole('button',{name:'회사 계정으로 로그인',exact:true}).click();await page.getByRole('heading',{name:'출처와 실행 설정'}).waitFor();
 await page.getByLabel('메일 출처',{exact:true}).selectOption(sourceId);await page.getByRole('button',{name:'선택 저장',exact:true}).click();await page.getByRole('link',{name:'분석 이력',exact:true}).click();
 await page.locator('#runs button').first().click();await page.getByRole('heading',{name:'합성 저장 보고서',exact:true}).waitFor();await page.getByLabel('추가 답변',{exact:true}).fill('사용자 A 합성 초안');
 await page.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('button',{name:'회사 계정으로 로그인',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.startsWith('triage-answer:'))),false);
 userId=randomUUID();await page.getByRole('button',{name:'회사 계정으로 로그인',exact:true}).click();await page.getByRole('link',{name:'분석 이력',exact:true}).click();await page.locator('#runs button').first().click();await page.getByLabel('추가 답변',{exact:true}).waitFor();assert.equal(await page.getByLabel('추가 답변',{exact:true}).inputValue(),'');
 assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('backend-only-fixture')),false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({nativeLogin:true,sourceSelection:true,sharedHistoryWithoutOriginal:true,userDraftIsolation:true,logout:true,realAuth0:false}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
