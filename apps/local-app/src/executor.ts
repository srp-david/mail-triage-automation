import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {AgentAdapter,type Profile} from '../../../packages/agent-adapters/src/index.js';
import type {Executor,RunnerProgress} from '../../../packages/runner/src/runner.js';
import type {LocalSelection} from './ui-routes.js';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import type {EvidenceProviders} from '../../../packages/agent-adapters/src/evidence.js';
import {validateAnalysisReport} from './report-template.js';
export class LocalExecutor implements Executor {
  constructor(private workRoot:string,private profiles:Partial<Record<'codex'|'claude',Profile>>,private selection:()=>Promise<LocalSelection>,private roots:EvidenceProviders['roots'],private queries:EvidenceProviders['queries']={},private make=(p:Profile)=>new AgentAdapter(p)){}
  async execute(run:any,signal:AbortSignal,progress?:(event:RunnerProgress)=>Promise<void>){
    const profile=this.profiles[run.agent as 'codex'|'claude'];if(!profile||profile.agent!==run.agent)throw new ApiError(409,'AGENT_NOT_CONFIGURED');
    if(run.reportOnly){
      const directory=await mkdtemp(join(this.workRoot,'report-')),adapter=this.make(profile);
      try{await adapter.prepare(directory);const {result}=await adapter.executeEvidence({directory,
        providers:{mail:async()=>{throw new ApiError(409,'ORIGINAL_UNAVAILABLE');},context:async()=>({question:run.answer,...run.reportContext,originalAvailable:false}),roots:run.allowEvidence?this.roots:{},queries:run.allowEvidence?this.queries:{}},
        instruction:JSON.stringify({mode:'report-conversation',task:'저장 보고서와 대화를 읽고 사용자 질문에 답한다. 원본 메일은 제공되지 않는다. 새 근거를 확인하지 않았다면 명확히 밝힌다. 보고서를 수정하지 않고 답변과 반영 제안을 작성한다. ERP 쓰기와 메일 변경 금지.',question:run.answer,allowEvidence:run.allowEvidence})},signal);return result;}
      finally{await rm(directory,{recursive:true,force:true});}
    }
    const source=async()=>{signal.throwIfAborted();const selected=await this.selection();if(selected.sourceId!==run.sourceId||!selected.original)throw new ApiError(409,'SOURCE_CHANGED');return selected.original;};
    const mail=async()=>{const value=await (await source()).full(run.mailId);signal.throwIfAborted();if(Number(value.id)!==Number(run.mailId)||(value.messageId??null)!==run.messageId)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');return value;};
    // Check identity before any AI process starts, then again on each evidence request.
    await mail();const directory=await mkdtemp(join(this.workRoot,'agent-')),adapter=this.make(profile);
    try{
      await adapter.prepare(directory);
      const instruction=JSON.stringify({mode:'mail-analysis',sourceId:run.sourceId,mailId:run.mailId,messageId:run.messageId,answer:run.answer??'',task:'지정 메일의 문의 원인과 근거 및 확인 사항을 분석한다. 스킬의 9개 보고서 항목과 순서를 지키고 각 항목에 본문을 작성한다. 수정이 필요하면 파일별 변경 명세를 포함한다. ERP 쓰기·메일 변경·지식 파일 반영은 하지 않는다. 근거 부족은 needs_input으로 보고하되 미확인 사항과 질문을 포함한 전체 보고서를 작성한다.'});
      const {result}=await adapter.executeEvidence({directory,providers:{mail,context:async()=>({answer:run.answer??'',previousReport:run.parentResult??null}),roots:this.roots,queries:this.queries},instruction,onRead:async kind=>{await progress?.({kind:kind==='mail'?'mail_read':kind==='db'?'db_tool':'local_tool',outcome:'completed'});}},signal);
      signal.throwIfAborted();await source();validateAnalysisReport(result.report);return result;
    }finally{
      // This exclusively-created scratch contains only packaged rules and transient MCP configuration.
      // Mail/result originals are returned in memory; the Runner persists its result through DPAPI.
      await rm(directory,{recursive:true,force:true});
    }
  }
}
