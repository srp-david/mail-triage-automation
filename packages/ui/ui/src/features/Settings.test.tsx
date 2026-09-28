import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Settings } from './Settings';
import { SessionContext } from '../api/client';

function fixture() {
  let settings = {
    sourceId: 'a',
    agent: 'codex',
    runnerId: 'runner',
    collectionId: 'existing-docs' as string | undefined,
    originalAvailable: true,
    environment: {
      mailConfigured: true,
      agents: ['codex'],
      evidenceRootCount: 2,
      dbConfigured: false,
    },
  };
  const sources = [
    { id: 'a', display_name: '내 메일' },
    { id: 'b', display_name: '공유 메일' },
  ];
  const runners = [
    { id: 'runner', display_name: '내 PC', active: true, agents: ['codex', 'claude'] },
  ];
  const runtime = { analysis: 'stopped', sync: 'stopped', analysisAvailable: true };
  const api = vi.fn().mockImplementation(async (path, body) => {
    if (path === '/settings') {
      if (body) settings = { ...settings, ...body };
      return settings;
    }
    if (path === '/sources') {
      if (body) {
        sources.push({ id: 'created', display_name: body.displayName });
        return { id: 'created' };
      }
      return [...sources];
    }
    if (path === '/runners') return runners;
    if (path === '/members') return [{ id: 'member', username: 'team.user' }];
    if (path === '/collections') return [{ id: 'docs', name: '팀 문서' }];
    if (path === '/runtime') return { ...runtime };
    if (path === '/runtime/start') {
      runtime[body.kind as 'analysis' | 'sync'] = 'idle';
      return {};
    }
    throw Error('Unexpected call ' + path);
  });
  const notice = vi.fn();
  render(
    <SessionContext.Provider value={{ api, notice, storeId: '', unauthorized: vi.fn() }}>
      <Settings changed={vi.fn()} />
    </SessionContext.Provider>,
  );
  return { api, notice };
}
const button = (name: string) => screen.getByRole('button', { name });
async function loaded() {
  await waitFor(() => expect(screen.getByRole('combobox', { name: '메일 출처' })).toHaveValue('a'));
}

test('unsaved selection invalidates runtime evidence; removed management controls never load', async () => {
  const { api } = fixture();
  await loaded();
  expect(screen.queryByRole('button', { name: '분석 실행 켜기' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '동기화 실행 켜기' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '로컬 실행 중지' })).not.toBeInTheDocument();
  await userEvent.click(button('실행 상태 확인'));
  expect(await screen.findByText('분석: 중지됨')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('메일 출처'), 'b');
  expect(button('실행 상태 확인')).toBeDisabled();
  expect(screen.queryByText('분석: 중지됨')).not.toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: '공유·장치 관리' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('팀 사용자')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '장치 폐기' })).not.toBeInTheDocument();
  expect(api.mock.calls.some(([path]) => path === '/collections' || path === '/members')).toBe(
    false,
  );
  expect(api.mock.calls.filter(([path, body]) => body && path !== '/settings')).toHaveLength(0);
});

test('late runtime result does not mark a changed selection ready', async () => {
  const { api } = fixture();
  await loaded();
  let finish!: (value: unknown) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await userEvent.click(button('실행 상태 확인'));
  await userEvent.selectOptions(screen.getByLabelText('분석 도구'), 'claude');
  await act(async () => finish({ analysis: 'idle', sync: 'idle', analysisAvailable: true }));
  expect(screen.queryByText('분석: 대기 중')).not.toBeInTheDocument();
  expect(screen.getByText('도구 설정 필요')).toBeInTheDocument();
});

test('saved settings allow mailbox navigation without manually starting a worker', async () => {
  const { api } = fixture();
  await loaded();
  await userEvent.click(button('선택 저장'));
  await waitFor(() => expect(button('실행 상태 확인')).toBeEnabled());
  expect(api).toHaveBeenCalledWith(
    '/settings',
    expect.objectContaining({ collectionId: 'existing-docs', runnerId: 'runner' }),
  );
  expect(screen.getByRole('link', { name: '메일함으로 이동' })).toHaveAttribute('href', '#mailbox');
  expect(
    screen.getByText('동기화·분석을 요청하면 필요한 백그라운드 작업이 자동으로 시작됩니다.'),
  ).toBeInTheDocument();
  expect(api.mock.calls.some(([path]) => path === '/runtime/start')).toBe(false);
});

test('source registration preserves other draft selections and selects the new source', async () => {
  fixture();
  await loaded();
  await userEvent.selectOptions(screen.getByLabelText('분석 도구'), 'claude');
  await userEvent.click(screen.getByText('처음 연결하는 메일 등록'));
  await userEvent.type(screen.getByLabelText('메일 출처 이름'), '새 업무 메일');
  await userEvent.click(button('현재 MCP 출처 등록'));
  await waitFor(() => expect(screen.getByLabelText('메일 출처')).toHaveValue('created'));
  expect(screen.getByLabelText('분석 도구')).toHaveValue('claude');
  expect(button('실행 상태 확인')).toBeDisabled();
});

test('runtime failure stays actionable without presenting old readiness', async () => {
  const { api } = fixture();
  await loaded();
  await userEvent.click(button('실행 상태 확인'));
  expect(await screen.findByText('분석: 중지됨')).toBeInTheDocument();
  api.mockRejectedValueOnce(Error('연결 실패'));
  await userEvent.click(button('실행 상태 확인'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '실행 상태를 확인하지 못했습니다. 연결 실패',
  );
  expect(screen.queryByText('분석: 중지됨')).not.toBeInTheDocument();
  expect(button('실행 상태 확인')).toBeEnabled();
});
