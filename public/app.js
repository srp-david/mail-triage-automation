import { loadImageCards } from './attachments.js';
import { renderMailBody } from './mail-body.js';
import { attachmentList } from './attachment-list.js';
import { openOfficePreview, closeOfficePreview } from './office-preview.js';
import { markdownView } from './markdown/viewer.js';
import { showMailAnalysis } from './mail-analysis.js';
import { relatedMails } from './related-mails.js';
import { analysisProgress } from './analysis-progress.js';
import { readDraft, saveDraft } from './answer-drafts.js';
import { renderThreads } from './mail-threads.js';
import { manualThreadControls } from './manual-threads.js';
import { captureMailPosition, restoreMailPosition, hasMailPaneScroll } from './mail-scroll.js';
const $=id=>document.getElementById(id);
const narrowMenu=matchMedia('(max-width:900px)');
function closeMenu(focus=false){
  $('workspace').classList.remove('menu-open');$('menu-toggle').setAttribute('aria-expanded','false');
  if(focus&&narrowMenu.matches)$('menu-toggle').focus();
}
$('menu-toggle').onclick=()=>{
  const open=$('workspace').classList.toggle('menu-open');$('menu-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('workspace-nav').querySelector('[aria-current="page"]')?.focus();
};
$('workspace-nav').addEventListener('click',event=>{if(event.target.closest('a'))closeMenu(narrowMenu.matches);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('workspace').classList.contains('menu-open')){event.preventDefault();closeMenu(true);}});
document.addEventListener('click',event=>{if(!event.target.closest('#workspace-nav,#menu-toggle'))closeMenu();});
narrowMenu.addEventListener('change',()=>closeMenu($('workspace-nav').contains(document.activeElement)));
let storeId='',offset=0,nextOffset=null,detailGeneration=0,activeView='mailbox';
let mailListGeneration=0,analysisGeneration=0;
let lastSyncRevision=null,syncRefresh=null,syncStarting=false,syncRunning=false;
let currentSync=null,syncStopping=false;
const syncActive=sync=>['running','retrying','stopping'].includes(sync?.status);
const mainHistory={prefix:'',mailId:null,runOffset:0,legacyOffset:0,runVersion:0,legacyVersion:0};
let mailHistory=null,dialogGeneration=0,reportGeneration=0,previousFocus=null,listFocus=null,openedDocument=null;
let stopProgress=()=>{};
let selectedMail=null,mailboxScroll=0;
const readingPositions=new Map();
let lastMailQuery='';
const expandedThreads=new Map();
let manualThreads;
const activeRun=status=>['queued','running'].includes(status);
const dialog=$('history-dialog');
const labels={queued:'대기',running:'분석 중',completed:'분석 완료',needs_input:'확인 필요',failed:'실패',partial:'일부 미완료'};
function notice(text){$('notice').textContent=text;if(dialog.open)$('history-notice').textContent=text;}
async function api(path,body){
  const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await r.json();
  if(r.status===401){closeHistory();closeOfficePreview();$('login').hidden=false;$('workspace').hidden=true;throw new Error('접속 토큰을 입력하세요.');}
  if(!r.ok)throw new Error(value.error??'요청 실패');
  return value;
}
function element(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;}
function action(text,fn){const b=element('button',text);b.onclick=()=>safe(fn);return b;}
async function safe(fn){try{await fn();}catch(e){notice(e.message);}}
function date(value){return value?new Date(value).toLocaleString('ko-KR'):'날짜 미확인';}
async function status(){
 const s=await api('/status');storeId=s.storeId;
 $('connection').textContent=s.worker?.online&&s.worker.state!=='stopped'?'분석 Worker 연결됨':'메일 조회 가능 · 분석 Worker 미연결';
 const sync=s.sync;currentSync=sync;
 syncRunning=syncActive(sync);$('sync').disabled=syncStarting||syncRunning;
 $('sync').textContent=['paused','partial','failed'].includes(sync?.status)?'이어서 동기화':'메일 동기화';
 $('sync-stop').hidden=!syncRunning;$('sync-stop').disabled=syncStopping||sync?.status==='stopping';
 $('sync-stop').textContent=sync?.status==='stopping'?'중지 요청됨':'중지';
 const states={running:'진행 중',retrying:'재시도 대기',stopping:'현재 묶음 종료 후 중지',paused:'일시 중지',completed:'완료',partial:'일부 미완료',failed:'실패'};
 $('sync-status').textContent=sync?'동기화 '+(states[sync.status]??sync.status)+' · 이번 실행 저장 '+sync.saved+'건 · 실패 시도 '+sync.failed+'건 · 남음 '+(sync.remaining??'미확인')+' · '+(sync.batch_count??0)+'묶음 · '+date(sync.finished_at??sync.started_at):'아직 웹 동기화 기록이 없습니다.';
 const progress=$('sync-progress');progress.hidden=!syncRunning;
 $('sync-status').hidden=syncRunning;
 progress.classList.toggle('is-waiting',sync?.status==='retrying');
 let counts='이번 실행 저장 '+(sync?.saved??0)+'건';
 if(Number.isFinite(sync?.detail?.serverCount)&&sync.detail.serverCount>0&&Number.isFinite(sync.detail.serverStored)&&sync.detail.serverStored>=0){
   const total=sync.detail.serverCount,stored=Math.min(sync.detail.serverStored,total);
   counts='서버 메일 '+stored.toLocaleString('ko-KR')+' / '+total.toLocaleString('ko-KR')+'건 ('+Math.floor(stored/total*100)+'%)';
 }
 $('sync-progress-text').textContent=syncRunning?'동기화 '+(states[sync.status]??sync.status)+' · '+counts:'';
 const reasons={interrupted:'서버 재시작으로 중지되었습니다. 이어서 동기화하면 저장된 메일은 건너뜁니다.',retry_exhausted:'자동 재시도 3회를 마쳤습니다. 연결 상태를 확인한 뒤 이어서 동기화하세요.',no_progress:'새로 저장된 메일 없이 남은 메일이 있어 중지했습니다.',invalid_response:'수집 결과를 확인할 수 없어 중지했습니다.',error:'수집 오류가 있어 중지했습니다. 연결·메일 서버·저장 공간을 확인하세요.'};
 const message=sync?.status==='stopping'?'현재 처리 중인 최대 100개 묶음이 끝나면 중지합니다.':sync?.status==='retrying'?'일시적인 연결 오류로 '+sync.retry_count+'/3회 재시도를 기다립니다. '+date(sync.next_attempt_at):reasons[sync?.detail?.reason]??(sync?.status==='paused'?'저장된 메일은 유지됩니다. 이어서 동기화하면 미수집 메일부터 받습니다.':'100개씩 순서대로 수집합니다. 수집 중에도 메일 조회·분석이 가능합니다.');
 $('sync-message').textContent=message+(sync?.uncertain?' 응답이 끊긴 묶음의 저장 건수는 이번 실행 집계에서 빠질 수 있습니다.':'')+(sync?.failed>0?' 실패 시도는 누적 횟수이며 남음에는 해당 묶음의 실패 메일이 포함되지 않습니다.':'');
 $('sync-message').hidden=!sync||(sync.status==='completed'&&!sync.uncertain&&!sync.failed);
 return s;
}
function syncRevision(sync){
 if(!sync||syncActive(sync)&&!sync.saved)return null;
 return JSON.stringify([sync.id,syncActive(sync)?'active':sync.status,sync.saved,sync.batch_count??0,sync.finished_at]);
}
async function refreshAfterSync(sync){
 const revision=syncRevision(sync);if(!revision)return false;
 // The same completion can be observed by both the button and periodic status check.
 while(syncRefresh)await syncRefresh;
 if(revision===lastSyncRevision)return false;
 syncRefresh=(async()=>{
   if(!syncActive(sync))offset=0;
   try{
     if(!await mails())return false;
     lastSyncRevision=revision;
     if(!syncActive(sync)){
       const outcome=sync.status==='completed'?'동기화가 완료되었습니다.':sync.status==='paused'?'동기화를 일시 중지했습니다.':sync.status==='partial'?'동기화가 일부 미완료되었습니다.':'동기화가 실패했습니다.';
       notice(outcome+' 현재 저장된 메일로 목록을 갱신했습니다.');
     }
     return true;
   }catch(error){throw new Error('동기화 후 목록을 갱신하지 못했습니다. 다음 상태 확인 때 다시 시도합니다. '+error.message);}
 })();
 try{return await syncRefresh;}finally{syncRefresh=null;}
}
async function mails(){
 manualThreads?.setView($('mail-view').value==='threads');
 const generation=++mailListGeneration;++analysisGeneration;
 const q=new URLSearchParams({limit:'30',offset:String(offset)});
 q.set('view',$('mail-view').value);
 if($('query').value)q.set('query',$('query').value);
 if($('from').value)q.set('from_address',$('from').value);
 if($('after').value)q.set('sent_after',new Date($('after').value+'T00:00:00').toISOString());
 if($('analysis-status').value!=='all')q.set('analysis_status',$('analysis-status').value);
 const filters=[$('query').value&&'검색어: '+$('query').value,$('from').value&&'발신자: '+$('from').value,$('after').value&&'시작일: '+$('after').value,$('analysis-status').value!=='all'&&$('analysis-status').selectedOptions[0].textContent].filter(Boolean);
 $('mails').setAttribute('aria-busy','true');$('previous').disabled=true;$('next').disabled=true;
 let result;
 try{result=await api('/mails?'+q);}catch(error){
   if(generation!==mailListGeneration)return false;
   $('total').textContent='';nextOffset=null;
   $('mails').replaceChildren(element('p','메일을 불러오지 못했습니다. '+error.message),action('다시 조회',()=>{notice('');return mails();}));
   throw error;
 }finally{if(generation===mailListGeneration)$('mails').removeAttribute('aria-busy');}
 if(generation!==mailListGeneration)return false;
 if(offset>0&&offset>=result.total){offset=Math.max(0,Math.floor((result.total-1)/30)*30);return mails();}
 const position=lastMailQuery===q.toString()?captureMailPosition():null;
 lastMailQuery=q.toString();nextOffset=result.nextOffset;
 $('applied-filters').textContent=filters.length?'적용된 조건 · '+filters.join(' · '):'전체 메일';
 $('applied-filters').title=$('applied-filters').textContent;
 $('total').textContent=result.threads?result.total+'개 대화 · '+result.mailTotal+'개 메일':result.total+'건';$('mails').replaceChildren();
 const mailButton=mail=>{
   const b=action('',()=>detail(mail.id));b.className='mail';b.dataset.mailId=String(mail.id);
   b.append(element('strong',mail.subject||'(제목 없음)'),element('span',(mail.from??[]).map(x=>x.name??x.address).join(', ')+' · '+date(mail.sentAt)));
   const analysis=element('span',null,'mail-analysis');analysis.dataset.mailId=String(mail.id);analysis.hidden=true;b.append(analysis);
   return b;
 };
 if(result.threads)renderThreads($('mails'),result.threads,mailButton,expandedThreads,selectedMail?.id,manualThreads);
 else for(const mail of result.emails)$('mails').append(mailButton(mail));
 if(result.threads?!result.threads.length:!result.emails.length){
   $('mails').append(element('p',filters.length?'조건에 맞는 메일이 없습니다. 검색 조건을 줄이거나 초기화해 보세요.':'저장된 메일이 없습니다. 메일 동기화로 가져올 수 있습니다.'));
   if(filters.length)$('mails').append(action('검색 조건 초기화',resetSearch));
 }
 markSelectedMail();
 manualThreads?.afterRender();
 $('previous').disabled=offset===0;$('next').disabled=nextOffset==null;
 await refreshMailAnalysis();
 if(generation===mailListGeneration){
   if(position)restoreMailPosition(position);else if(hasMailPaneScroll())$('mails').scrollTop=0;
 }
 return generation===mailListGeneration;
}
async function refreshMailAnalysis(){
 const generation=++analysisGeneration,listGeneration=mailListGeneration;
 const items=[...$('mails').querySelectorAll('.mail-analysis')];
 const ids=[...new Set([...items.map(x=>x.dataset.mailId),...(selectedMail?[String(selectedMail.id)]:[])])];if(!ids.length)return;
 try{
   const rows=[];
   for(let start=0;start<ids.length;start+=100){
     rows.push(...await api('/mail-analysis?'+new URLSearchParams({mailIds:ids.slice(start,start+100).join(',')})));
     if(generation!==analysisGeneration||listGeneration!==mailListGeneration)return;
   }
   if(generation!==analysisGeneration||listGeneration!==mailListGeneration)return;
   const summaries=new Map(rows.map(row=>[String(row.mailId),row]));
   for(const item of items)showMailAnalysis(item,summaries.get(item.dataset.mailId));
   if(selectedMail)updateMailActions(summaries.get(String(selectedMail.id)));
 }catch{
   if(generation!==analysisGeneration||listGeneration!==mailListGeneration)return;
   for(const item of items)showMailAnalysis(item,null,true);
   if(selectedMail)updateMailActions(null,true);
 }
}
function markSelectedMail(){
 for(const thread of $('mails').querySelectorAll('.mail-thread'))thread.classList.remove('has-selected-mail');
 for(const button of $('mails').querySelectorAll('.mail')){
   const selected=button.dataset.mailId===String(selectedMail?.id);
   button.classList.toggle('is-selected',selected);
   if(selected)button.closest('.mail-thread')?.classList.add('has-selected-mail');
   if(selected)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
 }
}
function backToMailbox(){
 if(selectedMail&&!hasMailPaneScroll())readingPositions.set(selectedMail.id,{pane:false,scroll:window.scrollY});
 $('view-mailbox').classList.remove('show-detail');
 const selected=$('mails').querySelector('.is-selected');
 const thread=selected?.closest('details');if(thread)thread.open=true;
 (selected??$('mail-list')).focus({preventScroll:true});window.scrollTo(0,mailboxScroll);
}
function updateMailActions(summary,unavailable=false){
 if(!selectedMail?.start)return;
 const mail=selectedMail;mail.summary=summary;mail.unavailable=unavailable;
 mail.start.disabled=mail.busy;
 mail.start.textContent=unavailable?'이력 다시 확인':activeRun(summary?.latestStatus)?'진행 상황 보기':summary?.runCount>0?(summary.latestStatus==='failed'?'실패 내용 보기':'결과 보기'):'분석 시작';
 mail.reanalyse.hidden=unavailable||!summary?.runCount||activeRun(summary.latestStatus);
 mail.reanalyse.disabled=mail.busy;
 mail.state.textContent=unavailable?'분석 이력을 확인하지 못했습니다. 다시 확인한 뒤 분석할 수 있습니다.':
   '분석: '+(labels[summary?.latestStatus]??'미분석')+' · 업무 처리: '+(summary?.handledAt?'처리 완료':'완료 표시 없음');
}
async function resetSearch(){
 $('search-form').reset();offset=0;notice('');await mails();
}
async function detail(id){
 if(selectedMail&&(!$('view-mailbox').classList.contains('show-detail')?hasMailPaneScroll():true)){
   readingPositions.set(selectedMail.id,{pane:hasMailPaneScroll(),scroll:hasMailPaneScroll()?$('detail').scrollTop:window.scrollY});
 }
 closeHistory();
 closeOfficePreview();
 const generation=++detailGeneration;
 notice('메일을 불러오는 중입니다.');
 const [m,body]=await Promise.all([api('/mails/'+id),api('/mails/'+id+'/body').catch(()=>({html:'',unavailable:true}))]);
 if(generation!==detailGeneration)return;const d=$('detail');d.replaceChildren();
 if(!$('view-mailbox').classList.contains('show-detail'))mailboxScroll=window.scrollY;
 const back=action('메일 목록으로',backToMailbox);back.className='mail-back';
 d.append(back,element('h2',m.subject),element('p',(m.from??[]).map(x=>x.address).join(', ')+' · '+date(m.sentAt),'meta'));
 const mail={id,subject:m.subject,busy:false,summary:null,unavailable:true};selectedMail=mail;
 const perform=async(force=false)=>{
   if(mail.busy)return;
   if(mail.unavailable){await refreshMailAnalysis();return;}
   mail.busy=true;updateMailActions(mail.summary);
   try{
     // Recheck existing runs before creating a request; the server remains the concurrency guard.
     const rows=await api('/runs?'+new URLSearchParams({storeId,mailId:String(id)}));
     if(selectedMail!==mail||generation!==detailGeneration)return;
     const existing=rows.find(r=>activeRun(r.status))??(!force?rows[0]:null);
     if(existing){await openAnalysis(existing.id,id,m.subject);return;}
     if(!force&&mail.summary?.runCount>0)throw new Error('선택한 분석 이력을 찾지 못했습니다. 이 메일 분석 이력에서 다시 확인해 주세요.');
     const run=await api('/runs',{storeId,mailId:id,messageId:m.messageId,source:'web',requestId:crypto.randomUUID()});
     if(selectedMail!==mail||generation!==detailGeneration)return;
     await openAnalysis(run.id,id,m.subject);await refreshMailAnalysis();
   }finally{mail.busy=false;if(selectedMail===mail)updateMailActions(mail.summary,mail.unavailable);}
 };
 const start=action('이력 확인 중…',()=>perform());start.disabled=true;mail.start=start;
 const reanalyse=action('새로 분석',()=>perform(true));reanalyse.className='secondary-button';reanalyse.title='기존 보고서를 보존하고 메일 원문으로 새 분석을 시작합니다. 추가 답변은 결과 보기에서 입력하세요.';reanalyse.hidden=true;mail.reanalyse=reanalyse;
 mail.state=element('p','분석 이력을 확인하고 있습니다.','meta');mail.state.setAttribute('role','status');
 const actions=element('div',null,'mail-actions');
 const history=action('이 메일 분석 이력',()=>openMailHistory(id,m.subject));
 history.className='history-button';
 actions.append(start,reanalyse,history);
 d.append(actions,mail.state);
 const loadFile=async(attachment,signal)=>{
   const response=await fetch('/api/mails/'+id+'/attachments/'+encodeURIComponent(attachment.attachmentId)+'/download',{signal});
   if(!response.ok){
     const error=await response.json().catch(()=>({}));
     throw new Error(response.status===401?'접속이 만료되었습니다. 새로고침 후 로그인해 주세요.':error.error??'다운로드에 실패했습니다.');
   }
   return response.blob();
 };
 const download=async attachment=>{
   const url=URL.createObjectURL(await loadFile(attachment));
   const link=element('a');link.href=url;link.download=String(attachment.filename||'attachment').split(/[\\/]/).pop();
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
 };
 const files=attachmentList(m.attachments??[],download,attachment=>openOfficePreview(attachment,loadFile,download));
 if(files)d.append(files);
 const cache=new Map();
 const fetchAttachment=attachment=>{
   const key=attachment.attachmentId;
   if(!cache.has(key))cache.set(key,api('/mails/'+id+'/attachments/'+encodeURIComponent(key)).then(result=>{
     if(result.isError||result.structuredContent?.code)cache.delete(key);
     return result;
   }).catch(error=>{cache.delete(key);throw error;}));
   return cache.get(key);
 };
 let cards=[];
 if(body.html){
   const rendered=renderMailBody(body,m.attachments??[],fetchAttachment);
   d.append(rendered.element);cards=rendered.cards;
 }else{
   d.append(element('pre',m.body));
   if(body.unavailable||body.warnings?.length)d.append(element('p','본문 서식을 불러오지 못해 텍스트로 표시합니다. 이미지는 첨부파일 목록의 미리보기로 확인할 수 있습니다.','meta'));
 }


 if(m.warnings?.length)d.append(element('p','조회 경고: '+m.warnings.join(', ')));

 void loadImageCards(cards);
 markSelectedMail();$('view-mailbox').classList.add('show-detail');
 const reading=readingPositions.get(id),pane=hasMailPaneScroll(),saved=reading?.pane===pane?reading.scroll:0;
 if(pane)d.scrollTop=saved;
 else if(matchMedia('(max-width:900px)').matches){d.focus({preventScroll:true});window.scrollTo(0,saved);}
 notice('');
 await refreshMailAnalysis();
}
function contextActive(context){return context===mainHistory||(dialog.open&&mailHistory===context);}
function historyQuery(context,offset){
 const q=new URLSearchParams({offset:String(offset)});
 if(context.mailId){q.set('storeId',storeId);q.set('mailId',String(context.mailId));}return q;
}
async function runs(context=mainHistory,append=false){
 const version=++context.runVersion,list=$(context.prefix+'runs'),more=$(context.prefix+'more-runs');more.disabled=true;
 try{
   const items=await api('/runs?'+historyQuery(context,append?context.runOffset:0));
   if(!contextActive(context)||version!==context.runVersion)return;
   if(!append){list.replaceChildren();context.runOffset=0;}
   for(const r of items){const row=element('div',null,'run');row.append(element('span',r.handled_at?'처리 완료':labels[r.status]??r.status,'badge'),action(r.subject+' · '+(r.source==='direct'?'직접 실행':'웹')+' · '+date(r.created_at),()=>report(r.id)));list.append(row);}
   context.runOffset+=items.length;more.hidden=items.length<100;
   if(!items.length&&!append)list.append(element('p','저장된 분석이 없습니다.'));
 }catch(error){
   if(!contextActive(context)||version!==context.runVersion)return;
   if(!append)list.replaceChildren(element('p','이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'));
   throw error;
 }finally{if(contextActive(context)&&version===context.runVersion)more.disabled=false;}
}
function showHistory(title,subtitle=''){
 if(!dialog.open){previousFocus=document.activeElement;closeOfficePreview();dialog.showModal();document.body.classList.add('history-open');}
 $('history-title').textContent=title;$('history-subtitle').textContent=subtitle;$('history-notice').textContent='';
}
function closeHistory(){
 stopProgress();
 ++dialogGeneration;++reportGeneration;mailHistory=null;openedDocument=null;
 if(dialog.open)dialog.close();document.body.classList.remove('history-open');
 if(previousFocus?.isConnected&&previousFocus.getClientRects().length)previousFocus.focus({preventScroll:true});previousFocus=null;
}
async function openMailHistory(id,subject){
 stopProgress();
 ++dialogGeneration;++reportGeneration;
 const context={prefix:'mail-',mailId:id,subject,runOffset:0,legacyOffset:0,runVersion:0,legacyVersion:0};mailHistory=context;
 openedDocument=null;showHistory('이 메일 분석 이력',subject);$('report').hidden=true;$('mail-history-lists').hidden=false;$('history-back').hidden=true;
 $('mail-runs').replaceChildren(element('p','이력을 불러오는 중입니다…'));
 $('mail-legacy-list').replaceChildren(element('p','이전 문서를 확인하는 중입니다…'));
 $('mail-more-runs').hidden=true;$('mail-legacy-more').hidden=true;$('history-body').scrollTop=0;
 await Promise.all([safe(()=>runs(context)),safe(()=>legacy(context))]);
}
function showDocument(kind,id){
 stopProgress();
 if(!dialog.open){mailHistory=null;showHistory(kind==='run'?'분석 보고서':'이전 문서');}
 if(!$('mail-history-lists').hidden)listFocus=document.activeElement;
 openedDocument={kind,id};$('mail-history-lists').hidden=true;$('history-back').hidden=!mailHistory;
 const box=$('report');box.hidden=false;box.replaceChildren(element('p','문서를 불러오는 중입니다…'));
 $('history-notice').textContent='';$('history-body').scrollTop=0;
 return {generation:dialogGeneration,version:++reportGeneration,box};
}
function documentActive(request){return dialog.open&&request.generation===dialogGeneration&&request.version===reportGeneration;}
function backToHistory(){
 stopProgress();
 ++reportGeneration;openedDocument=null;$('report').hidden=true;$('mail-history-lists').hidden=false;$('history-back').hidden=true;
 $('history-title').textContent='이 메일 분석 이력';$('history-notice').textContent='';if(listFocus?.isConnected)listFocus.focus({preventScroll:true});
}
async function openAnalysis(runId,mailId,subject){
 const opening=openMailHistory(mailId,subject),version=reportGeneration;
 await opening;if(!dialog.open||version!==reportGeneration)return;
 await report(runId);
}
async function report(id,snapshot=null,automatic=false){
 const scroll=$('history-body').scrollTop;
 const request=showDocument('run',id),r=snapshot??await api('/runs/'+id);if(!documentActive(request))return;
 const box=request.box;box.replaceChildren(element('h2',r.subject+' · '+(labels[r.status]??r.status)));
 $('history-title').textContent=activeRun(r.status)?'분석 진행 상황':'분석 결과';
 if(['queued','running'].includes(r.status)||r.progress_events?.length){
   const progress=analysisProgress(r,{fetchRun:()=>api('/runs/'+id),isCurrent:()=>documentActive(request),onUpdate:next=>{
     box.querySelector('h2').textContent=next.subject+' · '+(labels[next.status]??next.status);
   },onFinished:async finished=>{
     if(!documentActive(request))return;
     await report(id,finished,true);await refreshMailAnalysis();
   }});stopProgress=progress.stop;box.append(progress.element);
 }
 if(r.result){
   const tools=element('div',null,'report-tools');tools.setAttribute('role','group');tools.setAttribute('aria-label','문서 도구');
   const link=element('a','Markdown 파일 열기 ↗','document-button');link.href='/api/runs/'+id+'/export';link.target='_blank';link.rel='noopener';link.title='Markdown 원본 파일을 새 탭에서 엽니다.';
   tools.append(link);box.append(tools);
 }
 const handling=element('div',null,'handling-actions');
 handling.append(element('p',r.handled_at?'업무 처리 완료 · '+date(r.handled_at):'업무 처리: 완료 표시 없음 · 실제 메일 업무가 끝났다면 처리 완료로 표시하세요. 분석 완료와는 별개입니다.','meta'));
 const complete=action(r.handled_at?'처리 완료 취소':'처리 완료',async()=>{
   complete.disabled=true;
   try{
     await api('/runs/'+id+'/handling',{completed:!r.handled_at});
     if(documentActive(request))await report(id);
     await Promise.all([refreshMailAnalysis(),safe(()=>runs(mainHistory)),...(mailHistory?[safe(()=>runs(mailHistory))]:[])]);
     notice(r.handled_at?'처리 완료를 취소했습니다.':'메일을 처리 완료로 표시했습니다.');
   }finally{complete.disabled=false;}
 });
 complete.disabled=['queued','running'].includes(r.status);
 if(complete.disabled)complete.title='진행 중인 분석이 끝난 뒤 처리 완료할 수 있습니다.';
 handling.append(complete);if(!activeRun(r.status))box.append(handling);
 if(r.handled_at)box.append(element('p','처리가 완료된 메일입니다. 아래 보고서와 질문은 당시 분석 기록으로 보존됩니다.','meta'));
 if(r.handled_at||r.relatedMails?.length)box.append(relatedMails({run:r,runId:id,storeId,api,active:()=>documentActive(request),reload:()=>report(id)}));
 if(r.error)box.append(element('p',r.error));
 if(r.result){
   box.append(markdownView(r.result.report,'보고서'));
   if(r.result.knowledge)box.append(element('h3','업무 지식 반영 제안'),markdownView(r.result.knowledge,'업무 지식 제안'));
   for(const review of r.reviews)box.append(element('h3',review.author+' 리뷰'),markdownView(review.body,review.author+' 리뷰'));
   if(r.status==='needs_input'&&r.handled_at){
     box.append(element('h3','당시 추가 확인 질문'),element('p',r.result.question));
   }else if(!r.handled_at&&['needs_input','completed'].includes(r.status)&&r.identity_kind==='outlook'){
     if(r.result.question)box.append(element('p',r.result.question));
     box.append(element('p','Outlook 예외 메일은 직접 실행에서 답변을 반영해 다시 분석하세요. 원본 파일과 공용 메일 식별자를 함께 사용합니다.'));
   }else if(!r.handled_at&&['needs_input','completed'].includes(r.status)){
     box.append(element('h3','추가 답변 · 재분석'));
     if(r.result.question)box.append(element('p',r.result.question));
     if(r.status==='completed')box.append(element('p','분석이 완료되었습니다. 추가 조건이나 의견을 입력하면 기존 보고서와 함께 다시 분석합니다.','meta'));
     const answer=element('textarea');answer.setAttribute('aria-label','추가 답변');answer.maxLength=20000;
     answer.value=readDraft(r.store_id,id);
     const draftHint=element('p','작성 중인 답변은 이 탭에서 임시 보관됩니다. 새로고침 후에도 같은 분석을 열면 복원됩니다.','meta');
     draftHint.id='answer-draft-hint';answer.setAttribute('aria-describedby',draftHint.id);
     answer.oninput=()=>{draftHint.textContent=saveDraft(r.store_id,id,answer.value)?'초안을 이 탭에 임시 보관했습니다. 탭을 닫으면 삭제될 수 있습니다.':'임시 저장소를 사용할 수 없습니다. 화면 이동 시에는 유지되지만 브라우저 새로고침 전 답변을 복사해 주세요.';};
     if(answer.value)answer.oninput();
     const discard=action('초안 지우기',()=>{answer.value='';answer.oninput();answer.focus();});discard.className='secondary-button';
     box.append(answer,draftHint,discard);
     const submit=action('답변하고 다시 분석',async()=>{
       if(!answer.value.trim())throw new Error('답변을 입력하세요.');
       const submittedAnswer=answer.value;
       submit.disabled=true;answer.disabled=true;discard.disabled=true;
       try{const run=await api('/runs',{storeId:r.store_id,mailId:Number(r.mail_id),messageId:r.message_id,source:'web',requestId:crypto.randomUUID(),parentId:id,answer:submittedAnswer});
         if(readDraft(r.store_id,id)===submittedAnswer)saveDraft(r.store_id,id,'');
         if(documentActive(request)){await openAnalysis(run.id,Number(r.mail_id),r.subject);await refreshMailAnalysis();}
       }finally{submit.disabled=false;answer.disabled=false;discard.disabled=false;}
     });box.append(submit);
   }
 }
 if(!r.result&&!r.error&&!['queued','running'].includes(r.status))box.append(element('p','아직 보고서가 없습니다.'));
 if(automatic)$('history-body').scrollTop=scroll;else box.focus({preventScroll:true});
}
async function legacy(context=mainHistory,append=false){
 const version=++context.legacyVersion,list=$(context.prefix+'legacy-list'),more=$(context.prefix+'legacy-more');more.disabled=true;
 try{
   const rows=await api('/legacy?'+historyQuery(context,append?context.legacyOffset:0));
   if(!contextActive(context)||version!==context.legacyVersion)return;
   if(!append){list.replaceChildren();context.legacyOffset=0;}
   for(const item of rows){const row=element('div',null,'run');row.append(element('span',item.mail_key?'메일 연결 확인':'미연결 보존','badge'),action(legacyTitle(item),()=>legacyDocument(item.id)));list.append(row);}
   context.legacyOffset+=rows.length;more.hidden=rows.length<100;
   if(!rows.length&&!append)list.append(element('p',context.mailId?'이 메일과 확인 연결된 이전 문서가 없습니다.':'아직 이전한 문서가 없습니다.'));
 }catch(error){
   if(!contextActive(context)||version!==context.legacyVersion)return;
   if(!append)list.replaceChildren(element('p','이전 이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'));
   throw error;
 }finally{if(contextActive(context)&&version===context.legacyVersion)more.disabled=false;}
}
function legacyTitle(document){return document.title||document.source_path?.split(/[\\/]/).pop()||'이전 문서';}
async function legacyDocument(id){
 const request=showDocument('legacy',id),document=await api('/legacy/'+id);if(!documentActive(request))return;
 $('history-title').textContent='이전 문서';
 const info=element('details',null,'document-info');info.append(element('summary','문서 정보'),element('p','파일 경로: '+document.source_path,'meta'),element('p','원본 SHA-256: '+document.source_hash,'meta'));
 const box=element('div');box.id='legacy-document';box.append(element('h2',legacyTitle(document)),info,markdownView(document.body,'이전 문서'));
 request.box.replaceChildren(box);request.box.focus({preventScroll:true});
}
async function refreshHistory(){
 if(openedDocument)return openedDocument.kind==='run'?report(openedDocument.id):legacyDocument(openedDocument.id);
 if(mailHistory){$('history-notice').textContent='';await Promise.all([safe(()=>runs(mailHistory)),safe(()=>legacy(mailHistory))]);}
}
function selectedView(){return ['mailbox','history','legacy'].includes(location.hash.slice(1))?location.hash.slice(1):'mailbox';}
async function navigate(){
 closeHistory();closeOfficePreview();activeView=selectedView();notice('');
 for(const name of ['mailbox','history','legacy']){
   $('view-'+name).hidden=name!==activeView;
   const link=document.querySelector('[data-view="'+name+'"]');if(name===activeView)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 if(activeView==='history')await runs();else if(activeView==='legacy')await legacy();else await refreshMailAnalysis();
}
$('history-close').onclick=closeHistory;
dialog.addEventListener('cancel',event=>{event.preventDefault();closeHistory();});
$('history-back').onclick=backToHistory;$('history-refresh').onclick=()=>safe(refreshHistory);
$('mail-more-runs').onclick=()=>safe(()=>runs(mailHistory,true));
$('mail-legacy-more').onclick=()=>safe(()=>legacy(mailHistory,true));
$('legacy-refresh').onclick=()=>safe(()=>legacy());
$('legacy-more').onclick=()=>safe(()=>legacy(mainHistory,true));
$('login-form').onsubmit=e=>{e.preventDefault();safe(async()=>{await api('/login',{token:$('token').value});$('token').value='';await boot();});};
$('search-form').onsubmit=e=>{e.preventDefault();offset=0;notice('');safe(mails);};
$('reset-search').onclick=()=>safe(resetSearch);
$('mail-view').onchange=()=>{offset=0;notice('');safe(mails);};
$('sync').onclick=()=>safe(async()=>{
 if(syncStarting||syncRunning)return;syncStarting=true;$('sync').disabled=true;
 try{await api('/sync',{});notice('동기화를 시작했습니다.');const s=await status();await refreshAfterSync(s.sync);}
 finally{syncStarting=false;$('sync').disabled=syncRunning;}
});
$('sync-stop').onclick=()=>safe(async()=>{
 if(!syncActive(currentSync)||syncStopping)return;syncStopping=true;$('sync-stop').disabled=true;
 try{await api('/sync/'+currentSync.id+'/stop',{});notice('현재 묶음 처리가 끝나면 동기화를 중지합니다.');const s=await status();await refreshAfterSync(s.sync);}
 finally{syncStopping=false;}
});
$('previous').onclick=()=>{offset=Math.max(0,offset-30);safe(mails);};
$('next').onclick=()=>{if(nextOffset!=null){offset=nextOffset;safe(mails);}};
$('refresh').onclick=()=>safe(()=>runs());
$('more-runs').onclick=()=>safe(()=>runs(mainHistory,true));
window.addEventListener('hashchange',()=>{if(!$('workspace').hidden)safe(navigate);});
manualThreads=manualThreadControls({api,getStoreId:()=>storeId,refresh:()=>mails()});
async function boot(){const s=await status();lastSyncRevision=syncRevision(s.sync);$('login').hidden=true;$('workspace').hidden=false;await Promise.all([mails(),navigate()]);notice('');}
safe(boot);
let polling=false;
setInterval(()=>{
 if($('workspace').hidden||polling)return;polling=true;
 void safe(async()=>{
   const s=await status();if(!await refreshAfterSync(s.sync)&&activeView==='mailbox')await refreshMailAnalysis();
   if(dialog.open&&mailHistory&&!openedDocument&&mailHistory.runOffset<=100&&!$('mail-runs').contains(document.activeElement))await runs(mailHistory);
   else if(!dialog.open&&activeView==='history'&&mainHistory.runOffset<=100&&!$('runs').contains(document.activeElement))await runs();
 }).finally(()=>{polling=false;});
},10000);
