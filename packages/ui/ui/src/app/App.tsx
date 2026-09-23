import { Field, Panel, Disclosure, DisclosureTitle } from '../components/Controls';
import { Alert, AppBar, Box, Button, Chip, Snackbar, Toolbar, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createApi, errorText, SessionContext } from '../api/client';
import { activeSync, type Status, type Sync } from '../api/types';
import { useLatest, usePolling } from '../hooks/async';
import { MailboxPage, type MailboxHandle } from '../features/mailbox/MailboxPage';
import {
  HistoryDialog,
  HistoryList,
  type HistoryState,
  type ListHandle,
} from '../features/history/History';
import { Action } from '../components/Common';
import { UsernameForm, PasswordForm, AdminUsers } from '../features/UsernameAuth';
import { Settings } from '../features/Settings';
import { useQueryClient } from '@tanstack/react-query';
import { clearDrafts } from '../../../../../public/answer-drafts.js';
import { closeOfficePreview } from '../components/PreviewDialog';
const viewFromHash = () =>
  ['mailbox', 'history', 'legacy', 'settings', 'admin'].includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : 'mailbox';
const revision = (sync: Sync | null) =>
  !sync || (activeSync(sync) && !sync.saved)
    ? null
    : JSON.stringify([
        sync.id,
        activeSync(sync) ? 'active' : sync.status,
        sync.saved,
        sync.batch_count ?? 0,
        sync.finished_at,
      ]);
