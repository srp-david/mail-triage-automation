import { Disclosure, DisclosureTitle } from '../../components/Controls';
import { Button, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../api/client';
import {
  activeRun,
  date,
  labels,
  type Attachment,
  type Body,
  type Mail,
  type Run,
  type Summary,
} from '../../api/types';
import { useLatest, useResource } from '../../hooks/async';
import { Action } from '../../components/Common';
import { MailContent, PreviewDialog } from '../../components/Documents';
import { previewFormat } from '../../../../../../public/office-preview.js';
const LIMIT = 5 * 1024 * 1024;
const emptyAttachments: Attachment[] = [];
function fileSize(size: number) {
  return !Number.isFinite(size) || size < 0
    ? '크기 미확인'
    : size < 1024
      ? size + ' B'
      : size < 1024 * 1024
        ? (size / 1024).toFixed(1) + ' KiB'
        : (size / 1024 / 1024).toFixed(1) + ' MiB';
}
function AttachmentRow({
  file,
  download,
  preview,
}: {
  file: Attachment;
  download: (file: Attachment) => Promise<void>;
  preview: (file: Attachment) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    lock = useRef(false);
  const blocked = !file.attachmentId || file.size > LIMIT;
  const extension = file.filename?.split('.').pop()?.toUpperCase() ?? '파일';
  return (
    <li className="attachment-row">
      <div className="attachment-info">
        <strong className="attachment-name">{file.filename || '이름 없는 첨부파일'}</strong>
        <span className="attachment-meta">
          {extension} · {fileSize(file.size)}
        </span>
      </div>
      <div className="attachment-actions">
        {previewFormat(file) && (
          <Button
            type="button"
            className="preview-button"
            aria-label={(file.filename || '첨부파일') + ' 미리보기'}
            disabled={blocked}
            onClick={() => preview(file)}
          >
            미리보기
          </Button>
        )}
        <Button
          type="button"
          className="download-button"
          aria-label={(file.filename || '첨부파일') + ' 다운로드'}
          disabled={blocked || busy}
          onClick={async () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setError('');
            try {
              await download(file);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : '다운로드에 실패했습니다. 다시 시도해 주세요.',
              );
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          {busy ? '가져오는 중…' : '다운로드'}
        </Button>
      </div>
      <p className="download-status" role="status" hidden={!blocked && !error}>
        {file.size > LIMIT
          ? '5 MiB를 초과해 다운로드할 수 없습니다.'
          : !file.attachmentId
            ? '첨부 식별자가 없어 다운로드할 수 없습니다.'
            : error}
      </p>
    </li>
  );
}
export function MailDetail({
  id,
  summary,
  unavailable,
  refreshSummary,
  onHistory,
  onAnalysis,
  onBack,
  onLoaded,
}: {
  id: number;
  summary?: Summary;
  unavailable: boolean;
  refreshSummary: () => Promise<unknown>;
  onHistory: (id: number, subject: string) => void;
  onAnalysis: (id: string, mailId: number, subject: string) => void;
  onBack: () => void;
  onLoaded: () => void;
}) {
  const { api, storeId } = useSession(),
    life = useRef(0),
    [preview, setPreview] = useState<Attachment | null>(null);
  const resource = useResource(async (signal) => {
    const [mail, body] = await Promise.all([
      api<Mail>('/mails/' + id, undefined, signal),
      api<Body>('/mails/' + id + '/body', undefined, signal).catch(
        () => ({ html: '', unavailable: true }) as Body,
      ),
    ]);
    return { mail, body };
  }, String(id));
  const attachments = resource.data?.mail.attachments ?? emptyAttachments;
  useEffect(() => {
    life.current += 1;
    setPreview(null);
    return () => {
      life.current += 1;
    };
  }, [id]);
  const loadedRef = useLatest(onLoaded);
  useEffect(() => {
    if (resource.data) loadedRef.current();
  }, [resource.data, loadedRef]);
  // A different mail must discard the previous mail's attachment cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cache = useMemo(() => new Map<string, Promise<unknown>>(), [id]);
  const fetchAttachment = useCallback(
    (file: Attachment) => {
      const key = file.attachmentId!;
      if (!cache.has(key))
        cache.set(
          key,
          api('/mails/' + id + '/attachments/' + encodeURIComponent(key))
            .then((result: unknown) => {
              const value = result as { isError?: boolean; structuredContent?: { code?: string } };
              if (value.isError || value.structuredContent?.code) cache.delete(key);
              return result;
            })
            .catch((e) => {
              cache.delete(key);
              throw e;
            }),
        );
      return cache.get(key)!;
    },
    [id, api, cache],
  );
  const loadFile = useCallback(
    async (file: Attachment, signal?: AbortSignal) => {
      const response = await fetch(
        '/api/mails/' + id + '/attachments/' + encodeURIComponent(file.attachmentId!) + '/download',
        { signal },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw Error(
          response.status === 401
            ? '접속이 만료되었습니다. 새로고침 후 로그인해 주세요.'
            : (error.error ?? '다운로드에 실패했습니다.'),
        );
      }
      return response.blob();
    },
    [id],
  );
  const download = useCallback(
    async (file: Attachment) => {
      const blob = await loadFile(file);
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = (file.filename || 'attachment').split(/[\\/]/).pop()!;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    },
    [loadFile],
  );
  async function perform(force = false) {
    if (unavailable) {
      await refreshSummary();
      return;
    }
    const current = life.current;
    const rows = await api<Run[]>('/runs?' + new URLSearchParams({ storeId, mailId: String(id) }));
    if (current !== life.current) return;
    const existing = rows.find((r) => activeRun(r.status)) ?? (!force ? rows[0] : null);
    if (existing) {
      onAnalysis(existing.id, id, resource.data!.mail.subject);
      return;
    }
    if (!force && summary?.runCount)
      throw Error('선택한 분석 이력을 찾지 못했습니다. 이 메일 분석 이력에서 다시 확인해 주세요.');
    const run = await api<Run>('/runs', {
      storeId,
      mailId: id,
      messageId: resource.data!.mail.messageId,
      source: 'web',
      requestId: crypto.randomUUID(),
    });
    if (current === life.current) {
      onAnalysis(run.id, id, resource.data!.mail.subject);
      await refreshSummary();
    }
  }
  if (!resource.data)
    return (
      <>
        <Button className="mail-back" onClick={onBack}>
          메일 목록으로
        </Button>
        <Typography component="h2" variant="h2">
          메일을 불러오는 중입니다.
        </Typography>
        <p role="status">{resource.error}</p>
        {resource.error && <Action onAction={resource.refresh}>다시 조회</Action>}
      </>
    );
  const { mail, body } = resource.data;
  return (
    <>
      <Button className="mail-back" onClick={onBack}>
        메일 목록으로
      </Button>
      <Typography component="h2" variant="h2">
        {mail.subject}
      </Typography>
      <p className="meta">
        {(mail.from ?? []).map((x) => x.address).join(', ')} · {date(mail.sentAt)}
      </p>
      <div className="mail-actions">
        <Action onAction={() => perform()}>
          {unavailable
            ? '이력 다시 확인'
            : activeRun(summary?.latestStatus)
              ? '진행 상황 보기'
              : summary?.runCount
                ? summary.latestStatus === 'failed'
                  ? '실패 내용 보기'
                  : '결과 보기'
                : '분석 시작'}
        </Action>
        {!unavailable && !!summary?.runCount && !activeRun(summary.latestStatus) && (
          <Action className="secondary-button" onAction={() => perform(true)}>
            새로 분석
          </Action>
        )}
        <Button className="history-button" onClick={() => onHistory(id, mail.subject)}>
          이 메일 분석 이력
        </Button>
      </div>
      <p className="meta" role="status">
        {unavailable
          ? '분석 이력을 확인하지 못했습니다. 다시 확인한 뒤 분석할 수 있습니다.'
          : `분석: ${labels[summary?.latestStatus ?? ''] ?? '미분석'} · 업무 처리: ${summary?.handledAt ? '처리 완료' : '완료 표시 없음'}`}
      </p>
      {!!attachments.length && (
        <Disclosure className="mail-attachments">
          <DisclosureTitle>첨부파일 · {attachments.length}개</DisclosureTitle>
          <ul className="attachment-list">
            {attachments.map((a, i) => (
              <AttachmentRow
                key={a.attachmentId ?? i}
                file={a}
                download={download}
                preview={(a) => setPreview({ ...a })}
              />
            ))}
          </ul>
          {attachments.some((a) => a.size > LIMIT) && (
            <p className="attachment-limit">현재 파일당 다운로드 한도는 5 MiB입니다.</p>
          )}
        </Disclosure>
      )}
      <MailContent
        body={body}
        text={mail.body}
        attachments={attachments}
        fetchAttachment={fetchAttachment}
        fallbackHint="본문 서식을 불러오지 못해 텍스트로 표시합니다. 이미지는 첨부파일 목록의 미리보기로 확인할 수 있습니다."
      />
      {!!mail.warnings?.length && <p>조회 경고: {mail.warnings.join(', ')}</p>}
      <PreviewDialog attachment={preview} loadFile={loadFile} download={download} />
    </>
  );
}
