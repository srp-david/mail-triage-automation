import {lexer} from 'marked';

const sections=[
  ['메일 요약'],['요구사항 정리'],['대상 프로젝트'],['관련 파일'],
  ['원인 분석','현재 동작 설명'],['수정 방안 제안'],['예상 작업 범위·리스크'],
  ['회신 전 고객에게 확인할 질문'],['회신 초안'],
];

// Validate only newly generated mail analyses, not saved history or report conversations.
// Markdown parsing prevents headings inside code examples from satisfying the template.
export function validateAnalysisReport(report:string){
  const tokens=lexer(report);
  const headings=tokens.flatMap((token,index)=>token.type==='heading'&&token.depth===2?[{token,index}]:[]);
  if(headings.length!==sections.length)throw new Error('REPORT_TEMPLATE_INVALID');
  for(let i=0;i<sections.length;i++){
    const {token,index}=headings[i];
    const title=token.text.replace(/\*\*|__/g,'').replace(/^\d+[.)]\s*/, '').trim();
    const body=tokens.slice(index+1,headings[i+1]?.index??tokens.length);
    if(!sections[i].includes(title)||!body.some(t=>t.type!=='space'&&t.type!=='heading'&&t.type!=='html'&&t.raw.trim())){
      throw new Error('REPORT_TEMPLATE_INVALID');
    }
  }
}
