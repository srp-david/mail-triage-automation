import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { UsernameForm, PasswordForm, AdminUsers } from './UsernameAuth';
import { Settings } from './Settings';
import { createApi, SessionContext } from '../api/client';
import type { Api } from '../api/types';
import { passwordSchema } from '../forms/schemas';

test('login validates before sending and submits the registered values once', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const changed = vi.fn(),
    notice = vi.fn();
  const { container } = render(
    <UsernameForm csrf={() => 'synthetic-csrf'} changed={changed} notice={notice} />,
  );
  const submit = screen.getByRole('button', { name: '로그인' });
  await userEvent.click(submit);
  expect(await screen.findAllByRole('alert')).toHaveLength(2);
  expect(fetcher).not.toHaveBeenCalled();
  const inputs = container.querySelectorAll('input');
  await userEvent.type(inputs[0], 'test.user');
  await userEvent.type(inputs[1], 'test-password');
  fireEvent.submit(container.querySelector('form')!);
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledWith(
    '/auth/login',
    expect.objectContaining({
      body: JSON.stringify({ username: 'test.user', password: 'test-password' }),
    }),
  );
  expect(submit).toBeDisabled();
  await act(async () => finish(new Response('{}', { status: 200 })));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(inputs[1]).toHaveValue('');
  expect(inputs[0]).toHaveValue('test.user');
});

test('IME confirmation never submits; rejected login clears only the password', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  const notice = vi.fn();
  const { container } = render(
    <UsernameForm csrf={() => 'synthetic'} changed={vi.fn()} notice={notice} />,
  );
  const input = screen.getByLabelText(/^사용자명/);
  await userEvent.type(input, 'test.user');
  await userEvent.type(screen.getByLabelText(/^비밀번호/), 'bad-password');
  fireEvent.compositionStart(input);
  expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })).toBe(false);
  fireEvent.submit(container.querySelector('form')!);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  await userEvent.click(screen.getByRole('button', { name: '로그인' }));
  await waitFor(() => expect(notice).toHaveBeenCalled());
  expect(screen.getByLabelText(/^비밀번호/)).toHaveValue('');
  expect(input).toHaveValue('test.user');
});

test('password policy enforces UTF-8 byte limits and never trims secrets', () => {
  expect(
    passwordSchema.safeParse({ currentPassword: 'old', newPassword: 'a'.repeat(11) }).success,
  ).toBe(false);
  expect(
    passwordSchema.safeParse({ currentPassword: 'old', newPassword: '가'.repeat(43) }).success,
  ).toBe(false);
  const result = passwordSchema.parse({ currentPassword: ' old ', newPassword: ' '.repeat(12) });
  expect(result.currentPassword).toBe(' old ');
  expect(result.newPassword).toBe(' '.repeat(12));
});

test('invalid password stays local, successful change clears both secret fields', async () => {
  const api = vi.fn().mockResolvedValue({}),
    changed = vi.fn();
  const { container } = render(
    <SessionContext.Provider value={{ api, notice: vi.fn(), storeId: '', unauthorized: vi.fn() }}>
      <PasswordForm changed={changed} />
    </SessionContext.Provider>,
  );
  const current = screen.getByLabelText(/^현재 비밀번호/),
    next = screen.getByLabelText(/^새 비밀번호/);
  await userEvent.type(current, 'old-password');
  await userEvent.type(next, 'short');
  await userEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('12자');
  expect(api).not.toHaveBeenCalled();
  await userEvent.clear(next);
  await userEvent.type(next, 'new-password-123');
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(current).toHaveValue('');
  expect(next).toHaveValue('');
});

test('wrong current password stays visible and allows a successful retry without logout', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ code: 'CURRENT_PASSWORD_INCORRECT' }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ ok: true, loginRequired: true }));
  vi.stubGlobal('fetch', fetcher);
  const unauthorized = vi.fn(),
    changed = vi.fn();
  const { container } = render(
    <SessionContext.Provider
      value={{ api: createApi(unauthorized), notice: vi.fn(), storeId: '', unauthorized }}
    >
      <PasswordForm changed={changed} required />
    </SessionContext.Provider>,
  );
  expect(screen.getByText(/발급받은 임시 비밀번호/)).toBeVisible();
  const current = screen.getByLabelText(/^현재 비밀번호/);
  const next = screen.getByLabelText(/^새 비밀번호/);
  await userEvent.type(current, 'wrong-current');
  await userEvent.type(next, 'new-password-123');
  fireEvent.submit(container.querySelector('form')!);
  expect(
    await screen.findByText('현재 비밀번호를 확인하세요. 비밀번호는 변경되지 않았습니다.'),
  ).toBeVisible();
  expect(changed).not.toHaveBeenCalled();
  expect(unauthorized).not.toHaveBeenCalled();
  await waitFor(() => expect(current).toHaveValue(''));
  expect(next).toHaveValue('');
  await userEvent.type(current, 'temporary-password');
  await userEvent.type(next, 'new-password-123');
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    screen.queryByText('현재 비밀번호를 확인하세요. 비밀번호는 변경되지 않았습니다.'),
  ).not.toBeInTheDocument();
});

