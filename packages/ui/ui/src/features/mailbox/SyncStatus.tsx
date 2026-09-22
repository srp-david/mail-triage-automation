import { CircularProgress } from '@mui/material';
import { Disclosure, DisclosureTitle } from '../../components/Controls';
import { activeSync, date, type Sync } from '../../api/types';
import { Action } from '../../components/Common';
const states: Record<string, string> = {
  running: '진행 중',
  retrying: '재시도 대기',
  stopping: '현재 묶음 종료 후 중지',
  paused: '일시 중지',
  completed: '완료',
  partial: '일부 미완료',
  failed: '실패',
};
export function SyncStatus({
  sync,
  start,
  stop,
}: {
  sync: Sync | null;
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
}) {
  const active = activeSync(sync),
    detail = sync?.detail;
  let counts = '이번 실행 저장 ' + (sync?.saved ?? 0) + '건';
  if (detail?.serverCount && Number.isFinite(detail.serverStored) && detail.serverStored! >= 0) {
    const stored = Math.min(detail.serverStored!, detail.serverCount);
    counts = `서버 메일 ${stored.toLocaleString('ko-KR')} / ${detail.serverCount.toLocaleString('ko-KR')}건 (${Math.floor((stored / detail.serverCount) * 100)}%)`;
  }
  const reasons: Record<string, string> = {
    interrupted: '서버 재시작으로 중지되었습니다. 이어서 동기화하면 저장된 메일은 건너뜁니다.',
    retry_exhausted: '자동 재시도 3회를 마쳤습니다. 연결 상태를 확인한 뒤 이어서 동기화하세요.',
    no_progress: '새로 저장된 메일 없이 남은 메일이 있어 중지했습니다.',
    invalid_response: '수집 결과를 확인할 수 없어 중지했습니다.',
    error: '수집 오류가 있어 중지했습니다. 연결·메일 서버·저장 공간을 확인하세요.',
  };
  let message =
    sync?.status === 'stopping'
      ? '현재 처리 중인 최대 100개 묶음이 끝나면 중지합니다.'
      : sync?.status === 'retrying'
        ? `일시적인 연결 오류로 ${sync.retry_count}/3회 재시도를 기다립니다. ${date(sync.next_attempt_at)}`
        : (reasons[detail?.reason ?? ''] ??
          (sync?.status === 'paused'
            ? '저장된 메일은 유지됩니다. 이어서 동기화하면 미수집 메일부터 받습니다.'
            : '100개씩 순서대로 수집합니다. 수집 중에도 메일 조회·분석이 가능합니다.'));
  if (sync?.uncertain)
    message += ' 응답이 끊긴 묶음의 저장 건수는 이번 실행 집계에서 빠질 수 있습니다.';
  if (sync?.failed)
    message += ' 실패 시도는 누적 횟수이며 남음에는 해당 묶음의 실패 메일이 포함되지 않습니다.';
  return (
    <>
      <div className="toolbar-footer">
        <Action id="sync" disabled={active} onAction={start}>
          {sync && ['paused', 'partial', 'failed'].includes(sync.status)
            ? '이어서 동기화'
            : '메일 동기화'}
        </Action>
        <Action
          id="sync-stop"
          hidden={!active}
          disabled={sync?.status === 'stopping'}
          onAction={stop}
        >
          {sync?.status === 'stopping' ? '중지 요청됨' : '중지'}
        </Action>
        <span
          id="sync-progress"
          role="status"
          hidden={!active}
          className={sync?.status === 'retrying' ? 'is-waiting' : ''}
        >
          <CircularProgress size={16} className="sync-spinner" aria-hidden="true" />
          <span id="sync-progress-text">
            {active ? '동기화 ' + states[sync!.status] + ' · ' + counts : ''}
          </span>
        </span>
        <p id="sync-status" role="status" hidden={active}>
          {sync
            ? `동기화 ${states[sync.status] ?? sync.status} · 이번 실행 저장 ${sync.saved}건 · 실패 시도 ${sync.failed}건 · 남음 ${sync.remaining ?? '미확인'} · ${sync.batch_count ?? 0}묶음 · ${date(sync.finished_at ?? sync.started_at)}`
            : '아직 동기화 기록이 없습니다.'}
        </p>
        <Disclosure className="search-help">
          <DisclosureTitle>검색 안내</DisclosureTitle>
          <p id="analysis-filter-help" className="meta">
            분석 상태는 최근 실행 기준입니다. 미분석은 분석·이전 이력이 없는 메일이며, 처리 완료는
            별도 상태입니다.
          </p>
        </Disclosure>
      </div>
      <p
        id="sync-message"
        className="meta"
        hidden={!sync || (sync.status === 'completed' && !sync.uncertain && !sync.failed)}
      >
        {message}
      </p>
    </>
  );
}
