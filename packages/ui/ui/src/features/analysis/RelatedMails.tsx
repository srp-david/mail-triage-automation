import { Field, Panel, Disclosure, DisclosureTitle } from '../../components/Controls';
import { Button, Typography } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  date,
  type Attachment,
  type Body,
  type Mail,
  type MailPage,
  type Run,
} from '../../api/types';
import { errorText, SessionContext, useSession } from '../../api/client';
import { Action } from '../../components/Common';
import { MailContent } from '../../components/Documents';
const emptyAttachments: Attachment[] = [];
function RelatedMailContent({ mail, body }: { mail: Mail; body: Body }) {
  const { api } = useSession(),
    // A replaced mail response must discard stale attachment downloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    cache = useMemo(() => new Map<string, Promise<unknown>>(), [mail]);
  const fetchAttachment = useCallback(
    (file: Attachment) => {
      const key = file.attachmentId!;
      if (!cache.has(key))
        cache.set(
          key,
          api('/mails/' + mail.id + '/attachments/' + encodeURIComponent(key))
            .then((result: unknown) => {
              const value = result as { isError?: boolean; structuredContent?: { code?: string } };
              if (value.isError || value.structuredContent?.code) cache.delete(key);
              return result;
            })
            .catch((error) => {
              cache.delete(key);
              throw error;
            }),
        );
      return cache.get(key)!;
    },
    [api, mail.id, cache],
  );
  return (
    <div className="related-body">
      <MailContent
        body={body}
        text={mail.body}
        attachments={mail.attachments ?? emptyAttachments}
        fetchAttachment={fetchAttachment}
      />
    </div>
  );
}
const addresses = (items: Mail['from']) =>
  (items ?? []).map((x) => (x.name ? x.name + ' <' + x.address + '>' : x.address)).join(', ');
const metadata = (mail: Mail) =>
  '보낸 사람: ' +
  (addresses(mail.from) || '미확인') +
  ' · 받는 사람: ' +
  (addresses(mail.to) || '미확인') +
  ' · ' +
  date(mail.sentAt);
