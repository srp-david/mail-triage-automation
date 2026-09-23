import { CircularProgress, Alert } from '@mui/material';
import { Disclosure, DisclosureTitle } from '../../components/Controls';
import { useState } from 'react';
import { activeRun, type Run, type ProgressEvent } from '../../api/types';
import { usePolling } from '../../hooks/async';
const labels: Record<string, string> = {
  analysis_started: '분석 실행 시작',
  mail_read: '메일 본문 확인',
  mail_tool: '메일 자료 조회 작업',
  db_tool: 'DB 조회 작업',
  local_tool: '분석 도구 실행',
  other_tool: '연결 도구 실행',
  result_saving: '분석 결과 저장 시작',
};
const seconds = (value: string | undefined, now: number) => {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 1000)) : null;
};
const duration = (value: number | null) =>
  value === null
    ? '시간 확인 중'
    : (value >= 3600 ? Math.floor(value / 3600) + '시간 ' : '') +
      (value >= 60 ? Math.floor((value % 3600) / 60) + '분 ' : '') +
      (value % 60) +
      '초';
const eventText = (e: ProgressEvent) =>
  (labels[e.kind] ?? '작업') +
  (e.outcome === 'failed'
    ? ' 실패'
    : ['analysis_started', 'result_saving'].includes(e.kind)
      ? ''
      : ' 완료');
export function RunProgress({ run, unavailable }: { run: Run; unavailable: boolean }) {
  const [now, setNow] = useState(Date.now);
  usePolling(() => setNow(Date.now()), 1000, activeRun(run.status));
  const active = activeRun(run.status),
    heartbeat = seconds(run.heartbeat_at, now),
    history = run.progress_events ?? [],
    last = history.at(-1),
    toolFailed = history.some((e) => e.outcome === 'failed');
  const warning = active && (toolFailed || unavailable || (heartbeat !== null && heartbeat > 90));
  return (
    <Alert
      severity={run.status === 'failed' ? 'error' : warning ? 'warning' : 'info'}
      icon={false}
      className={
        'analysis-progress' +
        (warning ? ' has-warning' : '') +
        (run.status === 'failed' ? ' has-failed' : '')
      }
      aria-label="분석 진행 상황"
    >
      <div className="analysis-progress-heading">
        <CircularProgress
          size={16}
          className="sync-spinner"
          aria-hidden="true"
          hidden={run.status !== 'running' || unavailable || (heartbeat !== null && heartbeat > 90)}
        />
        <strong>
          {run.status === 'queued' ? '분석 대기 · ' : active ? '분석 중 · ' : '분석 소요 시간 · '}
          {duration(
            seconds(
              run.started_at ?? run.created_at,
              active ? now : Date.parse(run.finished_at ?? '') || now,
            ),
          )}
        </strong>
      </div>
      <p
        className="analysis-latest"
        role="status"
        title={last ? '마지막 작업: ' + new Date(last.at).toLocaleString('ko-KR') : ''}
      >
        {last
          ? '최근 작업: ' + eventText(last)
          : run.status === 'queued'
            ? '분석 요청을 접수했습니다.'
            : run.source === 'direct'
              ? '직접 실행의 세부 작업 기록은 제공되지 않습니다.'
              : '아직 전달된 작업 기록이 없습니다.'}
      </p>
      <p className="meta" hidden={!last || !active}>
        마지막 작업 기록: {duration(seconds(last?.at, now))} 전
      </p>
      <p className="meta" hidden={!active}>
        {run.status === 'queued'
          ? '분석 순서를 기다리고 있습니다.'
          : heartbeat === null
            ? '실행 연결 확인을 기다리고 있습니다.'
            : '최근 실행 연결 확인: ' +
              duration(heartbeat) +
              ' 전' +
              (heartbeat > 90 ? ' · 응답이 늦어지고 있습니다.' : '')}
      </p>
      <p className="analysis-progress-warning" role="status" hidden={!unavailable}>
        {unavailable
          ? '상태를 갱신하지 못했습니다. 표시된 내용은 마지막 확인 기준이며 자동으로 다시 확인합니다.'
          : ''}
      </p>
      <p className="meta" hidden={!active}>
        {toolFailed
          ? '일부 작업이 실패했지만 전체 분석은 아직 진행 중입니다. 최종 결과에서 확인이 필요한 내용을 확인하세요.'
          : '작업 사이에는 새 기록이 없을 수 있습니다. 분석이 끝나면 결과가 자동으로 표시됩니다.'}
      </p>
      <Disclosure hidden={!history.length}>
        <DisclosureTitle>최근 작업 기록 · {history.length}건 (최대 20건)</DisclosureTitle>
        <ol>
          {[...history].reverse().map((e, i) => (
            <li key={e.at + e.kind + i} className={e.outcome === 'failed' ? 'event-failed' : ''}>
              <time>{new Date(e.at).toLocaleTimeString('ko-KR')}</time>
              <span>{eventText(e)}</span>
            </li>
          ))}
        </ol>
      </Disclosure>
    </Alert>
  );
}
