import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
vi.mock('../features/mailbox/MailboxPage', () => ({ MailboxPage: () => null }));
vi.mock('../features/history/History', () => ({
  HistoryList: () => null,
  HistoryDialog: () => null,
}));
vi.mock('../features/Settings', () => ({ Settings: () => <h2>환경설정</h2> }));
vi.mock('../features/UsernameAuth', () => ({
  UsernameForm: () => <button>로그인</button>,
  PasswordForm: () => <h2>비밀번호 변경</h2>,
  AdminUsers: () => null,
}));
vi.mock('../features/Updates', () => ({
  useUpdates: () => ({ state: null }),
  UpdatePanel: () => null,
  UpdateNotice: () => null,
}));
let meta: HTMLMetaElement;
beforeEach(() => {
  meta = document.createElement('meta');
  meta.name = 'triage-auth';
  meta.content = 'native';
  document.head.append(meta);
  location.hash = 'settings';
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => meta.remove());
const session = {
  authenticated: true,
  authMode: 'username',
  userId: 'synthetic',
  role: 'analyst',
  csrf: 'synthetic',
};
function mount() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <App />
    </QueryClientProvider>,
  );
}
test('restoring a saved session shows loading until status arrives, with no login form', async () => {
  let finishSession!: (r: Response) => void, finishStatus!: (r: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string) =>
        new Promise<Response>((r) => {
          if (url === '/api/session') finishSession = r;
          else finishStatus = r;
        }),
    ),
  );
  mount();
  expect(screen.getByText('로그인 상태와 화면을 불러오고 있습니다.')).toBeVisible();
  expect(document.querySelector('#login')).toBeNull();
  await waitFor(() => expect(finishSession).toBeDefined());
  await act(async () => finishSession(Response.json(session)));
  await waitFor(() => expect(finishStatus).toBeDefined());
  expect(document.querySelector('#login')).toBeNull();
  expect(screen.getByText('로그인 상태와 화면을 불러오고 있습니다.')).toBeVisible();
  await act(async () =>
    finishStatus(Response.json({ storeId: '', originalAvailable: false, sync: null })),
  );
  expect(await screen.findByRole('heading', { name: '환경설정' })).toBeVisible();
  expect(document.querySelector('#login')).toBeNull();
  expect(location.hash).toBe('#settings');
});
test('a failed session lookup shows retry instead of login, then restores the original view', async () => {
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/session'
        ? fail
          ? Response.json({}, { status: 503 })
          : Response.json(session)
        : Response.json({ storeId: '', originalAvailable: false, sync: null }),
    ),
  );
  mount();
  await screen.findByText(/화면을 불러오지 못했습니다/);
  expect(document.querySelector('#login')).toBeNull();
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: '다시 확인' }));
  expect(await screen.findByRole('heading', { name: '환경설정' })).toBeVisible();
});
test('confirmed signed-out session shows only the username login after lookup', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...session, authenticated: false })),
  );
  mount();
  expect(document.querySelector('#login')).toBeNull();
  expect(await screen.findByRole('button', { name: '로그인' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '회사 계정으로 로그인' })).not.toBeInTheDocument();
});
test('mandatory password change exits loading without showing login', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...session, mustChangePassword: true })),
  );
  mount();
  expect(await screen.findByRole('heading', { name: '비밀번호 변경' })).toBeVisible();
  expect(document.querySelector('#login')).toBeNull();
});
test('expired authentication during status lookup leads to login without staying in loading', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/session' ? Response.json(session) : Response.json({}, { status: 401 }),
    ),
  );
  mount();
  expect(await screen.findByRole('button', { name: '로그인' })).toBeVisible();
  expect(screen.queryByText('로그인 상태와 화면을 불러오고 있습니다.')).not.toBeInTheDocument();
});