test('expired session still requests login and never reports password change success', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ code: 'LOGIN_DENIED' }, { status: 401 })),
  );
  const unauthorized = vi.fn(),
    changed = vi.fn(),
    notice = vi.fn();
  const { container } = render(
    <SessionContext.Provider
      value={{ api: createApi(unauthorized), notice, storeId: '', unauthorized }}
    >
      <PasswordForm changed={changed} />
    </SessionContext.Provider>,
  );
  await userEvent.type(screen.getByLabelText(/^현재 비밀번호/), 'temporary-password');
  await userEvent.type(screen.getByLabelText(/^새 비밀번호/), 'new-password-123');
  fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(notice).toHaveBeenCalledWith('다시 로그인하세요.'));
  expect(unauthorized).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
});

test('admin row loads checkbox state and sends edited name, role and active flag', async () => {
  const user = {
    id: 'synthetic',
    team_id: '11111111-1111-4111-8111-111111111111',
    team_name: '개발1팀',
    username: 'test.user',
    display_name: 'Original',
    role: 'viewer',
    active: true,
    must_change: false,
  };
  const api = vi
    .fn()
    .mockImplementation(async (path, body) =>
      path === '/admin/teams'
        ? { teams: [{ id: user.team_id, name: user.team_name }], canCreate: true }
        : body
          ? {}
          : [user],
    );
  render(
    <SessionContext.Provider value={{ api, notice: vi.fn(), storeId: '', unauthorized: vi.fn() }}>
      <AdminUsers />
    </SessionContext.Provider>,
  );
  const group = within(await screen.findByRole('article', { name: 'test.user 계정' }));
  await userEvent.click(group.getByText('계정 정보 수정'));
  expect(group.getByRole('checkbox')).toBeChecked();
  await userEvent.click(group.getByRole('checkbox'));
  await userEvent.selectOptions(group.getByRole('combobox', { name: '역할' }), 'analyst');
  await userEvent.click(group.getByRole('button', { name: '계정 저장' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/admin/users/synthetic', {
      displayName: 'Original',
      role: 'analyst',
      active: false,
      teamId: user.team_id,
    }),
  );
});

test('settings hydrate loaded values and clear the runner when the source changes', async () => {
  const api = vi.fn().mockImplementation(async (path, body) => {
    if (body) return {};
    if (path === '/sources')
      return [
        { id: 'a', display_name: 'A' },
        { id: 'b', display_name: 'B' },
      ];
    if (path === '/runners')
      return [{ id: 'runner', display_name: 'Runner', agents: ['codex'], active: true }];
    if (path === '/settings') return { sourceId: 'a', runnerId: 'runner', agent: 'codex' };
    return [];
  });
  const changed = vi.fn();
  render(
    <SessionContext.Provider value={{ api, notice: vi.fn(), storeId: '', unauthorized: vi.fn() }}>
      <Settings changed={changed} />
    </SessionContext.Provider>,
  );
  await waitFor(() => expect(screen.getByRole('combobox', { name: '메일 출처' })).toHaveValue('a'));
  expect(screen.getByRole('combobox', { name: '실행 장치' })).toHaveValue('runner');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '메일 출처' }), 'b');
  expect(screen.getByRole('combobox', { name: '실행 장치' })).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: '선택 저장' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ sourceId: 'b', runnerId: undefined }),
    ),
  );
  expect(changed).toHaveBeenCalledOnce();
});

test('admin can add a team and select it when creating an account', async () => {
  const teams = [{ id: '11111111-1111-4111-8111-111111111111', name: '개발1팀' }];
  const api = vi.fn(async (path: string, body?: unknown) => {
    if (path === '/admin/teams' && body) {
      teams.push({
        id: '22222222-2222-4222-8222-222222222222',
        name: (body as { name: string }).name,
      });
      return teams[1];
    }
    if (path === '/admin/teams') return { teams: [...teams], canCreate: true };
    if (path === '/admin/users' && body) return { temporaryPassword: 'synthetic-password' };
    return [];
  });
  render(
    <SessionContext.Provider
      value={{ api: api as Api, notice: vi.fn(), storeId: '', unauthorized: vi.fn() }}
    >
      <AdminUsers />
    </SessionContext.Provider>,
  );
  const name = await screen.findByLabelText('새 팀 이름');
  await userEvent.type(name, '개발2팀');
  await userEvent.click(screen.getByRole('button', { name: '팀 추가' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/teams', { name: '개발2팀' }));
  await userEvent.click(screen.getByText('새 계정 만들기'));
  await userEvent.type(screen.getByLabelText(/^새 사용자명/), 'new.user');
  await userEvent.type(screen.getByLabelText(/^표시 이름/), '새 사용자');
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: '새 계정 소속 팀' }),
    teams[1].id,
  );
  await userEvent.click(screen.getByRole('button', { name: '계정 생성' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/admin/users',
      expect.objectContaining({ username: 'new.user', teamId: teams[1].id }),
    ),
  );
});
