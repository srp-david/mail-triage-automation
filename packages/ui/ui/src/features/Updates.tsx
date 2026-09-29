import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Portal,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { useRef, useState } from 'react';
import type { UpdateState } from '../../../../contracts/src/update-state';
import type { Api } from '../api/types';
import { errorText } from '../api/client';
import { usePolling, useResource } from '../hooks/async';

const active = (state?: UpdateState | null) =>
  !!state &&
  ['checking', 'downloading', 'verifying', 'waiting', 'installing'].includes(state.phase);
export function useUpdates(api: Api, enabled: boolean) {
  const resource = useResource(
    (signal) => api<UpdateState>('/updates', undefined, signal),
    'updates',
    enabled,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false);
  usePolling(() => resource.refresh(), active(resource.data) ? 1000 : 10000, enabled);
  const action = async (path: string, body: unknown = {}) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await api(path, body);
      await resource.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return {
    state: resource.data,
    error: error || resource.error,
    busy: busy || active(resource.data),
    check: () => action('/updates/check'),
    defer: () => action('/updates/defer'),
    install: () =>
      resource.data?.update
        ? action('/updates/install', {
            releaseId: resource.data.update.releaseId,
            assetSha256: resource.data.update.assetSha256,
          })
        : Promise.resolve(),
  };
}
type Model = ReturnType<typeof useUpdates>;
function message(state: UpdateState) {
  const phases: Partial<Record<UpdateState['phase'], string>> = {
    checking: '새 버전을 확인하고 있습니다.',
    downloading: '업데이트 파일을 다운로드하고 있습니다.',
    verifying: '업데이트 파일과 배포 정보를 검증하고 있습니다.',
    waiting: '진행 중인 작업이 끝나기를 기다립니다.',
    installing: '설치를 시작했습니다. 앱이 종료된 후 다시 열립니다.',
  };
  if (phases[state.phase]) return phases[state.phase];
  if (state.status === 'login_required') return '로그인 상태를 확인한 뒤 다시 시도하세요.';
  if (state.phase === 'error' || state.status === 'error') {
    if (/SIGNATURE|CHECKSUM|CATALOG|ORIGIN|SIZE/.test(state.errorCode ?? ''))
      return '업데이트 파일 또는 배포 정보를 검증하지 못했습니다. 다시 확인하거나 관리자에게 문의하세요.';
    if (state.errorCode === 'UPDATER_START_FAILED')
      return '설치 프로그램을 실행하지 못했습니다. 다시 확인한 뒤 설치를 시도하세요.';
    if (/UPDATE_CHANGED|UPDATE_NOT_OFFERED/.test(state.errorCode ?? ''))
      return '배포 정보가 변경되었습니다. 업데이트를 다시 확인하세요.';
    return '업데이트를 확인하거나 다운로드하지 못했습니다. 네트워크 연결을 확인하고 다시 시도하세요.';
  }
  return {
    unknown: '아직 업데이트를 확인하지 않았습니다.',
    current: '최신 버전을 사용하고 있습니다.',
    offered: `새 버전 ${state.update?.version ?? ''}을 설치할 수 있습니다.`,
    unavailable: '현재 설치 가능한 업데이트 정보가 없습니다.',
    channel_denied: '이 계정에는 시험 버전 업데이트가 허용되지 않습니다.',
    error: '업데이트를 확인하지 못했습니다.',
    login_required: '로그인이 필요합니다.',
  }[state.status];
}
export function UpdatePanel({ model }: { model: Model }) {
  const s = model.state,
    offered = s?.status === 'offered' && s.phase === 'idle';
  return (
    <Stack spacing={2} sx={{ py: 2 }} aria-label="앱 업데이트">
      <Typography variant="h3">앱 업데이트</Typography>
      <Typography>현재 버전: {s?.currentVersion ?? '확인 중'}</Typography>
      <Typography variant="body2" color="text.secondary">
        앱이 실행 중이면 브라우저를 닫아도 1시간마다 확인합니다. 설치는 직접 선택할 때 진행합니다.
      </Typography>
      <Alert
        severity={s?.phase === 'error' ? 'error' : s?.status === 'current' ? 'success' : 'info'}
        role="status"
      >
        {s ? message(s) : '업데이트 상태를 불러오는 중입니다.'}
      </Alert>
      {model.error && (
        <Alert severity="error">
          {s?.phase === 'installing'
            ? '앱이 재시작 중입니다. 다시 실행된 화면에서 설치 버전을 확인하세요.'
            : model.error}
        </Alert>
      )}
      {s?.phase === 'downloading' && (
        <Box>
          <LinearProgress
            aria-label="업데이트 다운로드"
            variant={s.totalBytes ? 'determinate' : 'indeterminate'}
            value={
              s.totalBytes ? Math.min(100, (100 * (s.downloadedBytes ?? 0)) / s.totalBytes) : 0
            }
          />
          <Typography variant="body2">
            {s.totalBytes
              ? `${Math.floor((100 * (s.downloadedBytes ?? 0)) / s.totalBytes)}% 다운로드됨`
              : '다운로드 준비 중'}
          </Typography>
        </Box>
      )}
      {s?.lastCheckedAt && (
        <Typography variant="body2" color="text.secondary">
          마지막 확인: {new Date(s.lastCheckedAt).toLocaleString()}
        </Typography>
      )}
      {s?.deferred && offered && (
        <Typography variant="body2">
          업데이트를 미뤘습니다. 이 화면에서 언제든 설치할 수 있습니다. 알림은 앱을 다시 실행하거나
          수동 확인할 때 다시 표시됩니다.
        </Typography>
      )}
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="outlined" disabled={model.busy} onClick={() => void model.check()}>
          업데이트 확인
        </Button>
        {s?.update && (
          <Button
            component="a"
            href={s.update.releaseNotesUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            변경 내역
          </Button>
        )}
        {offered && (
          <Button variant="contained" disabled={model.busy} onClick={() => void model.install()}>
            지금 설치
          </Button>
        )}
        {offered && !s.deferred && (
          <Button disabled={model.busy} onClick={() => void model.defer()}>
            나중에
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
export function UpdateNotice({ model }: { model: Model }) {
  const s = model.state;
  if (!s || s.deferred || s.status !== 'offered' || s.phase !== 'idle') return null;
  return (
    <Portal>
      <Snackbar
        open
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{
          width: 420,
          maxWidth: 'calc(100% - 48px)',
          '@media (max-width: 599px)': { maxWidth: 'calc(100% - 16px)' },
        }}
      >
        <Alert severity="info" sx={{ width: '100%', alignItems: 'flex-start' }}>
          <Stack spacing={1}>
            <Typography>새 버전 {s.update?.version}을 사용할 수 있습니다.</Typography>
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button component="a" href="#updates" size="small">
                업데이트 보기
              </Button>
              <Button size="small" disabled={model.busy} onClick={() => void model.defer()}>
                나중에
              </Button>
            </Stack>
          </Stack>
        </Alert>
      </Snackbar>
    </Portal>
  );
}
