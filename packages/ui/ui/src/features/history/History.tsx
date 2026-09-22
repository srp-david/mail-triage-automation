import { Panel, Disclosure, DisclosureTitle } from '../../components/Controls';
import { Button, Chip, Dialog, Typography } from '@mui/material';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useSession } from '../../api/client';
import { date, labels, legacyTitle, type Legacy, type Run } from '../../api/types';
import { usePolling, useResource } from '../../hooks/async';
import { Action } from '../../components/Common';
import { MarkdownView } from '../../components/Documents';
import { RunReport, type ReportHandle } from '../analysis/RunReport';
export type DocumentChoice = { kind: 'run' | 'legacy'; id: string };
export interface HistoryState {
  mailId?: number;
  subject?: string;
  document?: DocumentChoice;
}
export interface ListHandle {
  refresh: () => Promise<unknown>;
}
export const HistoryList = forwardRef<
  ListHandle,
  {
    kind: 'runs' | 'legacy';
    mailId?: number;
    prefix?: string;
    open: (doc: DocumentChoice) => void;
    enabled?: boolean;
  }
>(function HistoryList({ kind, mailId, prefix = '', open, enabled = true }, ref) {
  const { api, storeId, notice } = useSession(),
    [extra, setExtra] = useState<(Run | Legacy)[]>([]),
    [moreAvailable, setMoreAvailable] = useState(false),
    life = useRef(0),
    [activated, setActivated] = useState(enabled);
  useEffect(() => {
    if (enabled) setActivated(true);
  }, [enabled]);
  const path = (offset = 0) =>
    '/' +
    kind +
    '?' +
    new URLSearchParams({
      ...(mailId ? { storeId, mailId: String(mailId) } : {}),
      offset: String(offset),
    });
  const resource = useResource(
    (s) => api<(Run | Legacy)[]>(path(), undefined, s),
    storeId + ':' + mailId + ':' + kind,
    activated,
  );
  useEffect(() => {
    if (resource.error) notice(resource.error);
  }, [resource.error, notice]);
  useEffect(() => {
    life.current += 1;
    return () => {
      life.current += 1;
    };
  }, [mailId, kind, enabled]);
  useEffect(() => {
    setExtra([]);
    setMoreAvailable((resource.data?.length ?? 0) >= 100);
  }, [resource.data]);
  useImperativeHandle(ref, () => ({ refresh: resource.refresh }));
  const listId = prefix + (kind === 'runs' ? 'runs' : 'legacy-list'),
    moreId = prefix + (kind === 'runs' ? 'more-runs' : 'legacy-more');
  usePolling(
    () => {
      const list = document.getElementById(listId);
      if (!extra.length && !list?.contains(document.activeElement)) return resource.refresh();
    },
    10000,
    enabled && kind === 'runs',
  );
  return (
    <>
      <div id={listId}>
        {resource.error ? (
          <p>
            {kind === 'runs'
              ? '이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'
              : '이전 이력을 불러오지 못했습니다. 새로고침으로 다시 시도하세요.'}
          </p>
        ) : resource.data ? (
          [...resource.data, ...extra].map((item) =>
            kind === 'runs' ? (
              <div className="run" key={item.id}>
                <Chip
                  className="badge"
                  label={
                    (item as Run).handled_at
                      ? '처리 완료'
                      : (labels[(item as Run).status] ?? (item as Run).status)
                  }
                />
                <Button onClick={() => open({ kind: 'run', id: item.id })}>
                  {(item as Run).subject} · {(item as Run).source === 'direct' ? '직접 실행' : '웹'}{' '}
                  · {date((item as Run).created_at)}
                </Button>
              </div>
            ) : (
              <div className="run" key={item.id}>
                <Chip
                  className="badge"
                  label={(item as Legacy).mail_key ? '메일 연결 확인' : '미연결 보존'}
                />
                <Button onClick={() => open({ kind: 'legacy', id: item.id })}>
                  {legacyTitle(item as Legacy)}
                </Button>
              </div>
            ),
          )
        ) : (
          <p>이력을 불러오는 중입니다…</p>
        )}
        {resource.data?.length === 0 && !resource.error && (
          <p>
            {kind === 'runs'
              ? '저장된 분석이 없습니다.'
              : mailId
                ? '이 메일과 확인 연결된 이전 문서가 없습니다.'
                : '아직 이전한 문서가 없습니다.'}
          </p>
        )}
      </div>
      <Action
        id={moreId}
        hidden={!moreAvailable || !!resource.error}
        disabled={resource.loading}
        onAction={async () => {
          const version = life.current;
          const rows = await api<(Run | Legacy)[]>(
            path((resource.data?.length ?? 0) + extra.length),
          );
          if (version !== life.current) return;
          setExtra((old) => [...old, ...rows]);
          setMoreAvailable(rows.length >= 100);
        }}
      >
        {kind === 'runs' ? '이력 더 보기' : '이전 이력 더 보기'}
      </Action>
    </>
  );
});
const LegacyDocument = forwardRef<ReportHandle, { id: string }>(function LegacyDocument(
  { id },
  ref,
) {
  const { api } = useSession(),
    resource = useResource((s) => api<Legacy>('/legacy/' + id, undefined, s), id);
  useImperativeHandle(ref, () => ({ refresh: resource.refresh }));
  const item = resource.data;
  if (!item) return <p>{resource.error || '문서를 불러오는 중입니다…'}</p>;
  return (
    <div id="legacy-document">
      <Typography component="h2" variant="h2">
        {legacyTitle(item)}
      </Typography>
      <Disclosure className="document-info">
        <DisclosureTitle>문서 정보</DisclosureTitle>
        <p className="meta">파일 경로: {item.source_path}</p>
        <p className="meta">원본 SHA-256: {item.source_hash}</p>
      </Disclosure>
      <MarkdownView value={item.body} label="이전 문서" />
    </div>
  );
});
export function HistoryDialog({
  state,
  setState,
  notice,
  onChanged,
}: {
  state: HistoryState | null;
  setState: (s: HistoryState | null) => void;
  notice: string;
  onChanged: () => Promise<unknown>;
}) {
  const listFocus = useRef<HTMLElement | null>(null),
    runs = useRef<ListHandle>(null),
    legacy = useRef<ListHandle>(null),
    report = useRef<ReportHandle>(null),
    [title, setTitle] = useState('이 메일 분석 이력');
  const isOpen = !!state;
  const documentId = state?.document?.id;
  const documentKind = state?.document?.kind;
  const mailId = state?.mailId;
  useEffect(() => {
    document.body.classList.toggle('history-open', isOpen);
    return () => document.body.classList.remove('history-open');
  }, [isOpen]);
  useLayoutEffect(() => {
    if (!isOpen) return;
    setTitle(
      documentKind === 'legacy' ? '이전 문서' : documentKind ? '분석 보고서' : '이 메일 분석 이력',
    );
    document.getElementById('history-body')?.scrollTo(0, 0);
    if (documentKind) document.getElementById('report')?.focus({ preventScroll: true });
  }, [isOpen, documentId, documentKind, mailId]);
  function open(document: DocumentChoice) {
    listFocus.current = window.document.activeElement as HTMLElement;
    setState({ ...state, document });
  }
  async function changed() {
    await onChanged();
    await Promise.all([runs.current?.refresh(), legacy.current?.refresh()]);
  }
  return (
    <Dialog
      sx={{ display: state ? undefined : 'none' }}
      open={!!state}
      keepMounted
      onClose={() => setState(null)}
      aria-labelledby="history-title"
      aria-describedby="history-subtitle"
      slotProps={{
        paper: {
          id: 'history-dialog',
          className: 'history-dialog',
          sx: {
            height: '88dvh',
            maxHeight: '94dvh',
            m: 2,
            '@media(max-width:600px)': {
              m: 0,
              width: '100%',
              maxWidth: '100%',
              height: '100dvh',
              maxHeight: '100dvh',
              borderRadius: 0,
            },
          },
        },
      }}
    >
      <div className="history-head">
        <div>
          <Typography component="h2" variant="h2" id="history-title">
            {title}
          </Typography>
          <p id="history-subtitle">{state?.subject}</p>
        </div>
        <Button id="history-close" autoFocus onClick={() => setState(null)}>
          닫기
        </Button>
      </div>
      <div className="history-tools">
        <Button
          id="history-back"
          hidden={!state?.document || !state.mailId}
          onClick={() => {
            setState({ ...state, document: undefined });
            queueMicrotask(
              () =>
                listFocus.current?.isConnected && listFocus.current.focus({ preventScroll: true }),
            );
          }}
        >
          이력 목록으로
        </Button>
        <Action
          id="history-refresh"
          onAction={() =>
            state?.document
              ? report.current?.refresh()
              : Promise.all([runs.current?.refresh(), legacy.current?.refresh()])
          }
        >
          새로고침
        </Action>
        <p id="history-notice" role="status">
          {state ? notice : ''}
        </p>
      </div>
      <div id="history-body" className="history-body">
        {state && (
          <>
            <div id="mail-history-lists" hidden={!!state.document || !state.mailId}>
              {state.mailId && (
                <>
                  <Panel>
                    <Typography component="h3" variant="h3">
                      분석 이력
                    </Typography>
                    <HistoryList
                      ref={runs}
                      kind="runs"
                      mailId={state.mailId}
                      prefix="mail-"
                      open={open}
                      enabled={!state.document}
                    />
                  </Panel>
                  <Panel>
                    <Typography component="h3" variant="h3">
                      연결된 이전 이력
                    </Typography>
                    <HistoryList
                      ref={legacy}
                      kind="legacy"
                      mailId={state.mailId}
                      prefix="mail-"
                      open={open}
                      enabled={!state.document}
                    />
                    <p className="meta">
                      메일 연결이 확인된 기존 문서만 표시합니다. 미연결 문서는 이전 이력 메뉴에서
                      확인하세요.
                    </p>
                  </Panel>
                </>
              )}
            </div>
            <Panel id="report" tabIndex={-1} hidden={!state.document}>
              {state.document?.kind === 'run' ? (
                <RunReport
                  key={state.document.id}
                  id={state.document.id}
                  ref={report}
                  onTitle={setTitle}
                  onChanged={changed}
                  onAnalysis={(run) => {
                    setState({
                      mailId: Number(run.mail_id),
                      subject: run.subject,
                      document: { kind: 'run', id: run.id },
                    });
                    void onChanged();
                  }}
                />
              ) : (
                state.document && (
                  <LegacyDocument key={state.document.id} id={state.document.id} ref={report} />
                )
              )}
            </Panel>
          </>
        )}
      </div>
    </Dialog>
  );
}
