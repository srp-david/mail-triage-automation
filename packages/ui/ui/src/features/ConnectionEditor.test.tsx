import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect, vi } from 'vitest';
import { SessionContext } from '../api/client';
import { ConnectionEditor } from './ConnectionEditor';

function fixture(existing = '') {
  let snapshot = {
    revision: 'a'.repeat(64),
    connections: { mailMcpUrl: existing, dbMcpUrl: '', agents: {}, evidenceRoots: {} },
  };
  const found = {
    mail: [{ url: 'http://127.0.0.1:17082/mcp', source: 'Codex' }],
    db: [{ url: 'http://127.0.0.1:17080/mcp', source: 'Claude' }],
    agents: { claude: { executable: 'C:\\tools\\claude.exe' } },
    note: '테스트 탐색',
  };
  const api = vi.fn().mockImplementation(async (path, body) => {
    if (path === '/connections') {
      if (body) snapshot = { revision: 'b'.repeat(64), connections: body.connections };
      return snapshot;
    }
    if (path === '/connections/discover') return found;
    if (path === '/connections/check') return { connected: true, compatible: true, missing: [] };
    throw new Error('Unexpected request');
  });
  const saved = vi.fn();
  render(
    <SessionContext.Provider value={{ api, notice: vi.fn(), storeId: '', unauthorized: vi.fn() }}>
      <ConnectionEditor onSaved={saved} />
    </SessionContext.Provider>,
  );
  return { api, saved, found };
}
test('discovery fills empty settings, keeps existing endpoint, and saves the visible form without JSON editing', async () => {
  const { api, saved } = fixture('http://127.0.0.1:19000/mcp');
  await waitFor(() =>
    expect(screen.getByLabelText('DB MCP 주소')).toHaveValue('http://127.0.0.1:17080/mcp'),
  );
  expect(screen.getByLabelText('Mail MCP 주소')).toHaveValue('http://127.0.0.1:19000/mcp');
  expect(screen.getByLabelText('Claude Code 실행 경로')).toHaveValue('C:\\tools\\claude.exe');
  expect(api.mock.calls.filter(([path, body]) => path === '/connections' && body)).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: '자료 폴더 추가' }));
  await userEvent.type(screen.getByLabelText('자료 이름 1'), 'erp');
  await userEvent.type(screen.getByLabelText('자료 폴더 1'), 'C:\\work\\erp');
  await userEvent.click(screen.getByRole('button', { name: '연결 환경 저장' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  const request = api.mock.calls.find(([path, body]) => path === '/connections' && body)![1];
  expect(request.revision).toBe('a'.repeat(64));
  expect(request.connections.evidenceRoots).toEqual({ erp: 'C:\\work\\erp' });
});
test('editing an endpoint clears old connection evidence and a save conflict preserves the draft', async () => {
  const { api, saved } = fixture();
  const check = screen.getByRole('button', { name: 'Mail MCP 연결 확인' });
  await waitFor(() => expect(check).toBeEnabled());
  await userEvent.click(check);
  expect(await screen.findByText('연결 및 필요한 도구 확인 완료')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Mail MCP 주소'), '/changed');
  expect(screen.queryByText('연결 및 필요한 도구 확인 완료')).not.toBeInTheDocument();
  api.mockImplementationOnce(async () => {
    throw new Error('다른 화면에서 연결 설정이 변경되었습니다.');
  });
  await userEvent.click(screen.getByRole('button', { name: '연결 환경 저장' }));
  expect(await screen.findByText('다른 화면에서 연결 설정이 변경되었습니다.')).toBeInTheDocument();
  expect(screen.getByLabelText('Mail MCP 주소')).toHaveValue('http://127.0.0.1:17082/mcp/changed');
  expect(saved).not.toHaveBeenCalled();
});
