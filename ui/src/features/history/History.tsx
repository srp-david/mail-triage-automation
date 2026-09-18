import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState} from 'react';
import {useSession} from '../../api/client';
import {date,labels,legacyTitle,type Legacy,type Run} from '../../api/types';
import {usePolling,useResource} from '../../hooks/async';
import {Action} from '../../components/Common';
import {MarkdownView} from '../../components/Documents';
import {RunReport,type ReportHandle} from '../analysis/RunReport';
export type DocumentChoice={kind:'run'|'legacy';id:string};
export interface HistoryState {mailId?:number;subject?:string;document?:DocumentChoice}
export interface ListHandle {refresh:()=>Promise<unknown>}
export const HistoryList=forwardRef<ListHandle,{kind:'runs'|'legacy';mailId?:number;prefix?:string;open:(doc:DocumentChoice)=>void;enabled?:boolean}>(function HistoryList({kind,mailId,prefix='',open,enabled=true},ref){
 const {api,storeId,notice}=useSession(),[extra,setExtra]=useState<(Run|Legacy)[]>([]),[moreAvailable,setMoreAvailable]=useState(false),life=useRef(0),[activated,setActivated]=useState(enabled);
 useEffect(()=>{if(enabled)setActivated(true);},[enabled]);
 const path=(offset=0)=>'/'+kind+'?'+new URLSearchParams({...mailId?{storeId,mailId:String(mailId)}:{},offset:String(offset)});
 const resource=useResource(s=>api<(Run|Legacy)[]>(path(),undefined,s),storeId+':'+mailId+':'+kind,activated);
 useEffect(()=>{if(resource.error)notice(resource.error);},[resource.error]);
 useEffect(()=>{++life.current;return()=>{++life.current;};},[mailId,kind,enabled]);
 useEffect(()=>{setExtra([]);setMoreAvailable((resource.data?.length??0)>=100);},[resource.data]);
 useImperativeHandle(ref,()=>({refresh:resource.refresh}));
 const listId=prefix+(kind==='runs'?'runs':'legacy-list'),moreId=prefix+(kind==='runs'?'more-runs':'legacy-more');
 usePolling(()=>{const list=document.getElementById(listId);if(!extra.length&&!list?.contains(document.activeElement))return resource.refresh();},10000,enabled&&kind==='runs');
 return <><div id={listId}>{resource.error?<p>{kind==='runs'?'이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.':'이전 이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'}</p>:resource.data?[...resource.data,...extra].map(item=>kind==='runs'?<div className="run" key={item.id}><span className="badge">{(item as Run).handled_at?'처리 완료':labels[(item as Run).status]??(item as Run).status}</span><button onClick={()=>open({kind:'run',id:item.id})}>{(item as Run).subject} · {(item as Run).source==='direct'?'직접 실행':'웹'} · {date((item as Run).created_at)}</button></div>:<div className="run" key={item.id}><span className="badge">{(item as Legacy).mail_key?'메일 연결 확인':'미연결 보존'}</span><button onClick={()=>open({kind:'legacy',id:item.id})}>{legacyTitle(item as Legacy)}</button></div>):<p>이력을 불러오는 중입니다…</p>}
 {resource.data?.length===0&&!resource.error&&<p>{kind==='runs'?'저장된 분석이 없습니다.':mailId?'이 메일과 확인 연결된 이전 문서가 없습니다.':'아직 이전한 문서가 없습니다.'}</p>}</div>
 <Action id={moreId} hidden={!moreAvailable||!!resource.error} disabled={resource.loading} onAction={async()=>{const version=life.current;const rows=await api<(Run|Legacy)[]>(path((resource.data?.length??0)+extra.length));if(version!==life.current)return;setExtra(old=>[...old,...rows]);setMoreAvailable(rows.length>=100);}}>{kind==='runs'?'이력 더 보기':'이전 이력 더 보기'}</Action></>;
});
const LegacyDocument=forwardRef<ReportHandle,{id:string}>(function LegacyDocument({id},ref){
 const {api}=useSession(),resource=useResource(s=>api<Legacy>('/legacy/'+id,undefined,s),id);useImperativeHandle(ref,()=>({refresh:resource.refresh}));
 const item=resource.data;if(!item)return <p>{resource.error||'문서를 불러오는 중입니다…'}</p>;
 return <div id="legacy-document"><h2>{legacyTitle(item)}</h2><details className="document-info"><summary>문서 정보</summary><p className="meta">파일 경로: {item.source_path}</p><p className="meta">원본 SHA-256: {item.source_hash}</p></details><MarkdownView value={item.body} label="이전 문서"/></div>;
});
export function HistoryDialog({state,setState,notice,onChanged}:{state:HistoryState|null;setState:(s:HistoryState|null)=>void;notice:string;onChanged:()=>Promise<unknown>}){
 const dialog=useRef<HTMLDialogElement>(null),previousFocus=useRef<HTMLElement|null>(null),listFocus=useRef<HTMLElement|null>(null),runs=useRef<ListHandle>(null),legacy=useRef<ListHandle>(null),report=useRef<ReportHandle>(null),[title,setTitle]=useState('이 메일 분석 이력');
 useLayoutEffect(()=>{if(state){if(!dialog.current!.open){previousFocus.current=document.activeElement as HTMLElement;dialog.current!.showModal();document.body.classList.add('history-open');}}else{dialog.current?.close();document.body.classList.remove('history-open');if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});previousFocus.current=null;}},[!!state]);
 useEffect(()=>()=>{document.body.classList.remove('history-open');},[]);
 useLayoutEffect(()=>{if(!state)return;setTitle(state.document?.kind==='legacy'?'이전 문서':state.document?'분석 보고서':'이 메일 분석 이력');document.getElementById('history-body')!.scrollTop=0;if(state.document)document.getElementById('report')?.focus({preventScroll:true});},[state?.document?.id,state?.document?.kind,state?.mailId]);
 function open(document:DocumentChoice){listFocus.current=window.document.activeElement as HTMLElement;setState({...state,document});}
 async function changed(){await onChanged();await Promise.all([runs.current?.refresh(),legacy.current?.refresh()]);}
 return <dialog id="history-dialog" className="history-dialog" aria-labelledby="history-title" aria-describedby="history-subtitle" ref={dialog} onCancel={e=>{e.preventDefault();setState(null);}}>
 <div className="history-head"><div><h2 id="history-title">{title}</h2><p id="history-subtitle">{state?.subject}</p></div><button id="history-close" autoFocus onClick={()=>setState(null)}>닫기</button></div>
 <div className="history-tools"><button id="history-back" hidden={!state?.document||!state.mailId} onClick={()=>{setState({...state,document:undefined});queueMicrotask(()=>listFocus.current?.isConnected&&listFocus.current.focus({preventScroll:true}));}}>이력 목록으로</button><Action id="history-refresh" onAction={()=>state?.document?report.current?.refresh():Promise.all([runs.current?.refresh(),legacy.current?.refresh()])}>새로고침</Action><p id="history-notice" role="status">{state?notice:''}</p></div>
 <div id="history-body" className="history-body">{state&&<><div id="mail-history-lists" hidden={!!state.document||!state.mailId}>{state.mailId&&<><section><h3>분석 이력</h3><HistoryList ref={runs} kind="runs" mailId={state.mailId} prefix="mail-" open={open} enabled={!state.document}/></section><section><h3>연결된 이전 이력</h3><HistoryList ref={legacy} kind="legacy" mailId={state.mailId} prefix="mail-" open={open} enabled={!state.document}/><p className="meta">메일 연결이 확인된 기존 문서만 표시합니다. 미연결 문서는 이전 이력 메뉴에서 확인하세요.</p></section></>}</div>
 <section id="report" tabIndex={-1} hidden={!state.document}>{state.document?.kind==='run'?<RunReport key={state.document.id} id={state.document.id} ref={report} onTitle={setTitle} onChanged={changed} onAnalysis={run=>{setState({mailId:Number(run.mail_id),subject:run.subject,document:{kind:'run',id:run.id}});void onChanged();}}/>:state.document&&<LegacyDocument key={state.document.id} id={state.document.id} ref={report}/>}</section></>}</div></dialog>;
}
