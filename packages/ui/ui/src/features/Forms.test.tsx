import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { UsernameForm, PasswordForm, AdminUsers } from './UsernameAuth';
import { Settings } from './Settings';
import { SessionContext } from '../api/client';
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

test('admin row loads checkbox state and sends edited name, role and active flag', async () => {
  const user = {
    id: 'synthetic',
    username: 'test.user',
    display_name: 'Original',
    role: 'viewer',
    active: true,
    must_change: false,
  };
  const api = vi.fn().mockImplementation(async (_path, body) => (body ? {} : [user]));
  render(
    <SessionContext.Provider value={{ api, notice: vi.fn(), storeId: '', unauthorized: vi.fn() }}>
      <AdminUsers />
    </SessionContext.Provider>,
  );
  await userEvent.click(screen.getByRole('button', { name: '사용자 목록 조회' }));
  const group = within(await screen.findByRole('group', { name: 'test.user' }));
  expect(group.getByRole('checkbox')).toBeChecked();
  await userEvent.click(group.getByRole('checkbox'));
  await userEvent.selectOptions(group.getByRole('combobox'), 'analyst');
  await userEvent.click(group.getByRole('button', { name: '계정 저장' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/admin/users/synthetic', {
      displayName: 'Original',
      role: 'analyst',
      active: false,
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
