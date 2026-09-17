const statuses={queued:['분석 대기','pending'],running:['분석 중','pending'],needs_input:['확인 필요','attention'],failed:['최근 분석 실패','failed']};

export function showMailAnalysis(container,summary,unavailable=false){
  container.replaceChildren();container.hidden=true;container.removeAttribute('title');
  const badge=(label,kind)=>{
    const tag=document.createElement('span');tag.className='analysis-badge '+kind;tag.textContent=label;
    container.append(tag);container.hidden=false;
  };
  if(unavailable){badge('이력 확인 불가','unavailable');container.title='분석 이력을 불러오지 못했습니다. 잠시 후 자동으로 다시 확인합니다.';return;}
  if(!summary)return;
  if(summary.handledAt)badge('✓ 처리 완료','handled');
  if(summary.completedCount>0)badge('✓ 분석 완료','completed');
  const state=statuses[summary.latestStatus];if(state&&!summary.handledAt)badge(...state);
  if(summary.legacyCount>0)badge('이전 이력 '+summary.legacyCount+'건','legacy');
  if(!container.hidden)container.title='분석 이력 '+summary.runCount+'건 · 완료 '+summary.completedCount+'건 · 연결된 이전 문서 '+summary.legacyCount+'건. 메일을 열어 이 메일 분석 이력에서 확인하세요. 분석 완료는 고객 업무 해결 여부와 별개입니다.';
}
