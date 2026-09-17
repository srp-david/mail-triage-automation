const labels={analysis_started:'분석 실행 시작',mail_read:'메일 본문 확인',mail_tool:'메일 자료 조회 작업',db_tool:'DB 조회 작업',local_tool:'분석 도구 실행',other_tool:'연결 도구 실행',result_saving:'분석 결과 저장 시작'};
const active=run=>['queued','running'].includes(run.status);
function element(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
function seconds(value,now){const at=Date.parse(value);return Number.isFinite(at)?Math.max(0,Math.floor((now-at)/1000)):null;}
function duration(value){if(value===null)return '시간 확인 중';const h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=value%60;return (h?h+'시간 ':'')+(m?m+'분 ':'')+s+'초';}
function eventText(event){const label=labels[event.kind]??'작업';return label+(event.outcome==='failed'?' 실패':event.kind==='analysis_started'||event.kind==='result_saving'?'':' 완료');}

export function analysisProgress(initial,{fetchRun,isCurrent,onFinished,onUpdate=()=>{}}){
  let run=initial,stopped=false,busy=false,unavailable=false,revision='';
  const box=element('section',null,'analysis-progress');box.setAttribute('aria-label','분석 진행 상황');
  const heading=element('div',null,'analysis-progress-heading'),spinner=element('span',null,'sync-spinner');spinner.setAttribute('aria-hidden','true');
  const elapsed=element('strong');heading.append(spinner,elapsed);
  const latest=element('p',null,'analysis-latest');latest.setAttribute('role','status');
  const activity=element('p',null,'meta'),connection=element('p',null,'meta'),warning=element('p',null,'analysis-progress-warning');warning.setAttribute('role','status');
  const hint=element('p',null,'meta');
  const details=element('details'),summary=element('summary','최근 작업 기록'),events=element('ol');details.append(summary,events);
  box.append(heading,latest,activity,connection,warning,hint,details);
  function draw(){
    const now=active(run)?Date.now():Date.parse(run.finished_at)||Date.now();
    elapsed.textContent=(run.status==='queued'?'분석 대기 · ':active(run)?'분석 중 · ':'분석 소요 시간 · ')+duration(seconds(run.started_at??run.created_at,now));
    const heartbeat=seconds(run.heartbeat_at,Date.now());
    spinner.hidden=run.status!=='running'||unavailable||heartbeat!==null&&heartbeat>90;
    connection.hidden=!active(run);
    connection.textContent=run.status==='queued'?'분석 순서를 기다리고 있습니다.'
      :heartbeat===null?'실행 연결 확인을 기다리고 있습니다.'
      :'최근 실행 연결 확인: '+duration(heartbeat)+' 전'+(heartbeat>90?' · 응답이 늦어지고 있습니다.':'');
    warning.textContent=unavailable?'상태를 갱신하지 못했습니다. 표시된 내용은 마지막 확인 기준이며 자동으로 다시 확인합니다.':'';
    warning.hidden=!unavailable;hint.hidden=!active(run);
    const history=Array.isArray(run.progress_events)?run.progress_events:[];
    const toolFailed=history.some(event=>event.outcome==='failed');
    box.classList.toggle('has-warning',active(run)&&(toolFailed||unavailable||heartbeat!==null&&heartbeat>90));
    box.classList.toggle('has-failed',run.status==='failed');
    hint.textContent=toolFailed?'일부 작업이 실패했지만 전체 분석은 아직 진행 중입니다. 최종 결과에서 확인이 필요한 내용을 확인하세요.':'작업 사이에는 새 기록이 없을 수 있습니다. 분석이 끝나면 결과가 자동으로 표시됩니다.';
    const nextRevision=JSON.stringify([run.status,history]);
    if(nextRevision!==revision){
      revision=nextRevision;
      latest.textContent=history.length?'최근 작업: '+eventText(history.at(-1))
        :run.status==='queued'?'분석 요청을 접수했습니다.':run.source==='direct'?'직접 실행의 세부 작업 기록은 제공되지 않습니다.':'아직 전달된 작업 기록이 없습니다.';
      events.replaceChildren(...[...history].reverse().map(event=>{
        const row=element('li');row.append(element('time',new Date(event.at).toLocaleTimeString('ko-KR')),element('span',eventText(event)));
        if(event.outcome==='failed')row.className='event-failed';return row;
      }));
      details.hidden=!history.length;summary.textContent='최근 작업 기록 · '+history.length+'건 (최대 20건)';
    }
    const last=history.at(-1);latest.title=last?'마지막 작업: '+new Date(last.at).toLocaleString('ko-KR'):'';
    activity.hidden=!last||!active(run);activity.textContent=last?'마지막 작업 기록: '+duration(seconds(last.at,Date.now()))+' 전':'';
  }
  async function poll(){
    if(stopped||busy||!isCurrent()||!active(run))return;busy=true;
    try{
      const next=await fetchRun();if(stopped||!isCurrent())return;
      run=next;unavailable=false;draw();onUpdate(run);
      if(!active(run)){stop();await onFinished(run);}
    }catch{if(!stopped&&isCurrent()){unavailable=true;draw();}}
    finally{busy=false;}
  }
  const clock=active(run)?setInterval(()=>{if(!isCurrent())stop();else draw();},1000):null;
  const polling=active(run)?setInterval(()=>void poll(),3000):null;
  function stop(){stopped=true;clearInterval(clock);clearInterval(polling);}
  draw();return {element:box,stop};
}
