import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, LinearProgress, Typography } from '@mui/material';
import { previewFormat, PREVIEW_LIMIT } from '../../../../../public/office-preview.js';
import { previewImageType } from '../../../../../public/attachments.js';
import type { Attachment } from '../api/types';

const closeEvent = 'triage:close-preview';
export function closeOfficePreview() {
  window.dispatchEvent(new Event(closeEvent));
}
export function PreviewDialog({
  attachment,
  loadFile,
  download,
}: {
  attachment: Attachment | null;
  loadFile: (a: Attachment, s?: AbortSignal) => Promise<Blob>;
  download: (a: Attachment) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState(''),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setOpen(
      !!attachment &&
        !!previewFormat(attachment) &&
        !!attachment.attachmentId &&
        attachment.size <= PREVIEW_LIMIT,
    );
  }, [attachment]);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(closeEvent, close);
    return () => window.removeEventListener(closeEvent, close);
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  useEffect(() => {
    if (!open || !attachment) return;
    const controller = new AbortController();
    let alive = true,
      frame: HTMLIFrameElement | null = null;
    const format = previewFormat(attachment);
    setFailed(false);
    setStatus('첨부파일을 가져오는 중입니다…');
    const fail = (message: string) => {
      if (!alive) return;
      controller.abort();
      clearTimeout(timer);
      viewport.current?.replaceChildren();
      frame = null;
      setStatus(message);
      setFailed(true);
    };
    const timer = setTimeout(
      () => fail('미리보기 시간이 초과되었습니다. 다시 시도하거나 원본을 다운로드해 주세요.'),
      60000,
    );
    const receive = (event: MessageEvent) => {
      if (
        !frame ||
        event.source !== frame.contentWindow ||
        event.origin !== location.origin ||
        event.data?.type !== 'office-preview'
      )
        return;
      if (event.data.state === 'close') setOpen(false);
      else if (event.data.state === 'loaded') {
        clearTimeout(timer);
        setStatus('');
      } else if (event.data.state === 'error')
        fail('문서를 표시하지 못했습니다. 다시 시도하거나 원본을 다운로드해 주세요.');
    };
    window.addEventListener('message', receive);
    void (async () => {
      try {
        const blob = await loadFile(attachment, controller.signal);
        if (!alive || controller.signal.aborted) return;
        if (blob.size > PREVIEW_LIMIT) throw Error('미리보기는 파일당 5 MiB까지 지원합니다.');
        if (format === 'image') {
          const source = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(Error('이미지 파일을 읽지 못했습니다.'));
            reader.readAsDataURL(new Blob([blob], { type: previewImageType(attachment)! }));
          });
          if (!alive || controller.signal.aborted) return;
          setStatus('이미지를 여는 중입니다…');
          const img = document.createElement('img');
          img.alt = attachment.filename || '첨부 이미지';
          img.onload = () => {
            if (alive && !controller.signal.aborted) {
              clearTimeout(timer);
              setStatus('');
            }
          };
          img.onerror = () =>
            fail('이미지를 표시하지 못했습니다. 다시 시도하거나 원본을 다운로드해 주세요.');
          img.src = source;
          viewport.current?.replaceChildren(img);
          return;
        }
        const buffer = await blob.arrayBuffer();
        if (!alive || controller.signal.aborted) return;
        if (buffer.byteLength < 4 || new DataView(buffer).getUint32(0, true) !== 0x04034b50)
          throw Error(
            '지원하는 Office 문서가 아니거나 암호화된 파일입니다. 원본을 다운로드해 주세요.',
          );
        setStatus('문서를 여는 중입니다…');
        frame = document.createElement('iframe');
        frame.title = attachment.filename + ' 미리보기';
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        frame.referrerPolicy = 'no-referrer';
        const ownFrame = frame;
        const send = (event: MessageEvent) => {
          if (
            !alive ||
            event.source !== ownFrame.contentWindow ||
            event.origin !== location.origin ||
            event.data?.type !== 'office-preview' ||
            event.data.state !== 'ready'
          )
            return;
          window.removeEventListener('message', send);
          ownFrame.contentWindow?.postMessage(
            { type: 'office-preview-file', format, filename: attachment.filename, buffer },
            location.origin,
            [buffer],
          );
        };
        window.addEventListener('message', send, { signal: controller.signal });
        frame.src = '/preview/';
        viewport.current?.replaceChildren(frame);
      } catch (error) {
        if (alive && !controller.signal.aborted)
          fail(error instanceof Error ? error.message : '미리보기를 불러오지 못했습니다.');
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      // Remove this effect's frame; the portal may already host a newer preview.
      frame?.remove();
    };
  }, [open, attachment, attempt, loadFile]);
  return open ? (
    <Dialog
      open
      onClose={() => setOpen(false)}
      aria-labelledby="preview-title"
      maxWidth={false}
      slotProps={{
        paper: {
          className: 'office-preview',
          sx: {
            width: 'min(1280px,96vw)',
            height: '92dvh',
            maxHeight: '96dvh',
            m: 1,
            '@media(max-width:600px)': {
              m: 0,
              width: '100%',
              height: '100dvh',
              maxHeight: '100dvh',
              borderRadius: 0,
            },
          },
        },
      }}
    >
      <div className="preview-head">
        <Typography id="preview-title" component="h2" variant="h2">
          {attachment?.filename}
        </Typography>
        <div className="preview-controls">
          <Button
            disabled={busy}
            onClick={async () => {
              if (!attachment) return;
              setBusy(true);
              try {
                await download(attachment);
              } catch (error) {
                setStatus(error instanceof Error ? error.message : '다운로드에 실패했습니다.');
              } finally {
                setBusy(false);
              }
            }}
          >
            원본 다운로드
          </Button>
          <Button
            hidden={!failed}
            onClick={() => {
              setFailed(false);
              setStatus('첨부파일을 가져오는 중입니다…');
              setAttempt((v) => v + 1);
            }}
          >
            다시 시도
          </Button>
          <Button autoFocus onClick={() => setOpen(false)}>
            닫기
          </Button>
        </div>
      </div>
      <p className="preview-hint">
        {attachment && previewFormat(attachment) === 'image'
          ? '이미지 미리보기'
          : '읽기 전용 미리보기 · 원본과 서식이 다를 수 있습니다.'}
      </p>
      <p className="preview-status" role="status" hidden={!status}>
        {status}
      </p>
      {status && !failed && <LinearProgress aria-label="첨부파일 로딩" />}
      <div
        className={
          'preview-viewport' +
          (attachment && previewFormat(attachment) === 'image' ? ' image-preview-viewport' : '')
        }
        ref={viewport}
      />
    </Dialog>
  ) : null;
}
