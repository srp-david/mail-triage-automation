import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { UpdatePanel, UpdateNotice, useUpdates } from './Updates';
import type { UpdateState } from '../../../../contracts/src/update-state';
import type { Api } from '../api/types';

function Harness({ api }: { api: Api }) {
  const model = useUpdates(api, true);
  return (
    <>
      <UpdateNotice model={model} />
      <UpdatePanel model={model} />
    </>
  );
}
const offer: UpdateState = {
  currentVersion: '0.3.5',
  status: 'offered',
  phase: 'idle',
  update: {
    releaseId: 'v0.3.9',
    version: '0.3.9',
    assetSha256: 'a'.repeat(64),
    releaseNotesUrl: 'https://github.com/srp-david/mail-triage-automation/releases/tag/v0.3.9',
  },
};
test('manual check and later share server state; later keeps installation available in settings', async () => {
  let state: UpdateState = { currentVersion: '0.3.5', status: 'current', phase: 'idle' };
  const api = vi.fn(async (path: string) => {
    if (path === '/updates/check') state = { ...offer };
    if (path === '/updates/defer') state = { ...state, deferred: true };
    return structuredClone(state);
  }) as unknown as Api;
  render(<Harness api={api} />);
  await screen.findByText('최신 버전을 사용하고 있습니다.');
  await userEvent.click(screen.getByRole('button', { name: '업데이트 확인' }));
  await screen.findByRole('link', { name: '업데이트 보기' });
  await userEvent.click(screen.getAllByRole('button', { name: '나중에' })[0]);
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: '업데이트 보기' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: '지금 설치' })).toBeEnabled();
  expect(api).not.toHaveBeenCalledWith('/updates/install', expect.anything());
});
test('install disables duplicate actions and shows download progress', async () => {
  let state = structuredClone(offer);
  const api = vi.fn(async (path: string) => {
    if (path === '/updates/install')
      state = { ...state, phase: 'downloading', downloadedBytes: 25, totalBytes: 100 };
    return structuredClone(state);
  }) as unknown as Api;
  render(<Harness api={api} />);
  await userEvent.click(await screen.findByRole('button', { name: '지금 설치' }));
  await screen.findByText('25% 다운로드됨');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  expect(screen.getByRole('button', { name: '업데이트 확인' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: '지금 설치' })).not.toBeInTheDocument();
});
test('verification failures are shown with retry, never as latest', async () => {
  const api = vi.fn(async () => ({
    currentVersion: '0.3.5',
    status: 'error',
    phase: 'error',
    errorCode: 'UPDATE_DOWNLOAD_CHECKSUM',
  })) as unknown as Api;
  render(<Harness api={api} />);
  await screen.findByText(/배포 정보를 검증하지 못했습니다/);
  expect(screen.getByRole('button', { name: '업데이트 확인' })).toBeEnabled();
  expect(screen.queryByText('최신 버전을 사용하고 있습니다.')).not.toBeInTheDocument();
});
