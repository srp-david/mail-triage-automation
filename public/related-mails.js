const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;};
const addresses=items=>(items??[]).map(x=>x.name?x.name+' <'+x.address+'>':x.address).join(', ');
const date=value=>value?new Date(value).toLocaleString('ko-KR'):'날짜 미확인';
const metadata=mail=>'보낸 사람: '+(addresses(mail.from)||'미확인')+' · 받는 사람: '+(addresses(mail.to)||'미확인')+' · '+date(mail.sentAt);

export function relatedMails({run,runId,storeId,api,active,reload}){
 const container=node('section',null,'related-mails'),root=node('details'),list=node('div'),picker=node('div',null,'related-picker'),preview=node('div',null,'related-preview');
 const links=run.relatedMails??[];
 root.append(node('summary','관련 메일 · '+links.length+'건'));container.append(root);
 const status=node('p',null,'related-status');status.setAttribute('role','status');
 let searchVersion=0,previewVersion=0,offset=0,next=null,searchQuery='',senderQuery='',pending=false;
 const live=()=>root.isConnected&&active();
 const message=text=>{if(live())status.textContent=text;};
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=async()=>{try{await fn();}catch(e){message(e.message);}};return b;};
 const closePreview=()=>{++previewVersion;preview.hidden=true;preview.replaceChildren();};
 root.append(node('p','직접 선택해 연결한 메일입니다. 연결하거나 해제해도 분석 보고서와 처리 상태는 유지됩니다.','meta'),list,status);
 if(!links.length)list.append(node('p','연결된 메일이 없습니다.','meta'));
 async function showPreview(path,selectable,trigger){
   const version=++previewVersion;preview.hidden=false;preview.replaceChildren(node('p','메일 본문을 불러오는 중입니다…'));
   const close=button('본문 닫기',()=>{closePreview();if(trigger.isConnected)trigger.focus();});preview.prepend(close);
   try{
     const mail=await api(path);if(!live()||version!==previewVersion)return;
     preview.replaceChildren(close,node('h4',mail.subject),node('p',metadata(mail),'meta'),node('pre',mail.body??'본문이 없습니다.','related-body'));
     if(mail.warnings?.length)preview.append(node('p','조회 경고: '+mail.warnings.join(', '),'meta'));
     if(selectable){
       const connect=button('이 메일 연결',async()=>{
         if(pending)return;pending=true;connect.disabled=true;
         try{await api('/runs/'+runId+'/related-mails',{storeId,mailId:Number(mail.id),messageId:mail.messageId});if(live())await reload();}
         finally{pending=false;connect.disabled=false;}
       });
       connect.disabled=!mail.messageId||!Number.isSafeInteger(Number(mail.id));
       preview.append(connect);
     }
     preview.tabIndex=-1;if(root.open)preview.focus();
   }catch(e){if(live()&&version===previewVersion){preview.replaceChildren(close,node('p','메일을 열 수 없습니다. '+e.message));}}
 }
 for(const link of links){
   const row=node('div',null,'related-row'),info=node('div');
   info.append(node('strong',link.metadata.subject),node('p',metadata(link.metadata),'meta'));
   const controls=node('div',null,'related-controls');
   const open=button('메일 보기',()=>showPreview('/runs/'+runId+'/related-mails/'+link.id,false,open));
   open.setAttribute('aria-label',link.metadata.subject+' 메일 보기');open.disabled=link.available===false;
   if(open.disabled)info.append(node('p','연결 당시 저장소가 달라 현재 열 수 없습니다.','meta'));
   const unlink=button('연결 해제',async()=>{
     unlink.disabled=true;
     try{await api('/runs/'+runId+'/related-mails/'+link.id+'/unlink',{});if(live())await reload();}
     finally{unlink.disabled=false;}
   });
   unlink.setAttribute('aria-label',link.metadata.subject+' 연결 해제');controls.append(open,unlink);row.append(info,controls);list.append(row);
 }
 const form=node('form'),query=node('input'),sender=node('input');
 query.type='search';query.placeholder='제목·본문 검색어';query.setAttribute('aria-label','관련 메일 검색어');query.maxLength=1000;
 sender.placeholder='발신자 이메일';sender.setAttribute('aria-label','관련 메일 발신자');sender.maxLength=320;
 const search=node('button','검색');search.type='submit';form.append(query,sender,search);
 const results=node('div',null,'related-results'),pager=node('div',null,'related-controls');
 const previous=button('이전 후보',()=>searchMails(Math.max(0,offset-20))),more=button('다음 후보',()=>searchMails(next));pager.append(previous,more);
 async function searchMails(start){
   const version=++searchVersion;closePreview();search.disabled=true;previous.disabled=true;more.disabled=true;
   results.replaceChildren(node('p','메일을 검색하는 중입니다…'));
   try{
     const params=new URLSearchParams({query:searchQuery,from_address:senderQuery,limit:'20',offset:String(start)});
     const data=await api('/mails?'+params);if(!live()||version!==searchVersion)return;
     offset=start;next=data.nextOffset??null;results.replaceChildren();
     for(const mail of data.emails??[]){
       const own=run.identity_kind!=='outlook'&&run.store_id===storeId&&Number(run.mail_id)===Number(mail.id);
       const linked=links.some(x=>x.store_id===storeId&&Number(x.mail_id)===Number(mail.id));
       const choose=button(mail.subject,()=>showPreview('/mails/'+mail.id,true,choose));choose.className='related-candidate';
       choose.append(node('span',metadata(mail),'meta'));choose.disabled=own||linked;
       if(own||linked)choose.append(node('span',own?'현재 분석 메일':'이미 연결됨','meta'));results.append(choose);
     }
     if(!data.emails?.length)results.append(node('p','검색된 메일이 없습니다. 검색어나 발신자를 바꿔 주세요.'));
   }catch(e){if(live()&&version===searchVersion){results.replaceChildren(node('p','검색에 실패했습니다. 검색 버튼으로 다시 시도하세요.'));message(e.message);}}
   finally{if(live()&&version===searchVersion){search.disabled=false;previous.disabled=offset===0;more.disabled=next==null;}}
 }
 const add=button('관련 메일 연결',()=>{picker.hidden=false;add.hidden=true;query.focus();});
 add.disabled=run.store_id!==storeId;
 const cancel=button('선택 취소',()=>{++searchVersion;closePreview();picker.hidden=true;add.hidden=false;search.disabled=false;add.focus();});
 picker.hidden=true;preview.hidden=true;previous.disabled=true;more.disabled=true;
 picker.append(node('p','웹 앱에서 조회 가능한 메일을 검색하고 본문을 확인한 뒤 연결하세요.','meta'),form,results,pager,cancel);
 form.onsubmit=e=>{e.preventDefault();searchQuery=query.value.trim();senderQuery=sender.value.trim();void searchMails(0);};
 if(run.handled_at){root.append(add,picker);if(add.disabled)root.append(node('p','현재 저장소와 분석 메일의 저장소가 달라 새 메일을 연결할 수 없습니다.','meta'));}
 else root.append(node('p','새 메일 연결은 처리 완료 후 가능합니다.','meta'));
 root.append(preview);return container;
}
