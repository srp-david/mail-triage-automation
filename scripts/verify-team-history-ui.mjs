// Synthetic browser fixture. Never connects to Supabase or real user accounts.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright-core';
import {createBrowserApp} from '../apps/local-app/src/browser-app.ts';
import {localUiRoutes} from '../apps/local-app/src/ui-routes.ts';

await mkdir('.runtime/team-ui',{recursive:true});const home=await mkdtemp(resolve('.runtime/team-ui/run-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const origin='http://127.0.0.1:'+port,control=randomBytes(32).toString('base64url');
const teamId=randomUUID(),userId=randomUUID(),sourceId=randomUUID(),runId=randomUUID();
const teams=[{id:teamId,name:'개발1팀'}],users=[{id:userId,username:'fixture.admin',display_name:'합성 관리자',role:'admin',active:true,must_change:false,team_id:teamId,team_name:'개발1팀'}];
let revision=1,report='# 팀 보고서\n\n공유 설정 없이 팀에서 조회하는 합성 보고서입니다.';
const row={id:runId,sourceId,sourceName:'다른 팀원의 PC',author:'합성 팀원',mailId:10,subject:'팀 분석 확인용 메일',createdAt:'2026-09-28T00:00:00Z',status:'completed',agent:'codex'};
const calls=[];
const history={async get(){return {...row,result:{report},reviews:[],relatedMails:[]};},async request(path,body,_device,options){
  calls.push({path,query:options?.query,write:!!body});
  if(path==='/runs')return !options?.query?.query||row.subject.includes(options.query.query)?[row]:[];
  if(path.endsWith('/collaboration'))return {report,version:revision,canEdit:true,revisions:[{version:revision,changeNote:'합성 검증'}],messages:[]};
  if(path.endsWith('/revisions')){assert.equal(body.expectedVersion,revision);report=body.report;return {version:++revision};}
  if(path==='/reports/'+runId)return {...row,report,canEdit:true,canShare:false,permission:'write'};
  return [];
}};
const actor=()=>({userId,role:'admin',mustChangePassword:false});
const session={usernameMode:true,token:async()=>'synthetic',identity:async()=>actor(),status:async()=>actor()};
const context={selection:async()=>({sourceId:'',agent:'codex'}),status:async()=>({storeId:'',originalAvailable:false,sync:null}),environment:()=>({mailConfigured:false,agents:[],evidenceRootCount:0,dbConfigured:false})};
const server=createBrowserApp(session,{port,controlToken:control,staticRoot:resolve('public'),features:app=>{
  localUiRoutes(app,history,context);
  app.get('/api/updates',(_q,r)=>r.json({status:'current'}));
  app.get('/api/admin/teams',(_q,r)=>r.json({teams,canCreate:true}));
  app.post('/api/admin/teams',(q,r)=>{const team={id:randomUUID(),name:q.body.name};teams.push(team);r.json(team);});
  app.get('/api/admin/users',(_q,r)=>r.json(users));
  app.post('/api/admin/users',(q,r)=>{users.push({id:randomUUID(),username:q.body.username,display_name:q.body.displayName,role:q.body.role,active:true,must_change:true,team_id:q.body.teamId,team_name:teams.find(t=>t.id===q.body.teamId).name});r.json({temporaryPassword:randomBytes(24).toString('base64url')});});
}}).listen(port,'127.0.0.1');await new Promise(r=>server.once('listening',r));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const ticket=await(await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control,'x-local-client':'1'}})).json();
  await page.goto(ticket.url);await page.getByRole('heading',{name:'공용 분석 이력',exact:true}).waitFor();
  await page.getByRole('button',{name:/팀 분석 확인용 메일/}).waitFor();
  assert.equal(calls.find(c=>c.path==='/runs').query.sourceId,undefined);
  await page.getByLabel('제목·보고서 검색',{exact:true}).fill('없는 검색어');await page.getByRole('button',{name:'검색',exact:true}).click();await page.getByText('저장된 분석이 없습니다.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('button',{name:/팀 분석 확인용 메일/}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'보고서 편집',exact:true}).click();
  assert.equal(await dialog.getByRole('button',{name:/팀에 읽기 공유|팀에 편집 공유|공유 해제/}).count(),0);
  await dialog.getByLabel('보고서 초안',{exact:true}).fill(report+'\n\n팀 수정 확인');
  await dialog.getByLabel('변경 내용',{exact:true}).fill('합성 수정');
  await dialog.getByRole('button',{name:'보고서에 반영 · 새 버전 저장',exact:true}).click();
  await dialog.getByRole('heading',{name:'보고서 v2',exact:true}).waitFor();assert.equal(revision,2);
  await page.screenshot({path:join(home,'team-report.png')});await dialog.locator('#history-close').click();
  for(const width of [1440,390]){await page.setViewportSize({width,height:950});await page.screenshot({path:join(home,'history-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.goto(origin+'/#admin');await page.getByRole('article',{name:'fixture.admin 계정'}).waitFor();
  await page.getByLabel('새 팀 이름',{exact:true}).fill('개발2팀');await page.getByRole('button',{name:'팀 추가',exact:true}).click();await page.getByText('팀을 추가했습니다.',{exact:true}).waitFor();
  await page.getByText('새 계정 만들기',{exact:true}).click();const form=page.locator('.admin-create');
  await form.getByLabel('새 사용자명',{exact:true}).fill('fixture.new');await form.getByLabel('표시 이름',{exact:true}).fill('새 합성 사용자');
  await form.getByRole('combobox',{name:'새 계정 소속 팀'}).selectOption(teams[1].id);await form.getByRole('button',{name:'계정 생성',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'확인 후 닫기',exact:true}).click();assert.equal(users.at(-1).team_id,teams[1].id);
  await page.screenshot({path:join(home,'teams-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  const result={historyWithoutSetup:true,search:true,teamReportEdit:true,noShareControls:true,teamCreation:true,accountTeamSelection:true,mobileNoOverflow:true,realAccountsChanged:false,home};
  await writeFile(join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
