import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { SessionContext } from '../../api/client';
import { HistoryList } from './History';
import type { Api } from '../../api/types';

vi.mock('../../components/Documents', () => ({ MarkdownView: () => null }));

test('team history works without source setup; search preserves IME and resets pagination', async () => {
  const initial = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    subject: `기존 보고서 ${i}`,
    status: 'completed',
    author: '팀원',
    sourceName: '팀원 PC',
  }));
  const api = vi.fn(async (path: string) => {
    const q = new URLSearchParams(path.split('?')[1]);
    if (q.get('query'))
      return [{ id: 'match', subject: '검색 결과', status: 'completed', author: '작성자' }];
    return q.get('offset') === '100'
      ? [{ id: 'extra', subject: '추가 페이지', status: 'completed' }]
      : initial;
  });
  const open = vi.fn();
  const { container } = render(
    <SessionContext.Provider
      value={{
        api: api as Api,
        storeId: '',
        userId: '11111111-1111-4111-8111-111111111111',
        notice: vi.fn(),
        unauthorized: vi.fn(),
      }}
    >
      <HistoryList kind="runs" open={open} />
    </SessionContext.Provider>,
  );
  await screen.findByText('기존 보고서 0');
  expect(api.mock.calls[0][0]).toBe('/runs?offset=0');
  await userEvent.click(await screen.findByRole('button', { name: '이력 더 보기' }));
  await screen.findByText('추가 페이지');
  const input = screen.getByLabelText('제목·보고서 검색');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '검색' } });
  const calls = api.mock.calls.length;
  fireEvent.submit(container.querySelector('form')!);
  expect(api).toHaveBeenCalledTimes(calls);
  fireEvent.compositionEnd(input);
  await userEvent.click(screen.getByRole('button', { name: '검색' }));
  await screen.findByText('검색 결과');
  expect(screen.queryByText('추가 페이지')).not.toBeInTheDocument();
  const last = new URLSearchParams(api.mock.calls.at(-1)![0].split('?')[1]);
  expect(last.get('offset')).toBe('0');
  expect(last.get('query')).toBe('검색');
  expect(last.has('sourceId')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: /검색 결과/ }));
  expect(open).toHaveBeenCalledWith({ kind: 'run', id: 'match' });
  await userEvent.click(screen.getByRole('button', { name: '초기화' }));
  await waitFor(() => expect(screen.getByText('기존 보고서 0')).toBeInTheDocument());
});
