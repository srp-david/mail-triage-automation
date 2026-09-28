import { useState } from 'react';
import { Checkbox, FormControlLabel, MenuItem, TextField, Button } from '@mui/material';
import { useSession } from '../../api/client';
import { Action } from '../../components/Common';
import { TextArea } from '../../components/Controls';
import { readDraft, saveDraft } from '../../../../../../public/answer-drafts.js';
type Question = {
  requestId: string;
  question: string;
  agent: string;
  allowEvidence: boolean;
  expectedVersion: number;
};
export function ReportQuestion({
  id,
  version,
  reload,
}: {
  id: string;
  version: number;
  reload: () => Promise<unknown>;
}) {
  const { api, userId, storeId } = useSession(),
    scope = JSON.stringify([userId, storeId, 'report-question']);
  const [value, setValue] = useState<Question>(() => {
    try {
      const saved = JSON.parse(readDraft(scope, id));
      if (typeof saved.question === 'string' && saved.requestId) return saved;
    } catch {
      /* new question */
    }
    return {
      requestId: crypto.randomUUID(),
      question: '',
      agent: 'codex',
      allowEvidence: false,
      expectedVersion: version,
    };
  });
  const [busy, setBusy] = useState(false),
    [volatile, setVolatile] = useState(false);
  function update(patch: Partial<Question>) {
    const next = { ...value, ...patch, expectedVersion: version, requestId: crypto.randomUUID() };
    setValue(next);
    setVolatile(!saveDraft(scope, id, JSON.stringify(next)));
  }
  return (
    <fieldset disabled={busy}>
      <h4>개인 AI에게 질문</h4>
      <p>
        저장 보고서와 최근 대화 30건을 사용합니다. 원본 메일은 조회하지 않으며, 선택한 개인 AI의
        사용량이 발생합니다. 답변은 대화에 저장되고 보고서는 자동 변경되지 않습니다.
      </p>
      <TextField
        select
        label="대화 Agent"
        value={value.agent}
        onChange={(e) => update({ agent: e.target.value })}
      >
        <MenuItem value="codex">Codex</MenuItem>
        <MenuItem value="claude">Claude</MenuItem>
      </TextField>
      <FormControlLabel
        control={
          <Checkbox
            checked={value.allowEvidence}
            onChange={(e) => update({ allowEvidence: e.target.checked })}
          />
        }
        label="연결 환경에서 허용한 로컬 자료·읽기 전용 DB 조회 허용"
      />
      <TextArea
        aria-label="AI 질문"
        maxLength={20000}
        value={value.question}
        onChange={(e) => update({ question: e.target.value })}
      />
      {volatile && <p role="alert">임시 저장에 실패했습니다. 새로고침 전에 질문을 복사하세요.</p>}
      <Action
        disabled={!value.question.trim()}
        onAction={async () => {
          setBusy(true);
          setVolatile(!saveDraft(scope, id, JSON.stringify(value)));
          try {
            await api('/reports/' + id + '/questions', value);
            update({ question: '' });
            saveDraft(scope, id, '');
            await reload();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '답변 생성 중…' : '질문 실행 / 결과 전송 재시도'}
      </Action>
      <Button onClick={() => update({})}>새 요청으로 준비</Button>
      <p>
        응답이 유실되면 같은 요청으로 재시도합니다. 실행 여부가 불확실한 요청은 자동으로 다시
        실행하지 않습니다.
      </p>
    </fieldset>
  );
}
