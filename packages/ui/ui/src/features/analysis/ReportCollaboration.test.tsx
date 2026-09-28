import { test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SessionContext } from '../../api/client';
import { ReportCollaboration } from './ReportCollaboration';
import type { Api } from '../../api/types';
vi.mock('../../components/Documents', () => ({
  MarkdownView: ({ value }: { value: string }) => <pre>{value}</pre>,
}));
beforeEach(() => {
  cleanup();
  sessionStorage.clear();
});
test('concurrent save preserves draft and requires explicit rebase; lost response retries exact request', async () => {
  let version = 1,
    report = 'Original',
    lost = true;
  const requests: unknown[] = [];
  const api = vi.fn(async (path: string, input?: unknown) => {
    const body = input as { expectedVersion: number; report: string };
    if (path.endsWith('/collaboration'))
      return {
        version,
        report,
        canEdit: true,
        revisions: [{ version, changeNote: 'Test' }],
        messages: [],
      };
    if (path.endsWith('/revisions')) {
      requests.push(body);
      if (body.expectedVersion === 1) {
        version = 2;
        report = 'Teammate report';
        throw Error('REPORT_VERSION_CONFLICT');
      }
      if (lost) {
        lost = false;
        throw Error('NETWORK_ERROR');
      }
      version = 3;
      report = body.report;
      return { version };
    }
    throw Error('Unexpected ' + path);
  });
  render(
    <SessionContext.Provider
      value={{
        api: api as Api,
        storeId: 'source',
        userId: 'user-ui-cas',
        notice: vi.fn(),
        unauthorized: vi.fn(),
      }}
    >
      <ReportCollaboration id="report-cas" />
    </SessionContext.Provider>,
  );
  fireEvent.click(await screen.findByText('보고서 편집'));
  fireEvent.change(screen.getByLabelText('보고서 초안'), {
    target: { value: 'My preserved draft' },
  });
  fireEvent.change(screen.getByLabelText('변경 내용'), { target: { value: 'Correction' } });
  fireEvent.click(screen.getByText('보고서에 반영 · 새 버전 저장'));
  await screen.findByText(/최신 버전은 v2/);
  expect(screen.getByLabelText('보고서 초안')).toHaveValue('My preserved draft');
  expect(screen.getByText('보고서에 반영 · 새 버전 저장')).toBeDisabled();
  fireEvent.click(screen.getByText(/최신 v2과 비교 완료/));
  fireEvent.click(screen.getByText('보고서에 반영 · 새 버전 저장'));
  await waitFor(() => expect(requests).toHaveLength(2));
  await waitFor(() => expect(screen.getByText('보고서에 반영 · 새 버전 저장')).not.toBeDisabled());
  fireEvent.click(screen.getByText('보고서에 반영 · 새 버전 저장'));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[1]).toEqual(requests[2]);
  await screen.findByText('보고서 v3');
});
