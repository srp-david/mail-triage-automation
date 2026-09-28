import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { SessionContext } from '../../api/client';
import type { Api } from '../../api/types';
import { MailboxPage } from './MailboxPage';

vi.mock('./MailDetail', () => ({ MailDetail: () => null }));

test('search refreshes results without rechecking headers; explicit refresh rechecks displayed mail', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const api = vi.fn(async (path: string) => {
    if (path.startsWith('/mails?'))
      return {
        emails: [{ id: 1, subject: '캐시 검증 메일', from: [] }],
        total: 1,
        nextOffset: null,
      };
    if (path.startsWith('/mail-analysis?')) return [];
    throw Error(path);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider
        value={{ api: api as Api, storeId: 'fixture', notice: vi.fn(), unauthorized: vi.fn() }}
      >
        <MailboxPage
          enabled
          visible
          sync={null}
          startSync={vi.fn()}
          stopSync={vi.fn()}
          onHistory={vi.fn()}
          onAnalysis={vi.fn()}
          onSelect={vi.fn()}
        />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  try {
    await waitFor(() =>
      expect(api.mock.calls.some(([p]) => p.startsWith('/mail-analysis?'))).toBe(true),
    );
    api.mockClear();
    await userEvent.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() =>
      expect(api.mock.calls.some(([p]) => p.startsWith('/mail-analysis?'))).toBe(true),
    );
    expect(api.mock.calls.find(([p]) => p.startsWith('/mails?'))![0]).toContain('refresh=1');
    expect(api.mock.calls.some(([p]) => p.includes('recheck=1'))).toBe(false);
    expect(api.mock.calls.find(([p]) => p.startsWith('/mail-analysis?'))![0]).not.toContain(
      'refresh=1',
    );
    api.mockClear();
    await userEvent.click(screen.getByRole('button', { name: '메일 목록 새로고침' }));
    await waitFor(() =>
      expect(api.mock.calls.some(([p]) => p.startsWith('/mail-analysis?'))).toBe(true),
    );
    expect(api.mock.calls.find(([p]) => p.startsWith('/mails?'))![0]).toContain('recheck=1');
    expect(api.mock.calls.find(([p]) => p.startsWith('/mail-analysis?'))![0]).toContain(
      'refresh=1',
    );
  } finally {
    unmount();
    client.clear();
  }
});
