import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {activeRun,date,labels,type Run} from '../../api/types';
import {useSession} from '../../api/client';
import {usePolling,useResource} from '../../hooks/async';
import {Action} from '../../components/Common';
import {MarkdownView} from '../../components/Documents';
import {RunProgress} from './RunProgress';
import {RelatedMails} from './RelatedMails';
import {readDraft,saveDraft} from '../../../../../../public/answer-drafts.js';
export interface ReportHandle {refresh:()=>Promise<unknown>}
function AnswerForm({run,onAnalysis}:{run:Run;onAnalysis:(run:Run)=>void}){
 const {api}=useSession(),[answer,setAnswer]=useState(()=>readDraft(run.store_id,run.id) as string),[busy,setBusy]=useState(false),[volatile,setVolatile]=useState(false),input=useRef<HTMLTextAreaElement>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function update(value:string){setAnswer(value);setVolatile(!saveDraft(run.store_id,run.id,value));}
 useEffect(()=>{if(answer)setVolatile(!saveDraft(run.store_id,run.id,answer));},[]);
 return <><h3>추가 답변 · 재분석</h3>{run.result?.question&&<p>{run.result.question}</p>}{run.status==='completed'&&<p className="meta">분석이 완료되었습니다. 추가 조건이나 의견을 입력하면 기존 보고서와 함께 다시 분석합니다.</p>}
 <textarea ref={input} aria-label="추가 답변" aria-describedby="answer-draft-hint" maxLength={20000} disabled={busy} value={answer} onChange={e=>update(e.target.value)}/><p id="answer-draft-hint" className="meta">{volatile?'임시 저장소를 사용할 수 없습니다. 화면 이동 시에는 유지되지만 브라우저 새로고침 전 답변을 복사해 주세요.':'작성 중인 답변은 이 탭에서 임시 보관됩니다. 새로고침 후에도 같은 분석을 열면 복원됩니다.'}</p>
 <button className="secondary-button" disabled={busy} onClick={()=>{update('');input.current?.focus();}}>초안 지우기</button><Action disabled={busy} onAction={async()=>{if(!answer.trim())throw Error('답변을 입력하세요.');const submitted=answer;setBusy(true);
  try{const next=await api<Run>('/runs',{storeId:run.store_id,mailId:Number(run.mail_id),messageId:run.message_id,source:'web',requestId:crypto.randomUUID(),parentId:run.id,answer:submitted});if(readDraft(run.store_id,run.id)===submitted)saveDraft(run.store_id,run.id,'');if(alive.current)onAnalysis({...next,mail_id:run.mail_id,subject:run.subject});}finally{setBusy(false);}}}>답변하고 다시 분석</Action></>;
}
export const RunReport=forwardRef<ReportHandle,{id:string;onAnalysis:(run:Run)=>void;onChanged:()=>Promise<unknown>;onTitle:(title:string)=>void}>(function RunReport({id,onAnalysis,onChanged,onTitle},ref){
 const {api,notice}=useSession(),resource=useResource(s=>api<Run>('/runs/'+id,undefined,s),id),lastStatus=useRef('');
 useImperativeHandle(ref,()=>({refresh:()=>resource.refresh(true)}));
 usePolling(async()=>{await resource.refresh();},3000,activeRun(resource.data?.status));
 useEffect(()=>{if(resource.data){onTitle(activeRun(resource.data.status)?'분석 진행 상황':'분석 결과');if(lastStatus.current&&activeRun(lastStatus.current)&&!activeRun(resource.data.status))void onChanged();lastStatus.current=resource.data.status;}},[resource.data?.status]);
 if(!resource.data)return <p>{resource.error||'문서를 불러오는 중입니다…'}</p>;
 const r=resource.data,active=activeRun(r.status);
 return <><h2>{r.subject} · {labels[r.status]??r.status}</h2>{(active||!!r.progress_events?.length)&&<RunProgress run={r} unavailable={!!resource.error}/>}
 {r.result&&<div className="report-tools" role="group" aria-label="문서 도구"><a className="document-button" href={'/api/runs/'+id+'/export'} target="_blank" rel="noopener" title="Markdown 원본 파일을 새 탭에서 엽니다.">Markdown 파일 열기 ↗</a></div>}
 {!active&&<div className="handling-actions"><p className="meta">{r.handled_at?'업무 처리 완료 · '+date(r.handled_at):'업무 처리: 완료 표시 없음 · 실제 메일 업무가 끝났다면 처리 완료로 표시하세요. 분석 완료와는 별개입니다.'}</p><Action onAction={async()=>{await api('/runs/'+id+'/handling',{completed:!r.handled_at});await resource.refresh();await onChanged();notice(r.handled_at?'처리 완료를 취소했습니다.':'메일을 처리 완료로 표시했습니다.');}}>{r.handled_at?'처리 완료 취소':'처리 완료'}</Action></div>}
 {r.handled_at&&<p className="meta">처리가 완료된 메일입니다. 아래 보고서와 질문은 당시 분석 기록으로 보존됩니다.</p>}
 {(r.handled_at||!!r.relatedMails?.length)&&<RelatedMails key={JSON.stringify([r.id,r.handled_at,r.relatedMails])} run={r} reload={resource.refresh}/>}
 {r.error&&<p>{r.error}</p>}{resource.error&&!active&&<p role="alert">{resource.error}</p>}
 {r.result&&<><MarkdownView value={r.result.report} label="보고서"/>{r.result.knowledge&&<><h3>업무 지식 반영 제안</h3><MarkdownView value={r.result.knowledge} label="업무 지식 제안"/></>}{r.reviews?.map((review,i)=><div key={i}><h3>{review.author} 리뷰</h3><MarkdownView value={review.body} label={review.author+' 리뷰'}/></div>)}
 {r.status==='needs_input'&&r.handled_at?<><h3>당시 추가 확인 질문</h3><p>{r.result.question}</p></>:!r.handled_at&&['needs_input','completed'].includes(r.status)?r.identity_kind==='outlook'?<>{r.result.question&&<p>{r.result.question}</p>}<p>Outlook 예외 메일은 직접 실행에서 답변을 반영해 다시 분석하세요. 원본 파일과 공용 메일 식별자를 함께 사용합니다.</p></>:<AnswerForm key={r.id} run={r} onAnalysis={onAnalysis}/>:null}</>}
 {!r.result&&!r.error&&!active&&<p>아직 보고서가 없습니다.</p>}</>;
});
