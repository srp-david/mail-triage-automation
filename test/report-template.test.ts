import {test} from 'vitest';
import assert from 'node:assert/strict';
import {validateAnalysisReport} from '../apps/local-app/src/report-template.js';
import {analysisReport} from './fixtures/analysis-report.js';

test('analysis template accepts an inquiry and a bug report with Markdown formatting',()=>{
  assert.doesNotThrow(()=>validateAnalysisReport(analysisReport));
  const bug=analysisReport.replace('현재 동작 설명','원인 분석').replace(/^## \d+\. (.+)$/gm,'## **$1**').replaceAll('\n','\r\n');
  assert.doesNotThrow(()=>validateAnalysisReport(bug));
});

test.each([
  ['missing reply',analysisReport.slice(0,analysisReport.indexOf('## 9.'))],
  ['reordered headings',analysisReport.replace('2. 요구사항 정리','2. 대상 프로젝트').replace('3. 대상 프로젝트','3. 요구사항 정리')],
  ['empty body',analysisReport.replace(/(## 6\..*\n)[\s\S]*?(?=## 7\.)/,'$1\n')],
  ['nested heading only',analysisReport.replace(/(## 6\..*\n)[\s\S]*?(?=## 7\.)/,'$1\n### 미확인\n\n')],
  ['comment only',analysisReport.replace(/(## 6\..*\n)[\s\S]*?(?=## 7\.)/,'$1\n<!-- fill later -->\n\n')],
  ['template inside a code fence','```markdown\n'+analysisReport+'\n```'],
  ['quoted template',analysisReport.split('\n').map(line=>'> '+line).join('\n')],
  ['duplicated section',analysisReport+'\n## 9. 회신 초안\n추가 내용'],
])('analysis template rejects %s',(_name,report)=>{
  assert.throws(()=>validateAnalysisReport(report),/REPORT_TEMPLATE_INVALID/);
});
