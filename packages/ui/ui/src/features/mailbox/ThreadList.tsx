import {useRef,useState,type DragEvent} from 'react';
import {useSession,errorText} from '../../api/client';
import {date,type Mail,type MailPage,type Summary,type ThreadLink} from '../../api/types';
import {Action} from '../../components/Common';
import {useResource} from '../../hooks/async';
const mime='application/x-mail-triage-thread';
const identity=(mail:Mail)=>({id:mail.id,messageId:mail.messageId??null,fetchedAt:mail.fetchedAt});
export function Badges({summary,unavailable,mailId}:{summary?:Summary;unavailable:boolean;mailId:number}){
 const states:Record<string,[string,string]>={queued:['분석 대기','pending'],running:['분석 중','pending'],needs_input:['확인 필요','attention'],failed:['최근 분석 실패','failed']};
 const badges:[string,string][]=[];
 if(unavailable)badges.push(['이력 확인 불가','unavailable']);
 else if(summary){if(summary.handledAt)badges.push(['✓ 처리 완료','handled']);if(summary.completedCount>0)badges.push(['✓ 분석 완료','completed']);if(states[summary.latestStatus??'']&&!summary.handledAt)badges.push(states[summary.latestStatus!]);if(summary.legacyCount>0)badges.push(['이전 이력 '+summary.legacyCount+'건','legacy']);}
 return <span className="mail-analysis" data-mail-id={mailId} hidden={!badges.length} title={unavailable?'분석 이력을 불러오지 못했습니다. 잠시 후 자동으로 다시 확인합니다.':summary?`분석 이력 ${summary.runCount}건 · 완료 ${summary.completedCount}건 · 연결된 이전 문서 ${summary.legacyCount}건. 분석 완료는 고객 업무 해결 여부와 별개입니다.`:undefined}>{badges.map(([text,kind])=><span key={kind} className={'analysis-badge '+kind}>{text}</span>)}</span>;
}
export function useThreads(refresh:()=>Promise<unknown>,enabled:boolean){
 const {api,storeId}=useSession(),drag=useRef<{mail:Mail;store:string;nonce:string}|null>(null),lock=useRef(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[undo,setUndo]=useState<{id:string;store:string}|null>(null),[manager,setManager]=useState(false),[dragging,setDragging]=useState(false);
 const links=useResource(s=>api<ThreadLink[]>('/thread-links',undefined,s),storeId,enabled&&manager);
 const expanded=useRef(new Map<string,boolean>()),reveal=useRef<number|null>(null);
 const clear=()=>{drag.current=null;setDragging(false);document.querySelectorAll('.thread-drop-target').forEach(el=>el.classList.remove('thread-drop-target'));};
 async function mutate(path:string,body:unknown,text:string,connect=false){
  if(lock.current)return;lock.current=true;setBusy(true);clear();
  try{const result=await api<{created?:boolean;link?:ThreadLink}>(path,body);setMessage(text);setUndo(connect&&result.created&&result.link?{id:result.link.id,store:storeId}:null);
   try{await refresh();}catch{setMessage('목록을 갱신하지 못했습니다. 다시 검색해 주세요. '+text);}
   if(manager)await links.refresh();
  }catch(e){setMessage((connect?'대화에 연결하지 못했습니다. ':'연결을 해제하지 못했습니다. ')+errorText(e)+' 다시 끌어다 놓아 주세요.');}
  finally{lock.current=false;setBusy(false);}
 }
 const remove=(id:string,store=storeId)=>store===storeId?mutate('/thread-links/'+encodeURIComponent(id)+'/unlink',{storeId:store},'수동 연결을 해제했습니다. 답장 헤더나 다른 연결이 있으면 같은 대화로 남을 수 있습니다.'):Promise.resolve(setMessage('메일 저장소가 변경되었습니다. 다시 조회해 주세요.'));
 function source(mail:Mail,allowed:boolean){return !allowed||typeof mail.fetchedAt!=='string'?{}:{draggable:true,
  title:mail.manualLinkIds?.length?'아래 해제 영역으로 끌어내어 수동 연결 해제':'다른 대화에 끌어다 놓아 연결',
  onDragStart:(e:DragEvent)=>{if(lock.current){e.preventDefault();return;}clear();const nonce=crypto.randomUUID();drag.current={mail,store:storeId,nonce};e.dataTransfer.effectAllowed=mail.manualLinkIds?.length?'move':'link';e.dataTransfer.setData(mime,nonce);setDragging(!!mail.manualLinkIds?.length);setManager(false);},onDragEnd:clear};}
 function target(mail:Mail){const valid=()=>!!drag.current&&!lock.current&&!drag.current.mail.manualLinkIds?.length&&drag.current.store===storeId&&drag.current.mail.id!==mail.id;return {
  onDragOver:(e:DragEvent)=>{if(valid()&&e.dataTransfer.types.includes(mime)){e.preventDefault();e.dataTransfer.dropEffect='link';e.currentTarget.classList.add('thread-drop-target');}},
  onDragLeave:(e:DragEvent)=>{if(!e.currentTarget.contains(e.relatedTarget as Node))e.currentTarget.classList.remove('thread-drop-target');},
  onDrop:(e:DragEvent)=>{const item=drag.current;if(!valid()||!item||e.dataTransfer.getData(mime)!==item.nonce)return;e.preventDefault();e.stopPropagation();reveal.current=item.mail.id;void mutate('/thread-links',{storeId,source:identity(item.mail),target:identity(mail)},`“${item.mail.subject}” 메일을 “${mail.subject}” 대화에 연결했습니다.`,true);}};}
 const validDetach=()=>!lock.current&&drag.current?.store===storeId&&!!drag.current?.mail.manualLinkIds?.length;
 const detach={onDragOver:(e:DragEvent)=>{if(validDetach()&&e.dataTransfer.types.includes(mime)){e.preventDefault();e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('thread-drop-target');}},onDragLeave:(e:DragEvent)=>e.currentTarget.classList.remove('thread-drop-target'),onDrop:(e:DragEvent)=>{const item=drag.current;if(!validDetach()||!item||e.dataTransfer.getData(mime)!==item.nonce)return;e.preventDefault();e.stopPropagation();void mutate('/thread-links/detach',{storeId,mail:identity(item.mail),linkIds:item.mail.manualLinkIds},`“${item.mail.subject}” 메일의 수동 연결을 해제했습니다. 자동 답장 관계는 유지됩니다.`);}};
 return {expanded,reveal,source,target,detach,dragging,clear,
  tools:<div id="manual-thread-tools" hidden={!enabled} aria-busy={busy||undefined}><details id="thread-link-manager" open={manager} onToggle={e=>setManager(e.currentTarget.open)}><summary>수동 연결 관리</summary><div id="thread-link-list" aria-busy={links.loading}>{links.error?<><p>{links.error}</p><Action onAction={links.refresh}>다시 조회</Action></>:links.data?.length?links.data.map(link=><div className="thread-link-row" key={link.id}><span>{link.source.subject||'(제목 없음)'} ↔ {link.target.subject||'(제목 없음)'}</span><Action disabled={busy} onAction={()=>remove(link.id)}>연결 해제</Action></div>):<p className="meta">{links.loading?'연결을 불러오는 중입니다…':'저장된 수동 연결이 없습니다.'}</p>}</div></details></div>,
  status:<div id="thread-action-status" role="status" aria-live="polite" hidden={!enabled}>{message&&<span>{message}</span>}{undo&&<Action className="secondary-button" disabled={busy} onAction={()=>remove(undo.id,undo.store)}>되돌리기</Action>}</div>};
}
export function ThreadList({page,selected,summaries,unavailable,select,controls}:{page:MailPage;selected:number|null;summaries:Map<number,Summary>;unavailable:boolean;select:(id:number)=>void;controls:ReturnType<typeof useThreads>}){
 const button=(mail:Mail,draggable=false)=><button key={mail.id} type="button" data-mail-id={mail.id} aria-current={selected===mail.id?'true':undefined} className={'mail'+(selected===mail.id?' is-selected':'')+(draggable&&mail.fetchedAt?' thread-draggable':'')+(draggable&&mail.manualLinkIds?.length?' thread-detachable':'')} {...controls.source(mail,draggable)} onClick={()=>select(mail.id)}><strong>{mail.subject||'(제목 없음)'}</strong><span>{(mail.from??[]).map(x=>x.name??x.address).join(', ')} · {date(mail.sentAt)}</span><Badges mailId={mail.id} summary={summaries.get(mail.id)} unavailable={unavailable}/></button>;
 return <>{page.threads?page.threads.map(thread=>{const mail=thread.emails[0];if(!mail)return null;
  if(thread.emails.length===1)return <div className="thread-singleton" key={thread.id} {...controls.target(mail)}>{button(mail,(thread.totalMembers??1)===1||!!mail.manualLinkIds?.length)}</div>;
  return <details key={thread.id} data-thread-id={thread.id} className={'mail-thread'+(thread.emails.some(m=>m.id===selected)?' has-selected-mail':'')} open={controls.expanded.current.get(thread.id)??thread.emails.some(m=>m.id===selected)} onToggle={e=>controls.expanded.current.set(thread.id,e.currentTarget.open)}>
   <summary className="thread-summary" {...controls.target(mail)}><strong>{mail.subject||'(제목 없음)'}</strong><span className="thread-count">{thread.emails.length}개 메일</span><span className="thread-meta">{(mail.from??[]).map(x=>x.name||x.address).join(', ')} · {date(mail.sentAt)}</span>{!!thread.manualLinkIds?.length&&<span className="thread-manual-badge">수동 연결</span>}</summary><div className="thread-members">{thread.emails.map(m=>button(m,!!m.manualLinkIds?.length))}</div></details>;
 }):page.emails.map(mail=>button(mail))}</>;
}
