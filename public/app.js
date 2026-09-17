import { attachmentCard, isImageAttachment, loadImageCards } from './attachments.js';
import { renderMailBody } from './mail-body.js';
import { attachmentList } from './attachment-list.js';
const $=id=>document.getElementById(id);
let storeId='',offset=0,nextOffset=null,detailGeneration=0,activeView='mailbox';
let mailListGeneration=0,analysisGeneration=0;
let priorSync=null;
const mainHistory={prefix:'',mailId:null,runOffset:0,legacyOffset:0,runVersion:0,legacyVersion:0};
let mailHistory=null,dialogGeneration=0,reportGeneration=0,previousFocus=null,listFocus=null,openedDocument=null;
const dialog=$('history-dialog');
const labels={queued:'대기',running:'분석 중',completed:'분석 완료',needs_input:'확인 필요',failed:'실패',partial:'일부 미완료'};
function notice(text){$('notice').textContent=text;if(dialog.open)$('history-notice').textContent=text;}
async function api(path,body){
  const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await r.json();
  if(r.status===401){closeHistory();$('login').hidden=false;$('workspace').hidden=true;throw new Error('접속 토큰을 입력하세요.');}
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
 const sync=s.sync;
 $('sync').disabled=sync?.status==='running';
 $('sync-status').textContent=sync?'동기화 '+(sync.status==='running'?'진행 중':labels[sync.status]??sync.status)+' · 저장 '+sync.saved+'건 · 실패 '+sync.failed+'건 · 남음 '+(sync.remaining??'미확인')+' · '+date(sync.finished_at??sync.started_at):'아직 웹 동기화 기록이 없습니다.';
 return s;
}
async function mails(){
 const generation=++mailListGeneration;++analysisGeneration;
 const q=new URLSearchParams({limit:'30',offset:String(offset)});
 if($('query').value)q.set('query',$('query').value);
 if($('from').value)q.set('from_address',$('from').value);
 if($('after').value)q.set('sent_after',new Date($('after').value+'T00:00:00').toISOString());
 const result=await api('/mails?'+q);if(generation!==mailListGeneration)return false;nextOffset=result.nextOffset;
 $('total').textContent=result.total+'건';$('mails').replaceChildren();
 for(const mail of result.emails){
   const b=action('',()=>detail(mail.id));b.className='mail';
   b.append(element('strong',mail.subject||'(제목 없음)'),element('span',(mail.from??[]).map(x=>x.name??x.address).join(', ')+' · '+date(mail.sentAt)));
   $('mails').append(b);
 }
 if(!result.emails.length)$('mails').append(element('p','검색 결과가 없습니다.'));
 $('previous').disabled=offset===0;$('next').disabled=nextOffset==null;
 
 return generation===mailListGeneration;
}
async function detail(id){
 closeHistory();
 
 const generation=++detailGeneration;
 notice('메일을 불러오는 중입니다.');
 const [m,body]=await Promise.all([api('/mails/'+id),api('/mails/'+id+'/body').catch(()=>({html:'',unavailable:true}))]);
 if(generation!==detailGeneration)return;const d=$('detail');d.replaceChildren();
 d.append(element('h2',m.subject),element('p',(m.from??[]).map(x=>x.address).join(', ')+' · '+date(m.sentAt),'meta'));
 const start=action('이 메일 분석',async()=>{
   start.disabled=true;
   try{await api('/runs',{storeId,mailId:id,messageId:m.messageId,source:'web',requestId:crypto.randomUUID()});await openMailHistory(id,m.subject);notice('분석 대기열에 등록했습니다.');}finally{start.disabled=false;}
 });
 const actions=element('div',null,'mail-actions');
 const history=action('이 메일 분석 이력',()=>openMailHistory(id,m.subject));
 history.className='history-button';
 actions.append(start,history);
 d.append(actions);
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
 const files=attachmentList(m.attachments??[],download);
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
 let cards=[],used=new Set();
 if(body.html){
   const rendered=renderMailBody(body,m.attachments??[],fetchAttachment);
   d.append(rendered.element);cards=rendered.cards;used=rendered.used;
 }else{
   d.append(element('pre',m.body));
   if(body.unavailable||body.warnings?.length)d.append(element('p','본문 서식을 불러오지 못해 텍스트로 표시합니다. 이미지는 아래에서 확인할 수 있습니다.','meta'));
 }
 const images=(m.attachments??[]).filter(a=>isImageAttachment(a)&&!used.has(a.attachmentId));
 if(images.length){
   const gallery=element('div',null,'mail-images');
   gallery.append(element('h3','첨부 이미지 · '+images.length+'개'));
   for(const attachment of images){
     if(!attachment.attachmentId){gallery.append(element('p','이미지 식별자가 없어 표시할 수 없습니다.'));continue;}
     const card=attachmentCard(attachment,()=>fetchAttachment(attachment));
     gallery.append(card.element);cards.push(card);
   }
   d.append(gallery);
 }


 if(m.warnings?.length)d.append(element('p','조회 경고: '+m.warnings.join(', ')));

 void loadImageCards(cards);
 notice('');
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
   for(const r of items){const row=element('div',null,'run');row.append(element('span',labels[r.status]??r.status,'badge'),action(r.subject+' · '+(r.source==='direct'?'직접 실행':'웹')+' · '+date(r.created_at),()=>report(r.id)));list.append(row);}
   context.runOffset+=items.length;more.hidden=items.length<100;
   if(!items.length&&!append)list.append(element('p','저장된 분석이 없습니다.'));
 }catch(error){
   if(!contextActive(context)||version!==context.runVersion)return;
   if(!append)list.replaceChildren(element('p','이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'));
   throw error;
 }finally{if(contextActive(context)&&version===context.runVersion)more.disabled=false;}
}
function showHistory(title,subtitle=''){
 if(!dialog.open){previousFocus=document.activeElement;dialog.showModal();document.body.classList.add('history-open');}
 $('history-title').textContent=title;$('history-subtitle').textContent=subtitle;$('history-notice').textContent='';
}
function closeHistory(){
 ++dialogGeneration;++reportGeneration;mailHistory=null;openedDocument=null;
 if(dialog.open)dialog.close();document.body.classList.remove('history-open');
 if(previousFocus?.isConnected&&previousFocus.getClientRects().length)previousFocus.focus({preventScroll:true});previousFocus=null;
}
async function openMailHistory(id,subject){
 ++dialogGeneration;++reportGeneration;
 const context={prefix:'mail-',mailId:id,subject,runOffset:0,legacyOffset:0,runVersion:0,legacyVersion:0};mailHistory=context;
 openedDocument=null;showHistory('이 메일 분석 이력',subject);$('report').hidden=true;$('mail-history-lists').hidden=false;$('history-back').hidden=true;
 $('mail-runs').replaceChildren(element('p','이력을 불러오는 중입니다…'));
 $('mail-legacy-list').replaceChildren(element('p','이전 문서를 확인하는 중입니다…'));
 $('mail-more-runs').hidden=true;$('mail-legacy-more').hidden=true;$('history-body').scrollTop=0;
 await Promise.all([safe(()=>runs(context)),safe(()=>legacy(context))]);
}
function showDocument(kind,id){
 if(!dialog.open){mailHistory=null;showHistory(kind==='run'?'분석 보고서':'이전 문서');}
 if(!$('mail-history-lists').hidden)listFocus=document.activeElement;
 openedDocument={kind,id};$('mail-history-lists').hidden=true;$('history-back').hidden=!mailHistory;
 const box=$('report');box.hidden=false;box.replaceChildren(element('p','문서를 불러오는 중입니다…'));
 $('history-notice').textContent='';$('history-body').scrollTop=0;
 return {generation:dialogGeneration,version:++reportGeneration,box};
}
function documentActive(request){return dialog.open&&request.generation===dialogGeneration&&request.version===reportGeneration;}
function backToHistory(){
 ++reportGeneration;openedDocument=null;$('report').hidden=true;$('mail-history-lists').hidden=false;$('history-back').hidden=true;
 $('history-notice').textContent='';if(listFocus?.isConnected)listFocus.focus({preventScroll:true});
}
async function report(id){
 const request=showDocument('run',id),r=await api('/runs/'+id);if(!documentActive(request))return;
 const box=request.box;box.replaceChildren(element('h2',r.subject+' · '+(labels[r.status]??r.status)));
 if(r.error)box.append(element('p',r.error));
 if(r.result){
   box.append(element('pre',r.result.report));
   if(r.result.knowledge)box.append(element('h3','업무 지식 반영 제안'),element('pre',r.result.knowledge));
   for(const review of r.reviews)box.append(element('h3',review.author+' 리뷰'),element('pre',review.body));
   if(r.status==='needs_input'&&r.identity_kind==='outlook'){
     box.append(element('p',r.result.question),element('p','Outlook 예외 메일은 직접 실행에서 답변을 반영해 다시 분석하세요. 원본 파일과 공용 메일 식별자를 함께 사용합니다.'));
   }else if(r.status==='needs_input'){
     box.append(element('p',r.result.question));const answer=element('textarea');answer.setAttribute('aria-label','추가 답변');box.append(answer);
     const submit=action('답변하고 다시 분석',async()=>{
       if(!answer.value.trim())throw new Error('답변을 입력하세요.');
       submit.disabled=true;
       try{await api('/runs',{storeId:r.store_id,mailId:Number(r.mail_id),messageId:r.message_id,source:'web',requestId:crypto.randomUUID(),parentId:id,answer:answer.value});
         if(documentActive(request)){await openMailHistory(Number(r.mail_id),r.subject);notice('답변을 반영한 새 분석을 등록했습니다.');}
       }finally{submit.disabled=false;}
     });box.append(submit);
   }
   const link=element('a','Markdown 보고서 열기');link.href='/api/runs/'+id+'/export';link.target='_blank';link.rel='noopener';box.append(link);
 }
 if(!r.result&&!r.error)box.append(element('p','아직 보고서가 없습니다. 새로고침으로 진행 상태를 확인하세요.'));
 box.focus({preventScroll:true});
}
async function legacy(context=mainHistory,append=false){
 const version=++context.legacyVersion,list=$(context.prefix+'legacy-list'),more=$(context.prefix+'legacy-more');more.disabled=true;
 try{
   const rows=await api('/legacy?'+historyQuery(context,append?context.legacyOffset:0));
   if(!contextActive(context)||version!==context.legacyVersion)return;
   if(!append){list.replaceChildren();context.legacyOffset=0;}
   for(const item of rows){const row=element('div',null,'run');row.append(element('span',item.mail_key?'메일 연결 확인':'미연결 보존','badge'),action(item.source_path,()=>legacyDocument(item.id)));list.append(row);}
   context.legacyOffset+=rows.length;more.hidden=rows.length<100;
   if(!rows.length&&!append)list.append(element('p',context.mailId?'이 메일과 확인 연결된 이전 문서가 없습니다.':'아직 이전한 문서가 없습니다.'));
 }catch(error){
   if(!contextActive(context)||version!==context.legacyVersion)return;
   if(!append)list.replaceChildren(element('p','이전 이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'));
   throw error;
 }finally{if(contextActive(context)&&version===context.legacyVersion)more.disabled=false;}
}
async function legacyDocument(id){
 const request=showDocument('legacy',id),document=await api('/legacy/'+id);if(!documentActive(request))return;
 const box=element('div');box.id='legacy-document';box.append(element('h2',document.source_path),element('p','원본 SHA-256: '+document.source_hash,'meta'),element('pre',document.body));
 request.box.replaceChildren(box);request.box.focus({preventScroll:true});
}
async function refreshHistory(){
 if(openedDocument)return openedDocument.kind==='run'?report(openedDocument.id):legacyDocument(openedDocument.id);
 if(mailHistory){$('history-notice').textContent='';await Promise.all([safe(()=>runs(mailHistory)),safe(()=>legacy(mailHistory))]);}
}
function selectedView(){return ['mailbox','history','legacy'].includes(location.hash.slice(1))?location.hash.slice(1):'mailbox';}
async function navigate(){
 closeHistory();activeView=selectedView();notice('');
 for(const name of ['mailbox','history','legacy']){
   $('view-'+name).hidden=name!==activeView;
   const link=document.querySelector('[data-view="'+name+'"]');if(name===activeView)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 if(activeView==='history')await runs();else if(activeView==='legacy')await legacy();
}
$('history-close').onclick=closeHistory;
dialog.addEventListener('cancel',event=>{event.preventDefault();closeHistory();});
$('history-back').onclick=backToHistory;$('history-refresh').onclick=()=>safe(refreshHistory);
$('mail-more-runs').onclick=()=>safe(()=>runs(mailHistory,true));
$('mail-legacy-more').onclick=()=>safe(()=>legacy(mailHistory,true));
$('legacy-refresh').onclick=()=>safe(()=>legacy());
$('legacy-more').onclick=()=>safe(()=>legacy(mainHistory,true));
$('login-form').onsubmit=e=>{e.preventDefault();safe(async()=>{await api('/login',{token:$('token').value});$('token').value='';await boot();});};
$('search-form').onsubmit=e=>{e.preventDefault();offset=0;safe(mails);};
$('sync').onclick=()=>safe(async()=>{await api('/sync',{});notice('동기화를 시작했습니다.');await status();});
$('previous').onclick=()=>{offset=Math.max(0,offset-30);safe(mails);};
$('next').onclick=()=>{if(nextOffset!=null){offset=nextOffset;safe(mails);}};
$('refresh').onclick=()=>safe(()=>runs());
$('more-runs').onclick=()=>safe(()=>runs(mainHistory,true));
window.addEventListener('hashchange',()=>{if(!$('workspace').hidden)safe(navigate);});
async function boot(){await status();$('login').hidden=true;$('workspace').hidden=false;await Promise.all([mails(),navigate()]);notice('');}
safe(boot);
let polling=false;
setInterval(()=>{
 if($('workspace').hidden||polling)return;polling=true;
 void safe(async()=>{
   const s=await status();if(priorSync==='running'&&s.sync?.status!=='running')await mails();priorSync=s.sync?.status;
   if(dialog.open&&mailHistory&&!openedDocument&&mailHistory.runOffset<=100&&!$('mail-runs').contains(document.activeElement))await runs(mailHistory);
   else if(!dialog.open&&activeView==='history'&&mainHistory.runOffset<=100&&!$('runs').contains(document.activeElement))await runs();
 }).finally(()=>{polling=false;});
},10000);