export function RelatedMails({ run, reload }: { run: Run; reload: () => Promise<unknown> }) {
  const session = useSession(),
    { api, storeId } = session,
    [picker, setPicker] = useState(false),
    [query, setQuery] = useState(''),
    [sender, setSender] = useState(''),
    [status, setStatus] = useState('');
  const [results, setResults] = useState<MailPage | null>(null),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      mail?: Mail;
      body?: Body;
      selectable: boolean;
      error?: string;
    } | null>(null);
  const searchVersion = useRef(0),
    previewVersion = useRef(0),
    trigger = useRef<HTMLElement | null>(null),
    previewRef = useRef<HTMLDivElement>(null),
    queries = useRef({ query: '', sender: '' });
  const links = run.relatedMails ?? [];
  useEffect(
    () => () => {
      searchVersion.current += 1;
      previewVersion.current += 1;
    },
    [],
  );
  async function showPreview(path: string, selectable: boolean) {
    const version = ++previewVersion.current;
    trigger.current = document.activeElement as HTMLElement;
    setPreview({ selectable });
    try {
      const mail = await api<Mail>(path);
      if (version !== previewVersion.current) return;
      // Linked previews first pass the existing link/source identity check above.
      const body = await api<Body>('/mails/' + mail.id + '/body').catch(
        () => ({ html: '', unavailable: true }) as Body,
      );
      if (version === previewVersion.current) setPreview({ mail, body, selectable });
    } catch (e) {
      if (version === previewVersion.current)
        setPreview({ selectable, error: '메일을 열 수 없습니다. ' + errorText(e) });
    }
  }
  useEffect(() => {
    if (preview?.mail) previewRef.current?.focus();
  }, [preview]);
  const close = () => {
    previewVersion.current += 1;
    setPreview(null);
    trigger.current?.focus();
  };
  async function search(start: number) {
    const version = ++searchVersion.current;
    previewVersion.current += 1;
    setPreview(null);
    setBusy(true);
    setStatus('');
    setResults(null);
    try {
      const data = await api<MailPage>(
        '/mails?' +
          new URLSearchParams({
            query: queries.current.query,
            from_address: queries.current.sender,
            limit: '20',
            offset: String(start),
          }),
      );
      if (version === searchVersion.current) {
        setResults(data);
        setOffset(start);
      }
    } catch (e) {
      if (version === searchVersion.current) setStatus(errorText(e));
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  }
  return (
    <SessionContext.Provider value={{ ...session, notice: setStatus }}>
      <Panel className="related-mails">
        <Disclosure>
          <DisclosureTitle>관련 메일 · {links.length}건</DisclosureTitle>
          <p className="meta">
            직접 선택해 연결한 메일입니다. 연결하거나 해제해도 분석 보고서와 처리 상태는 유지됩니다.
          </p>
          <div>
            {links.length ? (
              links.map((link) => (
                <div className="related-row" key={link.id}>
                  <div>
                    <strong>{link.metadata.subject}</strong>
                    <p className="meta">{metadata(link.metadata)}</p>
                    {link.available === false && (
                      <p className="meta">연결 당시 저장소가 달라 현재 열 수 없습니다.</p>
                    )}
                  </div>
                  <div className="related-controls">
                    <Action
                      aria-label={link.metadata.subject + ' 메일 보기'}
                      disabled={link.available === false}
                      onAction={() =>
                        showPreview('/runs/' + run.id + '/related-mails/' + link.id, false)
                      }
                    >
                      메일 보기
                    </Action>
                    <Action
                      aria-label={link.metadata.subject + ' 연결 해제'}
                      onAction={async () => {
                        await api('/runs/' + run.id + '/related-mails/' + link.id + '/unlink', {});
                        await reload();
                      }}
                    >
                      연결 해제
                    </Action>
                  </div>
                </div>
              ))
            ) : (
              <p className="meta">연결된 메일이 없습니다.</p>
            )}
          </div>
          <p className="related-status" role="status">
            {status}
          </p>
          {run.handled_at ? (
            <>
              <Button
                type="button"
                hidden={picker}
                disabled={run.store_id !== storeId}
                onClick={() => {
                  setPicker(true);
                }}
              >
                관련 메일 연결
              </Button>
              {run.store_id !== storeId && (
                <p className="meta">
                  현재 저장소와 분석 메일의 저장소가 달라 새 메일을 연결할 수 없습니다.
                </p>
              )}
              <div className="related-picker" hidden={!picker}>
                <p className="meta">
                  웹 앱에서 조회 가능한 메일을 검색하고 본문을 확인한 뒤 연결하세요.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    queries.current = { query: query.trim(), sender: sender.trim() };
                    void search(0);
                  }}
                >
                  <Field
                    type="search"
                    aria-label="관련 메일 검색어"
                    placeholder="제목·본문 검색어"
                    maxLength={1000}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Field
                    aria-label="관련 메일 발신자"
                    placeholder="발신자 이메일"
                    maxLength={320}
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                  />
                  <Button type="submit" disabled={busy}>
                    검색
                  </Button>
                </form>
                <div className="related-results">
                  {busy ? (
                    <p>메일을 검색하는 중입니다…</p>
                  ) : results?.emails.length ? (
                    results.emails.map((mail) => {
                      const own =
                          run.identity_kind !== 'outlook' &&
                          run.store_id === storeId &&
                          Number(run.mail_id) === Number(mail.id),
                        linked = links.some(
                          (x) => x.store_id === storeId && Number(x.mail_id) === Number(mail.id),
                        );
                      return (
                        <Button
                          key={mail.id}
                          className="related-candidate"
                          disabled={own || linked}
                          onClick={() => void showPreview('/mails/' + mail.id, true)}
                        >
                          {mail.subject}
                          <span className="meta">{metadata(mail)}</span>
                          {(own || linked) && (
                            <span className="meta">{own ? '현재 분석 메일' : '이미 연결됨'}</span>
                          )}
                        </Button>
                      );
                    })
                  ) : (
                    results && <p>검색된 메일이 없습니다. 검색어나 발신자를 바꿔 주세요.</p>
                  )}
                </div>
                <div className="related-controls">
                  <Action
                    disabled={busy || offset === 0}
                    onAction={() => search(Math.max(0, offset - 20))}
                  >
                    이전 후보
                  </Action>
                  <Action
                    disabled={busy || results?.nextOffset == null}
                    onAction={() => search(results!.nextOffset!)}
                  >
                    다음 후보
                  </Action>
                </div>
                <Button
                  onClick={() => {
                    searchVersion.current += 1;
                    close();
                    setPicker(false);
                    setBusy(false);
                  }}
                >
                  선택 취소
                </Button>
              </div>
            </>
          ) : (
            <p className="meta">새 메일 연결은 처리 완료 후 가능합니다.</p>
          )}
          <div className="related-preview" ref={previewRef} tabIndex={-1} hidden={!preview}>
            {preview && (
              <>
                <Button onClick={close}>본문 닫기</Button>
                {preview.mail && preview.body ? (
                  <>
                    <Typography component="h4" variant="h4">
                      {preview.mail.subject}
                    </Typography>
                    <p className="meta">{metadata(preview.mail)}</p>
                    <RelatedMailContent mail={preview.mail} body={preview.body} />
                    {!!preview.mail.warnings?.length && (
                      <p className="meta">조회 경고: {preview.mail.warnings.join(', ')}</p>
                    )}
                    {preview.selectable && (
                      <Action
                        disabled={
                          !preview.mail.messageId || !Number.isSafeInteger(Number(preview.mail.id))
                        }
                        onAction={async () => {
                          await api('/runs/' + run.id + '/related-mails', {
                            storeId,
                            mailId: Number(preview.mail!.id),
                            messageId: preview.mail!.messageId,
                          });
                          await reload();
                        }}
                      >
                        이 메일 연결
                      </Action>
                    )}
                  </>
                ) : (
                  <p>{preview.error || '메일 본문을 불러오는 중입니다…'}</p>
                )}
              </>
            )}
          </div>
        </Disclosure>
      </Panel>
    </SessionContext.Provider>
  );
}
