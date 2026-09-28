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
    return <p role="status">{resource.error || '팀 분석을 불러오는 중입니다…'}</p>;
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
export function MailSharedReports({ mailId }: { mailId: number }) {
  const { api, storeId } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useResource(
    (signal) =>
      api<{ match: { matched: boolean }; reports: SharedReport[] }>(
        '/mails/' + mailId + '/shared-reports',
        {},
        signal,
      ),
    storeId + ':' + mailId,
  );
  return (
    <section aria-label="팀 분석">
      <h3>팀 분석</h3>
      {resource.error ? (
        <p role="status">팀 분석을 확인하지 못했습니다. {resource.error}</p>
      ) : !resource.data ? (
        <p>팀 분석 확인 중…</p>
      ) : (
        <>
          {!resource.data.match.matched && (
            <p>메일 식별 정보가 부족하여 자동 연결하지 않았습니다.</p>
          )}
          {resource.data.match.matched && !resource.data.reports.length && (
            <p>이 메일에 등록된 팀 분석이 없습니다.</p>
          )}
          {resource.data.reports.map((r) => (
            <p key={r.id}>
              <Button onClick={() => setSelected(r.id)}>
                팀 분석 보기 · {r.author} · {date(r.createdAt)}
              </Button>
            </p>
          ))}
        </>
      )}
      <Action onAction={resource.refresh}>팀 분석 새로고침</Action>
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
            팀 분석
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