export function App() {
  const queryClient = useQueryClient();
  const native =
    document.querySelector('meta[name="triage-auth"]')?.getAttribute('content') === 'native';
  const [userId, setUserId] = useState('');
  const csrf = useRef('');
  const [authMode, setAuthMode] = useState('legacy'),
    [mustChange, setMustChange] = useState(false),
    [role, setRole] = useState('');
  const [authenticated, setAuthenticated] = useState(false),
    [status, setStatus] = useState<Status | null>(null),
    [notice, setNotice] = useState(''),
    [token, setToken] = useState(''),
    [view, setView] = useState(viewFromHash),
    [menu, setMenu] = useState(false),
    [history, setHistory] = useState<HistoryState | null>(null);
  const [updateOffer, setUpdateOffer] = useState<{
    releaseId: string;
    version: string;
    assetSha256: string;
    releaseNotesUrl: string;
  } | null>(null);
  const mailbox = useRef<MailboxHandle>(null),
    runs = useRef<ListHandle>(null),
    legacy = useRef<ListHandle>(null),
    lastSync = useRef<string | null>(null),
    refreshing = useRef<Promise<void> | null>(null),
    authEpoch = useRef(0);
  const unauthorized = useCallback(() => {
    authEpoch.current += 1;
    queryClient.clear();
    setAuthenticated(false);
    setRole('');
    setHistory(null);
    closeOfficePreview();
  }, [queryClient]);
  const api = useMemo(() => createApi(unauthorized, () => csrf.current), [unauthorized]);
  useEffect(() => {
    if (!native || !authenticated) {
      queueMicrotask(() => setUpdateOffer(null));
      return;
    }
    let alive = true;
    const check = async () => {
      try {
        const response = await api<{
          status: string;
          update?: {
            releaseId: string;
            version: string;
            assetSha256: string;
            releaseNotesUrl: string;
          };
        }>('/updates');
        if (alive) setUpdateOffer(response.status === 'offered' ? (response.update ?? null) : null);
      } catch {
        if (alive) setUpdateOffer(null);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 60 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [native, authenticated, api]);
  const notify = useCallback((text: string) => setNotice(text), []);
  const session = useMemo(
    () => ({ api, storeId: status?.storeId ?? '', userId, notice: notify, unauthorized }),
    [api, status?.storeId, userId, notify, unauthorized],
  );
  async function refreshAfterSync(sync: Sync | null) {
    const next = revision(sync);
    if (!next) return false;
    while (refreshing.current) await refreshing.current;
    if (next === lastSync.current) return false;
    const version = authEpoch.current;
    refreshing.current = (async () => {
      try {
        await mailbox.current?.reload(!activeSync(sync));
        if (version !== authEpoch.current) return;
        lastSync.current = next;
        if (!activeSync(sync)) {
          const outcome =
            sync!.status === 'completed'
              ? '동기화가 완료되었습니다.'
              : sync!.status === 'paused'
                ? '동기화를 일시 중지했습니다.'
                : sync!.status === 'partial'
                  ? '동기화가 일부 미완료되었습니다.'
                  : '동기화가 실패했습니다.';
          setNotice(outcome + ' 현재 저장된 메일로 목록을 갱신했습니다.');
        }
      } catch (e) {
        throw Error(
          '동기화 후 목록을 갱신하지 못했습니다. 다음 상태 확인 때 다시 시도합니다. ' +
            errorText(e),
          { cause: e },
        );
      }
    })();
    try {
      await refreshing.current;
      return true;
    } finally {
      refreshing.current = null;
    }
  }
  async function pollStatus() {
    const version = authEpoch.current;
    const value = await api<Status>('/status');
    if (version !== authEpoch.current) return;
    setStatus(value);
    if (!(await refreshAfterSync(value.sync)) && view === 'mailbox')
      await mailbox.current?.summaries();
  }
  usePolling(
    async () => {
      if (native && document.visibilityState !== 'visible') return;
      try {
        if (native) {
          const r = await fetch('/api/session');
          const info = await r.json();
          if (!r.ok || !info.authenticated) {
            unauthorized();
            return;
          }
          setRole(info.role ?? '');
        }
        await pollStatus();
      } catch (e) {
        setNotice(errorText(e));
      }
    },
    native ? 60000 : 10000,
    authenticated,
  );
  async function boot() {
    const version = authEpoch.current;
    try {
      if (native) {
        const response = await fetch('/api/session', { credentials: 'same-origin' });
        const info = await response.json();
        if (!response.ok) throw Error(info.message ?? '로그인 상태를 확인하지 못했습니다.');
        setUserId(info.userId ?? '');
        csrf.current = info.csrf;
        setAuthMode(info.authMode ?? 'legacy');
        setRole(info.role ?? '');
        setMustChange(!!info.mustChangePassword);
        if (info.authenticated && info.mustChangePassword) {
          setAuthenticated(false);
          setStatus(null);
          return;
        }
        if (!info.authenticated) {
          setAuthenticated(false);
          return;
        }
      }
      const value = await api<Status>('/status');
      if (version !== authEpoch.current) return;
      lastSync.current = revision(value.sync);
      setStatus(value);
      setAuthenticated(true);
      setNotice('');
      if (native && !value.storeId) location.hash = 'settings';
    } catch (e) {
      setNotice(errorText(e));
    }
  }
  const bootRef = useLatest(boot);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (alive) void bootRef.current();
    });
    return () => {
      alive = false;
      authEpoch.current += 1;
    };
  }, [bootRef]);
  useEffect(() => {
    const navigate = () => {
      setView(viewFromHash());
      setMenu(false);
      setHistory(null);
      closeOfficePreview();
      setNotice('');
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    const narrow = matchMedia('(max-width:900px)'),
      close = () => setMenu(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        if (menu) document.getElementById('menu-toggle')?.focus();
      }
    };
    const outside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('#workspace-nav,#menu-toggle')) setMenu(false);
    };
    narrow.addEventListener('change', close);
    document.addEventListener('keydown', escape);
    document.addEventListener('click', outside);
    return () => {
      narrow.removeEventListener('change', close);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('click', outside);
    };
  }, [menu]);
  const changed = async () => {
    await Promise.all([mailbox.current?.analysisChanged(), runs.current?.refresh()]);
  };
  return (
    <SessionContext.Provider value={session}>
      <AppBar component="header" position="static" elevation={0}>
        <Toolbar
          variant="dense"
          sx={{ minHeight: 56, gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', py: 1 }}
        >
          <Typography component="h1" variant="h1">
            메일 분석실
          </Typography>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto', maxWidth: '100%' }}
          >
            <Chip
              id="connection"
              variant="outlined"
              sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,.4)', minWidth: 0 }}
              label={
                status
                  ? status.worker?.online && status.worker.state !== 'stopped'
                    ? '분석 Worker 연결됨'
                    : status.originalAvailable === false
                      ? '공용 이력 연결 · 원본 미연결'
                      : '메일 조회 가능 · 분석 Worker 미연결'
                  : '연결 확인 중'
              }
            />
            {native && authenticated && updateOffer && (
              <>
                <Button
                  component="a"
                  href={updateOffer.releaseNotesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="inherit"
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  변경 내역
                </Button>
                <Action
                  variant="outlined"
                  color="inherit"
                  sx={{ whiteSpace: 'nowrap' }}
                  onAction={async () => {
                    notify('업데이트 파일을 확인하고 진행 중인 작업이 끝나기를 기다립니다.');
                    await api('/updates/install', {
                      releaseId: updateOffer.releaseId,
                      assetSha256: updateOffer.assetSha256,
                    });
                    notify('업데이트를 설치합니다. 실행 중인 작업이 끝나면 앱이 다시 열립니다.');
                  }}
                >
                  {updateOffer.version} 설치
                </Action>
              </>
            )}
            {native && (authenticated || mustChange) && (
              <Action
                variant="text"
                color="inherit"
                sx={{ whiteSpace: 'nowrap' }}
                onAction={async () => {
                  await api('/logout', {});
                  clearDrafts();
                  unauthorized();
                  setStatus(null);
                  setMenu(false);
                  await boot();
                }}
              >
                로그아웃
              </Action>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      <main>
        {native && mustChange && (
          <>
            <PasswordForm
              changed={async () => {
                clearDrafts();
                unauthorized();
                await boot();
              }}
            />
          </>
        )}
        <Panel id="login" hidden={authenticated || mustChange}>
          <Typography component="h2" variant="h2">
            분석실 연결
          </Typography>
          {native && authMode === 'username' ? (
            <UsernameForm
              csrf={() => csrf.current}
              notice={notify}
              changed={async () => {
                clearDrafts();
                queryClient.clear();
                setHistory(null);
                await boot();
              }}
            />
          ) : native ? (
            <>
              <p>회사 계정으로 로그인하면 접근 권한이 있는 이력을 조회할 수 있습니다.</p>
              <Action
                onAction={async () => {
                  await boot();
                  const response = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.current },
                    body: '{}',
                  });
                  const result = await response.json();
                  if (!response.ok) throw Error(result.message ?? '로그인을 시작하지 못했습니다.');
                  location.assign(result.url);
                }}
              >
                회사 계정으로 로그인
              </Action>
            </>
          ) : (
            <>
              <p>프로젝트 .env의 TRIAGE_TOKEN을 입력하세요. 현재 브라우저에서만 로그인됩니다.</p>
              <form
                id="login-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const button = e.currentTarget.querySelector('button')!;
                  if (button.disabled) return;
                  button.disabled = true;
                  void api('/login', { token })
                    .then(() => {
                      setToken('');
                      return boot();
                    })
                    .catch((e) => setNotice(errorText(e)))
                    .finally(() => (button.disabled = false));
                }}
              >
                <Field
                  type="password"
                  id="token"
                  autoComplete="current-password"
                  required
                  aria-label="접속 토큰"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <Button type="submit" variant="contained">
                  연결
                </Button>
              </form>
            </>
          )}
        </Panel>
        <div id="workspace" hidden={!authenticated} className={menu ? 'menu-open' : ''}>
          <Button
            id="menu-toggle"
            type="button"
            className="secondary-button"
            aria-controls="workspace-nav"
            aria-expanded={menu}
            onClick={() => {
              setMenu(!menu);
              if (!menu)
                queueMicrotask(() =>
                  document
                    .querySelector<HTMLElement>('#workspace-nav [aria-current="page"]')
                    ?.focus(),
                );
            }}
          >
            메뉴
          </Button>
          <nav id="workspace-nav" className="workspace-nav" aria-label="주 메뉴">
            {[
              ['mailbox', '메일함'],
              ['history', '분석 이력'],
              ['legacy', '이전 이력'],
              ...(native && role === 'admin' ? [['admin', '관리자']] : []),
              ...(native ? [['settings', '설정']] : []),
            ].map(([key, label]) => (
              <Button
                component="a"
                variant={view === key ? 'contained' : 'text'}
                key={key}
                href={'#' + key}
                data-view={key}
                aria-current={view === key ? 'page' : undefined}
                onClick={() => setMenu(false)}
              >
                {label}
              </Button>
            ))}
            <Button
              component="a"
              href={import.meta.env.VITE_DOCS_URL || 'http://127.0.0.1:3000/'}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="기술 문서 (새 탭)"
              onClick={() => setMenu(false)}
            >
              기술 문서 ↗
            </Button>
          </nav>
          {native && authenticated && view === 'admin' && role === 'admin' && (
            <AdminUsers key={userId} />
          )}
          {native && authenticated && view === 'settings' && (
            <div id="view-settings">
              <Settings
                changed={async () => {
                  queryClient.clear();
                  setHistory(null);
                  await boot();
                }}
              />
              {authMode === 'username' && (
                <Disclosure className="settings-account">
                  <DisclosureTitle>계정 · 비밀번호 변경</DisclosureTitle>
                  <PasswordForm
                    changed={async () => {
                      clearDrafts();
                      unauthorized();
                      await boot();
                    }}
                  />
                </Disclosure>
              )}
            </div>
          )}
          {native && authenticated && view === 'mailbox' && status?.originalAvailable === false && (
            <p>
              이 PC에 원본 연결이 없습니다. 설정에서 출처를 선택하거나 분석 이력에서 공유 보고서를
              확인하세요.
            </p>
          )}
          {status && (
            <>
              <MailboxPage
                ref={mailbox}
                enabled={authenticated && status.originalAvailable !== false && !!status.storeId}
                visible={view === 'mailbox' && status.originalAvailable !== false}
                sync={status?.sync ?? null}
                onSelect={() => {
                  setHistory(null);
                  closeOfficePreview();
                  setNotice('');
                }}
                onHistory={(mailId, subject) => {
                  setNotice('');
                  setHistory({ mailId, subject });
                }}
                onAnalysis={(id, mailId, subject) => {
                  setNotice('');
                  setHistory({ mailId, subject, document: { kind: 'run', id } });
                }}
                startSync={async () => {
                  await api('/sync', {});
                  setNotice('동기화를 시작했습니다.');
                  await pollStatus();
                }}
                stopSync={async () => {
                  if (!activeSync(status?.sync)) return;
                  await api('/sync/' + status!.sync!.id + '/stop', {});
                  setNotice('현재 묶음 처리가 끝나면 동기화를 중지합니다.');
                  await pollStatus();
                }}
              />
              <Panel id="view-history" hidden={view !== 'history'}>
                <div className="section-head">
                  <Typography component="h2" variant="h2">
                    공용 분석 이력
                  </Typography>
                  <Action id="refresh" onAction={() => runs.current?.refresh()}>
                    새로고침
                  </Action>
                </div>
                <p>
                  직접 스킬과 웹에서 실행한 분석을 함께 표시합니다. 분석 완료는 고객 문의 해결과
                  별개입니다.
                </p>
                {authenticated && (
                  <HistoryList
                    kind="runs"
                    ref={runs}
                    enabled={view === 'history' && !history}
                    open={(document) => {
                      setNotice('');
                      setHistory({ document });
                    }}
                  />
                )}
              </Panel>
              <Panel id="view-legacy" hidden={view !== 'legacy'}>
                <div className="section-head">
                  <Typography component="h2" variant="h2">
                    이전 이력
                  </Typography>
                  <Action id="legacy-refresh" onAction={() => legacy.current?.refresh()}>
                    기존 문서 조회
                  </Action>
                </div>
                <p>
                  기존 보고서와 처리 로그의 보존 사본입니다. 확인되지 않은 메일 연결과 업무 상태는
                  추정하지 않습니다.
                </p>
                {authenticated && (
                  <HistoryList
                    kind="legacy"
                    ref={legacy}
                    enabled={view === 'legacy'}
                    open={(document) => {
                      setNotice('');
                      setHistory({ document });
                    }}
                  />
                )}
              </Panel>
            </>
          )}
        </div>
        <Snackbar
          open={!!notice && !history}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          sx={{ top: { xs: 72, sm: 80 } }}
        >
          <Alert
            id="notice"
            role="status"
            severity="info"
            variant="filled"
            onClose={() => setNotice('')}
          >
            {notice}
          </Alert>
        </Snackbar>
      </main>
      <footer>메일·DB 조회 기반 분석 · 웹에서는 Claude 2차 리뷰를 실행하지 않습니다.</footer>
      <HistoryDialog
        state={history}
        setState={(value) => {
          setHistory(value);
          setNotice('');
        }}
        notice={notice}
        onChanged={changed}
      />
    </SessionContext.Provider>
  );
}
