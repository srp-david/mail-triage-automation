import { useState } from 'react';
import { Button, MenuItem, TextField } from '@mui/material';
import { useSession } from '../../api/client';
import { useResource } from '../../hooks/async';
import { Action } from '../../components/Common';
import { MarkdownView } from '../../components/Documents';
import { TextArea } from '../../components/Controls';
import { date } from '../../api/types';
import { ReportQuestion } from './ReportQuestion';
import { readDraft, saveDraft } from '../../../../../../public/answer-drafts.js';

type Snapshot = {
  version: number;
  report: string;
  canEdit: boolean;
  revisions: { version: number; changeNote: string; createdAt: string }[];
  messages: {
    id: string;
    kind: string;
    body: string;
    evidence: string;
    author: string;
    createdAt: string;
  }[];
};
type Draft = {
  expectedVersion: number;
  report: string;
  changeNote: string;
  evidence: string;
  requestId: string;
};
const kinds = {
  question: '질문',
  note: '추가 조사·메모',
  decision: '결정',
  unresolved: '미확정 사항',
  reply_draft: '회신 초안',
  answer: 'AI 답변',
};
function Editor({
  id,
  snapshot,
  reload,
}: {
  id: string;
  snapshot: Snapshot;
  reload: () => Promise<unknown>;
}) {
  const { api, userId, storeId } = useSession();
  const scope = JSON.stringify([userId, storeId, 'report-revision']);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const value = JSON.parse(readDraft(scope, id));
      if (
        typeof value.report === 'string' &&
        Number.isInteger(value.expectedVersion) &&
        typeof value.requestId === 'string'
      )
        return value;
    } catch {
      /* New draft. */
    }
    return {
      expectedVersion: snapshot.version,
      report: snapshot.report,
      changeNote: '',
      evidence: '',
      requestId: crypto.randomUUID(),
    };
  });
  const [volatile, setVolatile] = useState(false),
    [busy, setBusy] = useState(false);
  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch, requestId: crypto.randomUUID() };
    setDraft(next);
    setVolatile(!saveDraft(scope, id, JSON.stringify(next)));
  };
  const stale = draft.expectedVersion !== snapshot.version;
  return (
    <fieldset aria-label="보고서 편집" disabled={busy}>
      <h4>보고서 편집 · 기준 v{draft.expectedVersion}</h4>
      {stale && (
        <p role="alert">
          최신 버전은 v{snapshot.version}입니다. 초안은 보존했습니다. 최신 보고서와 비교한 후 다시
          반영하세요.
        </p>
      )}
      <TextArea
        aria-label="보고서 초안"
        value={draft.report}
        maxLength={500000}
        onChange={(e) => update({ report: e.target.value })}
      />
      <TextField
        label="변경 내용"
        value={draft.changeNote}
        onChange={(e) => update({ changeNote: e.target.value })}
      />
      <TextField
        label="변경 근거"
        multiline
        value={draft.evidence}
        onChange={(e) => update({ evidence: e.target.value })}
      />
      <p>
        {volatile
          ? '임시 저장에 실패했습니다. 새로고침 전에 초안을 복사하세요.'
          : '초안은 이 탭에서 보관하며 충돌이 발생해도 유지됩니다.'}
      </p>
      {stale && (
        <Button onClick={() => update({ expectedVersion: snapshot.version })}>
          최신 v{snapshot.version}과 비교 완료 · 이 버전을 기준으로 재반영
        </Button>
      )}
      <Action
        disabled={stale || !draft.changeNote.trim()}
        onAction={async () => {
          // Persist the exact request before sending: a lost response can be retried safely.
          setVolatile(!saveDraft(scope, id, JSON.stringify(draft)));
          setBusy(true);
          try {
            const saved = await api<{ version: number }>('/reports/' + id + '/revisions', draft);
            setDraft({
              ...draft,
              expectedVersion: saved.version,
              changeNote: '',
              requestId: crypto.randomUUID(),
            });
            saveDraft(scope, id, '');
            await reload();
          } catch (error) {
            await reload();
            throw error;
          } finally {
            setBusy(false);
          }
        }}
      >
        보고서에 반영 · 새 버전 저장
      </Action>
    </fieldset>
  );
}
function MessageForm({ id, reload }: { id: string; reload: () => Promise<unknown> }) {
  const { api, userId, storeId } = useSession();
  const scope = JSON.stringify([userId, storeId, 'report-message']);
  const [value, setValue] = useState(() => {
    try {
      const draft = JSON.parse(readDraft(scope, id));
      if (typeof draft.body === 'string' && typeof draft.requestId === 'string')
        return draft as { body: string; kind: string; evidence: string; requestId: string };
    } catch {
      /* Empty. */
    }
    return { body: '', kind: 'question', evidence: '', requestId: crypto.randomUUID() };
  });
  const [volatile, setVolatile] = useState(false),
    [busy, setBusy] = useState(false);
  function update(patch: Partial<typeof value>) {
    const next = { ...value, ...patch, requestId: crypto.randomUUID() };
    setValue(next);
    setVolatile(!saveDraft(scope, id, JSON.stringify(next)));
  }
  return (
    <fieldset disabled={busy}>
      <TextField
        select
        label="대화 종류"
        value={value.kind}
        onChange={(e) => update({ kind: e.target.value })}
      >
        {Object.entries(kinds)
          .filter(([key]) => key !== 'answer')
          .map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
      </TextField>
      <TextArea
        aria-label="보고서 대화"
        value={value.body}
        maxLength={20000}
        onChange={(e) => update({ body: e.target.value })}
      />
      <TextField
        label="대화 근거"
        multiline
        value={value.evidence}
        onChange={(e) => update({ evidence: e.target.value })}
      />
      {volatile && <p role="alert">임시 저장에 실패했습니다. 새로고침 전에 내용을 복사하세요.</p>}
      <Action
        disabled={!value.body.trim()}
        onAction={async () => {
          setBusy(true);
          try {
            await api('/reports/' + id + '/messages', value);
            update({ body: '', evidence: '' });
            saveDraft(scope, id, '');
            await reload();
          } finally {
            setBusy(false);
          }
        }}
      >
        대화 저장
      </Action>
      <p>
        대화 저장은 보고서를 변경하지 않습니다. 편집 후 ‘보고서에 반영’으로 새 버전을 저장하세요.
      </p>
    </fieldset>
  );
}
export function ReportCollaboration({ id }: { id: string }) {
  const { api } = useSession();
  const resource = useResource(
    (signal) => api<Snapshot>('/reports/' + id + '/collaboration', undefined, signal),
    id,
  );
  const [editing, setEditing] = useState(false),
    [version, setVersion] = useState<number | null>(null);
  const historical = useResource(
    (signal) =>
      api<{ report: string; changeNote: string }>(
        '/reports/' + id + '/revisions/' + version,
        undefined,
        signal,
      ),
    id + ':' + version,
    version !== null,
  );
  if (!resource.data || resource.error)
    return <p role="alert">{resource.error || '보고서를 불러오는 중입니다…'}</p>;
  const snapshot = resource.data;
  return (
    <section aria-label="보고서 협업">
      <h3>보고서 v{snapshot.version}</h3>
      <Button component="a" href={'/api/reports/' + id + '/export'} target="_blank" rel="noopener">
        최신 보고서 Markdown 열기
      </Button>
      <Action onAction={resource.refresh}>최신 내용 확인</Action>
      <MarkdownView value={snapshot.report} label="최신 보고서" />
      <TextField
        select
        label="과거 버전"
        value={version ?? ''}
        onChange={(e) => setVersion(e.target.value ? Number(e.target.value) : null)}
      >
        <MenuItem value="">버전 선택</MenuItem>
        {snapshot.revisions.map((r) => (
          <MenuItem key={r.version} value={r.version}>
            v{r.version} · {r.changeNote} · {date(r.createdAt)}
          </MenuItem>
        ))}
      </TextField>
      {version !== null && (
        <section aria-label="과거 보고서">
          <h4>v{version}</h4>
          {historical.error ? (
            <p role="alert">{historical.error}</p>
          ) : (
            historical.data && <MarkdownView value={historical.data.report} label="과거 보고서" />
          )}
        </section>
      )}
      {snapshot.canEdit && (
        <>
          <Button onClick={() => setEditing(!editing)}>
            {editing ? '편집 닫기' : '보고서 편집'}
          </Button>
          {editing && <Editor id={id} snapshot={snapshot} reload={resource.refresh} />}
        </>
      )}
      <h3>대화·결정 기록</h3>
      {snapshot.messages.map((m) => (
        <article key={m.id}>
          <p>
            {kinds[m.kind as keyof typeof kinds]} · {m.author} · {date(m.createdAt)}
          </p>
          <MarkdownView value={m.body} label="대화 내용" />
          {m.evidence && <p>근거: {m.evidence}</p>}
        </article>
      ))}
      {snapshot.canEdit && <MessageForm id={id} reload={resource.refresh} />}
      {snapshot.canEdit && (
        <ReportQuestion id={id} version={snapshot.version} reload={resource.refresh} />
      )}
    </section>
  );
}
