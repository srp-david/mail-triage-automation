import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {useQueryClient,type QueryKey} from '@tanstack/react-query';
import {mailPages} from '../../api/queries';
import {aborted,errorText,useSession} from '../../api/client';
import {type MailPage,type Summary,type Sync} from '../../api/types';
import {Action} from '../../components/Common';
import {ThreadList,useThreads} from './ThreadList';
import {MailDetail} from './MailDetail';
import {SyncStatus} from './SyncStatus';
import {captureMailPosition,restoreMailPosition,hasMailPaneScroll} from '../../../../public/mail-scroll.js';
export interface MailboxHandle {reload:(reset?:boolean)=>Promise<void>;summaries:()=>Promise<void>;analysisChanged:()=>Promise<void>}
interface Props {visible:boolean;enabled:boolean;sync:Sync|null;startSync:()=>Promise<unknown>;stopSync:()=>Promise<unknown>;onHistory:(id:number,subject:string)=>void;onAnalysis:(id:string,mailId:number,subject:string)=>void;onSelect:()=>void}
const initial={query:'',from:'',after:'',status:'all'};
const stateLabels:Record<string,string>={all:'전체 상태',unanalysed:'미분석',queued:'분석 대기',running:'분석 중',needs_input:'확인 필요',completed:'분석 완료',failed:'분석 실패',handled:'처리 완료',legacy:'이전 이력 있음'};
export const MailboxPage=forwardRef<MailboxHandle,Props>(function MailboxPage({visible,enabled,sync,startSync,stopSync,onHistory,onAnalysis,onSelect},ref){
 const queryClient=useQueryClient(),pendingKey=useRef<QueryKey|null>(null);
 const {api,storeId,notice}=useSession(),[input,setInput]=useState(initial),[applied,setApplied]=useState(initial),[view,setView]=useState('threads'),[offset,setOffset]=useState(0);
 const query=useRef({...initial,view:'threads',offset:0}),[page,setPage]=useState<MailPage|null>(null),pageRef=useRef<MailPage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [selected,setSelected]=useState<number|null>(null),[detailVersion,setDetailVersion]=useState(0),selectedRef=useRef<number|null>(null),[showDetail,setShowDetail]=useState(false),[summaries,setSummaries]=useState(new Map<number,Summary>()),[unavailable,setUnavailable]=useState(false);
 const epoch=useRef(0),request=useRef<AbortController|null>(null),summaryEpoch=useRef(0),summaryRequest=useRef<AbortController|null>(null),lastQuery=useRef('');
 const reading=useRef(new Map<number,{pane:boolean;scroll:number}>()),listScroll=useRef(0),detailRef=useRef<HTMLElement>(null),restore=useRef<ReturnType<typeof captureMailPosition>|null>(null);
 async function refreshSummary(result=pageRef.current){
  if(!enabled)return;const version=++summaryEpoch.current;summaryRequest.current?.abort();const controller=new AbortController();summaryRequest.current=controller;
  const mails=result?.threads?result.threads.flatMap(t=>t.emails):result?.emails??[];
  const ids=[...new Set([...mails.map(m=>m.id),...(selectedRef.current?[selectedRef.current]:[])])];if(!ids.length)return;
  try{const rows:Summary[]=[];for(let i=0;i<ids.length;i+=100){rows.push(...await api<Summary[]>('/mail-analysis?'+new URLSearchParams({mailIds:ids.slice(i,i+100).join(',')}),undefined,controller.signal));}
   if(version===summaryEpoch.current){setSummaries(new Map(rows.map(row=>[Number(row.mailId),row])));setUnavailable(false);}
  }catch(e){if(version===summaryEpoch.current&&!aborted(e))setUnavailable(true);}
 }
 async function load(force=false){
  if(!enabled)return;const version=++epoch.current;request.current?.abort();const controller=new AbortController();request.current=controller;
  const q=query.current,params=new URLSearchParams({limit:'30',offset:String(q.offset),view:q.view});
  if(q.query)params.set('query',q.query);if(q.from)params.set('from_address',q.from);if(q.after)params.set('sent_after',new Date(q.after+'T00:00:00').toISOString());if(q.status!=='all')params.set('analysis_status',q.status);
  setLoading(true);setError('');
  try{
   const queryKey=[...mailPages(storeId),params.toString()];
   if(pendingKey.current&&JSON.stringify(pendingKey.current)!==JSON.stringify(queryKey))void queryClient.cancelQueries({queryKey:pendingKey.current,exact:true});
   pendingKey.current=queryKey;
   if(force){await queryClient.cancelQueries({queryKey:mailPages(storeId)});await queryClient.invalidateQueries({queryKey:mailPages(storeId),refetchType:'none'});}
   if(version!==epoch.current||controller.signal.aborted)return;
   const result=await queryClient.fetchQuery({queryKey,queryFn:({signal})=>api<MailPage>('/mails?'+params+(force?'&refresh=1':''),undefined,signal)});if(version!==epoch.current||controller.signal.aborted)return;
   if(q.offset>0&&q.offset>=result.total){query.current={...q,offset:Math.max(0,Math.floor((result.total-1)/30)*30)};return load();}
   restore.current=lastQuery.current===params.toString()?captureMailPosition():null;lastQuery.current=params.toString();
   const revealed=result.threads?.find(t=>t.emails.some(m=>m.id===controls.reveal.current));if(revealed){controls.expanded.current.set(revealed.id,true);controls.reveal.current=null;}
   pageRef.current=result;setPage(result);setOffset(q.offset);setApplied({query:q.query,from:q.from,after:q.after,status:q.status});setLoading(false);
   await refreshSummary(result);
  }catch(e){if(version!==epoch.current||aborted(e))return;setError(errorText(e));setLoading(false);throw e;}
 }
 const safeLoad=(force=false)=>load(force).catch(e=>{if(!aborted(e))notice(errorText(e));});
 async function analysisChanged(){await queryClient.invalidateQueries({queryKey:mailPages(storeId),refetchType:'none'});if(query.current.status!=='all')await load();else await refreshSummary();}
 useImperativeHandle(ref,()=>({reload:async(reset=false)=>{if(reset)query.current={...query.current,offset:0};await load(true);},summaries:()=>query.current.status==='all'?refreshSummary():analysisChanged(),analysisChanged}));
 useEffect(()=>{let alive=true;queueMicrotask(()=>{if(alive&&enabled)void safeLoad();});return()=>{alive=false;++epoch.current;++summaryEpoch.current;request.current?.abort();summaryRequest.current?.abort();void queryClient.cancelQueries({queryKey:mailPages(storeId)});};},[storeId,enabled]);
 useLayoutEffect(()=>{if(!page)return;if(restore.current)restoreMailPosition(restore.current);else if(hasMailPaneScroll())document.getElementById('mails')!.scrollTop=0;},[page]);
 const controls=useThreads(()=>load(true),view==='threads'&&enabled);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')controls.clear();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
 function saveReading(){if(selectedRef.current!=null&&(showDetail||hasMailPaneScroll()))reading.current.set(selectedRef.current,{pane:hasMailPaneScroll(),scroll:hasMailPaneScroll()?detailRef.current!.scrollTop:scrollY});}
 function restoreReading(){if(selectedRef.current==null||!detailRef.current)return;const pane=hasMailPaneScroll(),saved=reading.current.get(selectedRef.current);const top=saved?.pane===pane?saved.scroll:0;
  if(pane)detailRef.current.scrollTop=top;else if(matchMedia('(max-width:900px)').matches){detailRef.current.focus({preventScroll:true});window.scrollTo(0,top);}}
 function select(id:number){saveReading();onSelect();if(!showDetail)listScroll.current=scrollY;selectedRef.current=id;flushSync(()=>{setSelected(id);setDetailVersion(v=>v+1);setShowDetail(true);});if(matchMedia('(max-width:900px)').matches)detailRef.current?.focus({preventScroll:true});void refreshSummary();}
 function back(){saveReading();flushSync(()=>setShowDetail(false));const button=document.querySelector<HTMLElement>('#mails .is-selected');const group=button?.closest('details');if(group)group.open=true;(button??document.getElementById('mail-list'))?.focus({preventScroll:true});window.scrollTo(0,listScroll.current);}
 function search(reset=false){const values=reset?initial:input;if(reset)setInput(initial);query.current={...values,offset:0,view};notice('');void safeLoad(true);}
 const filters=[applied.query&&'검색어: '+applied.query,applied.from&&'발신자: '+applied.from,applied.after&&'시작일: '+applied.after,applied.status!=='all'&&stateLabels[applied.status]].filter(Boolean);
 const empty=page&&(page.threads?!page.threads.length:!page.emails.length),detachable=page?.threads?.some(t=>t.emails.some(m=>m.manualLinkIds?.length));
 return <div id="view-mailbox" hidden={!visible} className={showDetail?'show-detail':''}><section className="toolbar"><form id="search-form" onSubmit={e=>{e.preventDefault();search();}}>
  <input id="query" placeholder="제목·본문 검색" aria-label="검색어" value={input.query} onChange={e=>setInput({...input,query:e.target.value})}/><input id="from" placeholder="발신자 이메일" aria-label="발신자" value={input.from} onChange={e=>setInput({...input,from:e.target.value})}/><input id="after" type="date" aria-label="시작일" value={input.after} onChange={e=>setInput({...input,after:e.target.value})}/>
  <select id="analysis-status" aria-label="분석 상태" aria-describedby="analysis-filter-help" value={input.status} onChange={e=>setInput({...input,status:e.target.value})}>{Object.entries(stateLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button>검색</button><button id="reset-search" type="button" className="secondary-button" onClick={()=>search(true)}>조건 초기화</button></form><SyncStatus sync={sync} start={startSync} stop={stopSync}/></section>
  <div className="columns"><section id="mail-list" tabIndex={-1}><div className="mail-list-head"><div className="section-head"><h2>메일함</h2><span id="total">{!error&&page&&(page.threads?`${page.total}개 대화 · ${page.mailTotal}개 메일`:page.total+'건')}</span></div><div className="mail-list-options"><div className="mail-view-tools"><label htmlFor="mail-view">목록 보기</label><select id="mail-view" aria-describedby="thread-help" value={view} onChange={e=>{setView(e.target.value);query.current={...query.current,offset:0,view:e.target.value};controls.clear();void safeLoad();}}><option value="threads">스레드 보기</option><option value="individual">개별 보기</option></select></div>
   <details className="mail-list-help"><summary>사용 안내</summary><div className="mail-help-content"><p id="thread-help" className="meta">대화를 펼쳐 메일을 선택하세요. 검색 조건에 맞는 메일만 표시합니다.</p><p className="meta">메일을 대화 제목에 놓으면 연결됩니다. 수동 연결된 메일은 펼친 뒤 하단 해제 영역으로 끌어내세요.</p></div></details>{controls.tools}</div><p id="applied-filters" className="meta" role="status">{filters.length?'적용된 조건 · '+filters.join(' · '):'전체 메일'}</p>{controls.status}</div>
   <div id="mails" tabIndex={0} aria-label="메일 목록" aria-busy={loading||undefined}>{error?<><p>메일을 불러오지 못했습니다. {error}</p><Action onAction={load}>다시 조회</Action></>:page?<><ThreadList page={page} selected={selected} summaries={summaries} unavailable={unavailable} select={select} controls={controls}/>{empty&&<><p>{filters.length?'조건에 맞는 메일이 없습니다. 검색 조건을 줄이거나 초기화해 보세요.':'저장된 메일이 없습니다. 메일 동기화로 가져올 수 있습니다.'}</p>{!!filters.length&&<button onClick={()=>search(true)}>검색 조건 초기화</button>}</>}</>:<p>메일을 불러오는 중입니다.</p>}</div>
   <div className="mail-list-bottom"><div id="thread-detach-zone" hidden={view!=='threads'||!detachable} className={controls.dragging?'is-dragging':''} {...controls.detach}>여기에 놓아 수동 연결 해제</div><div className="pager"><button id="previous" disabled={loading||offset===0||!!error} onClick={()=>{query.current={...query.current,offset:Math.max(0,offset-30)};void safeLoad();}}>이전</button><button id="next" disabled={loading||page?.nextOffset==null||!!error} onClick={()=>{query.current={...query.current,offset:page!.nextOffset!};void safeLoad();}}>다음</button></div></div></section>
   <section id="detail" ref={detailRef} tabIndex={-1} aria-label="선택한 메일">{selected!=null&&enabled?<MailDetail key={selected+':'+detailVersion} id={selected} summary={summaries.get(selected)} unavailable={unavailable} refreshSummary={analysisChanged} onHistory={onHistory} onAnalysis={onAnalysis} onBack={back} onLoaded={restoreReading}/>:<div className="empty"><h2>메일을 선택하세요</h2><p>본문과 첨부를 확인하고 분석을 시작할 수 있습니다.</p></div>}</section></div></div>;
});
