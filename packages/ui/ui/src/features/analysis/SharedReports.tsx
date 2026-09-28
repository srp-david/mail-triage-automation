import { useState } from 'react';
import { Box, Button, Dialog, DialogContent, DialogTitle } from '@mui/material';
import { useSession } from '../../api/client';
import { useResource } from '../../hooks/async';
import { Action } from '../../components/Common';
import { ReportCollaboration } from './ReportCollaboration';
import { date } from '../../api/types';

export type SharedReport = {
  id: string;
  subject: string;
  author: string;
  createdAt: string;
  report: string;
  canEdit: boolean;
  canShare: boolean;
  permission: 'none' | 'read' | 'write';
};
export function SharedReportView({ id }: { id: string }) {
  const { api } = useSession();
  const resource = useResource(
    (signal) => api<SharedReport>('/reports/' + id, undefined, signal),
    id,
  );
  if (!resource.data || resource.error)
    return <p role="status">{resource.error || '공유 분석을 불러오는 중입니다…'}</p>;
  const r = resource.data;
  return (
    <>
      <p>
        {r.author} · {date(r.createdAt)}
      </p>
      <ReportCollaboration id={id} />
    </>
  );
}
export function ReportSharing({ id }: { id: string }) {
  const { api } = useSession();
  const resource = useResource(
    (signal) => api<SharedReport>('/reports/' + id, undefined, signal),
    id,
  );
  if (!resource.data || resource.error)
    return <p role="status">{resource.error || '공유 설정 확인 중…'}</p>;
  const r = resource.data;
  return (
    <div>
      <p>
        보고서 공유:{' '}
        {r.permission === 'none'
          ? '공유 안 함'
          : r.permission === 'write'
            ? '팀 조회·편집'
            : '팀 조회'}
      </p>
      {r.canShare && (
        <div className="dialog-button-row">
          {(['read', 'write', 'none'] as const).map((permission) => (
            <Action
              key={permission}
              disabled={r.permission === permission}
              onAction={async () => {
                await api('/reports/' + id + '/share', { permission });
                await resource.refresh();
              }}
            >
              {permission === 'read'
                ? '팀에 읽기 공유'
                : permission === 'write'
                  ? '팀에 편집 공유'
                  : '공유 해제'}
            </Action>
          ))}
        </div>
      )}
    </div>
  );
}
export function MailSharedReports({ mailId }: { mailId: number }) {
  const { api } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useResource(
    (signal) =>
      api<{ match: { matched: boolean }; reports: SharedReport[] }>(
        '/mails/' + mailId + '/shared-reports',
        {},
        signal,
      ),
    String(mailId),
  );
  return (
    <section aria-label="공유 분석">
      <h3>공유 분석</h3>
      {resource.error ? (
        <p role="status">공유 분석을 확인하지 못했습니다.</p>
      ) : !resource.data ? (
        <p>공유 분석 확인 중…</p>
      ) : (
        <>
          {!resource.data.match.matched && (
            <p>메일 식별 정보가 부족하여 자동 연결하지 않았습니다.</p>
          )}
          {resource.data.match.matched && !resource.data.reports.length && (
            <p>공유된 분석이 없습니다.</p>
          )}
          {resource.data.reports.map((r) => (
            <p key={r.id}>
              <Button onClick={() => setSelected(r.id)}>
                공유 분석 보기 · {r.author} · {date(r.createdAt)}
              </Button>
            </p>
          ))}
        </>
      )}
      <Action onAction={resource.refresh}>공유 분석 새로고침</Action>
      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="lg"
        aria-labelledby="shared-report-title"
      >
        <DialogTitle
          id="shared-report-header"
          component="div"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
          <Box component="span" id="shared-report-title">
            공유 분석
          </Box>
          <Button onClick={() => setSelected(null)}>닫기</Button>
        </DialogTitle>
        <DialogContent dividers>
          {selected && <SharedReportView key={selected} id={selected} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
