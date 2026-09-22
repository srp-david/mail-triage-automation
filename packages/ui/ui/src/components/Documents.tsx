import { useCallback, useId, useState } from 'react';
import { Button } from '@mui/material';
import { DomLeaf } from './Common';
import { markdownView } from '../../../viewer/markdown.js';
import { renderMailBody } from '../../../../../public/mail-body.js';
import { loadImageCards } from '../../../../../public/attachments.js';
export { PreviewDialog } from './PreviewDialog';
import type { Attachment, Body } from '../api/types';
export function MarkdownView({ value = '', label = '문서' }: { value?: string; label?: string }) {
  const [source, setSource] = useState(false),
    id = useId();
  return (
    <div className="markdown-view">
      <div className="markdown-toolbar">
        <Button
          aria-label={label + (source ? ' 문서 보기' : ' 원문 보기')}
          aria-controls={id + '-body ' + id + '-source'}
          aria-pressed={source}
          onClick={() => setSource(!source)}
        >
          {source ? '문서 보기' : '원문 보기'}
        </Button>
      </div>
      <div id={id + '-body'} hidden={source}>
        <DomLeaf
          create={useCallback(
            () => markdownView(value, label).querySelector('.markdown-body') as HTMLElement,
            [value, label],
          )}
        />
      </div>
      <pre id={id + '-source'} className="markdown-source" hidden={!source}>
        {value}
      </pre>
    </div>
  );
}
export function MailBody({
  body,
  attachments,
  fetchAttachment,
}: {
  body: Body;
  attachments: Attachment[];
  fetchAttachment: (a: Attachment) => Promise<unknown>;
}) {
  return (
    <DomLeaf
      muiButtons
      create={useCallback(() => {
        const rendered = renderMailBody(body, attachments, fetchAttachment);
        void loadImageCards(rendered.cards);
        return rendered.element;
      }, [body, attachments, fetchAttachment])}
    />
  );
}
export function MailContent({
  body,
  text,
  attachments,
  fetchAttachment,
  fallbackHint = '본문 서식을 불러오지 못해 텍스트로 표시합니다.',
}: {
  body: Body;
  text?: string;
  attachments: Attachment[];
  fetchAttachment: (a: Attachment) => Promise<unknown>;
  fallbackHint?: string;
}) {
  return body.html ? (
    <MailBody body={body} attachments={attachments} fetchAttachment={fetchAttachment} />
  ) : (
    <>
      <pre>{text ?? '본문이 없습니다.'}</pre>
      {(body.unavailable || !!body.warnings?.length) && <p className="meta">{fallbackHint}</p>}
    </>
  );
}
