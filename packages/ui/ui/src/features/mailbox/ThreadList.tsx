import { Disclosure, DisclosureTitle } from '../../components/Controls';
import { ButtonBase, Chip } from '@mui/material';
import { useRef, useState } from 'react';
import {
  Draggable,
  Droppable,
  type DragStart,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
} from '@hello-pangea/dnd';
import { useSession, errorText } from '../../api/client';
import { date, type Mail, type MailPage, type Summary, type ThreadLink } from '../../api/types';
import { Action } from '../../components/Common';
import { useResource } from '../../hooks/async';
const mailDragId = (id: number) => 'mail:' + id;
const threadDropId = (id: string) => 'thread:' + id;
const detachDropId = 'thread-detach';
const identity = (mail: Mail) => ({
  id: mail.id,
  messageId: mail.messageId ?? null,
  fetchedAt: mail.fetchedAt,
});
function mailBadges(summary?: Summary): [string, string][] {
  const states: Record<string, [string, string]> = {
    queued: ['분석 대기', 'pending'],
    running: ['분석 중', 'pending'],
    needs_input: ['확인 필요', 'attention'],
    failed: ['최근 분석 실패', 'failed'],
  };
  const badges: [string, string][] = [];
  if (summary) {
    if (summary.handledAt) badges.push(['✓ 처리 완료', 'handled']);
    if (summary.completedCount > 0) badges.push(['✓ 분석 완료', 'completed']);
    if (states[summary.latestStatus ?? ''] && !summary.handledAt)
      badges.push(states[summary.latestStatus!]);
    if (summary.legacyCount > 0) badges.push(['이전 이력 ' + summary.legacyCount + '건', 'legacy']);
  }
  return badges;
}
function StatusChips({ badges }: { badges: [string, string][] }) {
  return badges.map(([text, kind]) => (
    <Chip
      component="span"
      key={text}
      className={'analysis-badge ' + kind}
      color={
        kind === 'handled' || kind === 'completed'
          ? 'success'
          : kind === 'failed'
            ? 'error'
            : kind === 'attention'
              ? 'warning'
              : kind === 'pending'
                ? 'info'
                : 'default'
      }
      variant={kind === 'handled' ? 'filled' : 'outlined'}
      label={text}
    />
  ));
}
export function Badges({
  summary,
  unavailable,
  mailId,
}: {
  summary?: Summary;
  unavailable: boolean;
  mailId: number;
}) {
  const badges: [string, string][] = unavailable
    ? [['이력 확인 불가', 'unavailable']]
    : mailBadges(summary);
  return (
    <span
      className="mail-analysis"
      data-mail-id={mailId}
      hidden={!badges.length}
      title={
        unavailable
          ? '분석 이력을 불러오지 못했습니다. 잠시 후 자동으로 다시 확인합니다.'
          : summary
            ? `분석 이력 ${summary.runCount}건 · 완료 ${summary.completedCount}건 · 연결된 이전 문서 ${summary.legacyCount}건. 분석 완료는 고객 업무 해결 여부와 별개입니다.`
            : undefined
      }
    >
      <StatusChips badges={badges} />
    </span>
  );
}
function ThreadBadges({
  emails,
  summaries,
  unavailable,
}: {
  emails: Mail[];
  summaries: Map<number, Summary>;
  unavailable: boolean;
}) {
  const counts = new Map<string, { kind: string; count: number }>();
  for (const mail of emails) {
    for (const [label, kind] of mailBadges(summaries.get(mail.id))) {
      const text = kind === 'legacy' ? '이전 이력' : label;
      counts.set(text, { kind, count: (counts.get(text)?.count ?? 0) + 1 });
    }
  }
  const badges: [string, string][] = unavailable
    ? [['이력 확인 불가', 'unavailable']]
    : Array.from(counts, ([text, { kind, count }]) => [`${text} ${count}/${emails.length}`, kind]);
  return (
    <span
      className="thread-analysis"
      hidden={!badges.length}
      title={
        unavailable
          ? '분석 이력을 불러오지 못했습니다. 잠시 후 자동으로 다시 확인합니다.'
          : '현재 대화에 표시된 메일 중 각 상태에 해당하는 메일 수입니다. 한 메일에 여러 상태가 표시될 수 있으며, 분석 완료는 고객 업무 해결 여부와 별개입니다.'
      }
    >
      <StatusChips badges={badges} />
    </span>
  );
}
export function useThreads(
  refresh: () => Promise<unknown>,
  enabled: boolean,
  page: MailPage | null,
  ready: boolean,
) {
  const { api, storeId } = useSession(),
    drag = useRef<{ mail: Mail; store: string; page: MailPage; source: string } | null>(null),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [undo, setUndo] = useState<{ id: string; store: string } | null>(null),
    [manager, setManager] = useState(false),
    [dragging, setDragging] = useState(false);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const links = useResource(
    (s) => api<ThreadLink[]>('/thread-links', undefined, s),
    storeId,
    enabled && manager,
  );
  const expanded = useRef(new Map<string, boolean>()),
    reveal = useRef<number | null>(null);
  const clear = () => {
    drag.current = null;
    setDragging(false);
    setActiveSource(null);
  };
  async function mutate(path: string, body: unknown, text: string, connect = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    clear();
    try {
      const result = await api<{ created?: boolean; link?: ThreadLink }>(path, body);
      setMessage(text);
      setUndo(
        connect && result.created && result.link ? { id: result.link.id, store: storeId } : null,
      );
      try {
        await refresh();
      } catch {
        setMessage('목록을 갱신하지 못했습니다. 다시 검색해 주세요. ' + text);
      }
      if (manager) await links.refresh();
    } catch (e) {
      setMessage(
        (connect ? '대화에 연결하지 못했습니다. ' : '연결을 해제하지 못했습니다. ') +
          errorText(e) +
          ' 다시 끌어다 놓아 주세요.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const remove = (id: string, store = storeId) =>
    store === storeId
      ? mutate(
          '/thread-links/' + encodeURIComponent(id) + '/unlink',
          { storeId: store },
          '수동 연결을 해제했습니다. 답장 헤더나 다른 연결이 있으면 같은 대화로 남을 수 있습니다.',
        )
      : Promise.resolve(setMessage('메일 저장소가 변경되었습니다. 다시 조회해 주세요.'));
  const canDrag = (mail: Mail, allowed: boolean) =>
    enabled && ready && !busy && allowed && typeof mail.fetchedAt === 'string';
  function onBeforeDragStart(start: DragStart) {
    clear();
    if (!enabled || !ready || lock.current || !page) return;
    const thread = page.threads?.find((t) => threadDropId(t.id) === start.source.droppableId);
    const mail = thread?.emails.find((m) => mailDragId(m.id) === start.draggableId);
    if (
      !thread ||
      !mail ||
      !canDrag(
        mail,
        !!mail.manualLinkIds?.length ||
          (thread.emails.length === 1 && (thread.totalMembers ?? 1) === 1),
      )
    )
      return;
    drag.current = { mail, store: storeId, page, source: start.source.droppableId };
    setDragging(!!mail.manualLinkIds?.length);
    setActiveSource(start.source.droppableId);
  }
  function onDragEnd(result: DropResult) {
    const item = drag.current;
    clear();
    // Only a drag started in this store and unchanged page can write a relation.
    if (
      result.reason !== 'DROP' ||
      !result.destination ||
      !item ||
      !enabled ||
      !ready ||
      lock.current ||
      item.store !== storeId ||
      item.page !== page ||
      result.draggableId !== mailDragId(item.mail.id) ||
      result.source.droppableId !== item.source
    )
      return;
    const destination = result.destination.droppableId;
    if (destination === item.source) return;
    if (destination === detachDropId) {
      if (!item.mail.manualLinkIds?.length) return;
      void mutate(
        '/thread-links/detach',
        { storeId, mail: identity(item.mail), linkIds: item.mail.manualLinkIds },
        `“${item.mail.subject}” 메일의 수동 연결을 해제했습니다. 자동 답장 관계는 유지됩니다.`,
      );
      return;
    }
    if (item.mail.manualLinkIds?.length) return;
    const target = page?.threads?.find((t) => threadDropId(t.id) === destination)?.emails[0];
    if (!target || target.id === item.mail.id) return;
    reveal.current = item.mail.id;
    void mutate(
      '/thread-links',
      { storeId, source: identity(item.mail), target: identity(target) },
      `“${item.mail.subject}” 메일을 “${target.subject}” 대화에 연결했습니다.`,
      true,
    );
  }
  return {
    expanded,
    reveal,
    canDrag,
    onBeforeDragStart,
    onDragEnd,
    dragging,
    activeSource,
    clear,
    dropDisabled: !enabled || !ready || busy || dragging,
    tools: (
      <div id="manual-thread-tools" hidden={!enabled} aria-busy={busy || undefined}>
        <Disclosure
          id="thread-link-manager"
          open={manager}
          onToggle={(e) => setManager(e.currentTarget.open)}
        >
          <DisclosureTitle>수동 연결 관리</DisclosureTitle>
          <div id="thread-link-list" aria-busy={links.loading}>
            {links.error ? (
              <>
                <p>{links.error}</p>
                <Action onAction={links.refresh}>다시 조회</Action>
              </>
            ) : links.data?.length ? (
              links.data.map((link) => (
                <div className="thread-link-row" key={link.id}>
                  <span>
                    {link.source.subject || '(제목 없음)'} ↔ {link.target.subject || '(제목 없음)'}
                  </span>
                  <Action disabled={busy} onAction={() => remove(link.id)}>
                    연결 해제
                  </Action>
                </div>
              ))
            ) : (
              <p className="meta">
                {links.loading ? '연결을 불러오는 중입니다…' : '저장된 수동 연결이 없습니다.'}
              </p>
            )}
          </div>
        </Disclosure>
      </div>
    ),
    status: (
      <div id="thread-action-status" role="status" aria-live="polite" hidden={!enabled}>
        {message && <span>{message}</span>}
        {undo && (
          <Action
            className="secondary-button"
            disabled={busy}
            onAction={() => remove(undo.id, undo.store)}
          >
            되돌리기
          </Action>
        )}
      </div>
    ),
  };
}
export function ThreadList({
  page,
  selected,
  summaries,
  unavailable,
  select,
  controls,
}: {
  page: MailPage;
  selected: number | null;
  summaries: Map<number, Summary>;
  unavailable: boolean;
  select: (id: number) => void;
  controls: ReturnType<typeof useThreads>;
}) {
  const [, renderExpansion] = useState(0);
  const button = (
    mail: Mail,
    allowed = false,
    provided?: DraggableProvided,
    snapshot?: DraggableStateSnapshot,
  ) => (
    <ButtonBase
      key={mail.id}
      type="button"
      data-mail-id={mail.id}
      ref={provided?.innerRef}
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      style={snapshot?.isDragging ? provided?.draggableProps.style : undefined}
      aria-current={selected === mail.id ? 'true' : undefined}
      title={
        allowed
          ? mail.manualLinkIds?.length
            ? '아래 해제 영역으로 끌어내어 수동 연결 해제'
            : '다른 대화에 끌어다 놓아 연결'
          : undefined
      }
      className={
        'mail' +
        (selected === mail.id ? ' is-selected' : '') +
        (allowed ? ' thread-draggable' : '') +
        (allowed && mail.manualLinkIds?.length ? ' thread-detachable' : '') +
        (snapshot?.isDragging ? ' thread-dragging' : '')
      }
      onClick={() => select(mail.id)}
    >
      <strong>{mail.subject || '(제목 없음)'}</strong>
      <span className="mail-meta">
        {(mail.from ?? []).map((x) => x.name ?? x.address).join(', ')} · {date(mail.sentAt)}
      </span>
      <Badges mailId={mail.id} summary={summaries.get(mail.id)} unavailable={unavailable} />
    </ButtonBase>
  );
  const draggable = (mail: Mail, index: number, allowed: boolean) => (
    <Draggable
      key={mail.id}
      draggableId={mailDragId(mail.id)}
      index={index}
      isDragDisabled={!controls.canDrag(mail, allowed)}
      disableInteractiveElementBlocking
    >
      {(provided, snapshot) => button(mail, controls.canDrag(mail, allowed), provided, snapshot)}
    </Draggable>
  );
  return (
    <>
      {page.threads
        ? page.threads.map((thread) => {
            const mail = thread.emails[0];
            if (!mail) return null;
            const open =
              controls.expanded.current.get(thread.id) ??
              thread.emails.some((m) => m.id === selected);
            // Each conversation is a destination, not a sortable list. Horizontal axes let
            // the keyboard's Up/Down keys move between vertically stacked conversations.
            return (
              <Droppable
                key={thread.id}
                droppableId={threadDropId(thread.id)}
                direction="horizontal"
                isDropDisabled={
                  controls.dropDisabled || controls.activeSource === threadDropId(thread.id)
                }
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={
                      (thread.emails.length === 1 ? 'thread-singleton' : 'thread-drop-zone') +
                      (snapshot.isDraggingOver ? ' thread-drop-target' : '')
                    }
                  >
                    {thread.emails.length === 1 ? (
                      draggable(
                        mail,
                        0,
                        (thread.totalMembers ?? 1) === 1 || !!mail.manualLinkIds?.length,
                      )
                    ) : (
                      <Disclosure
                        data-thread-id={thread.id}
                        className={
                          'mail-thread' +
                          (thread.emails.some((m) => m.id === selected) ? ' has-selected-mail' : '')
                        }
                        open={open}
                        onToggle={(e) => {
                          controls.expanded.current.set(thread.id, e.currentTarget.open);
                          if (e.currentTarget.open !== open) renderExpansion((v) => v + 1);
                        }}
                      >
                        <DisclosureTitle className="thread-summary">
                          <strong>{mail.subject || '(제목 없음)'}</strong>
                          <Chip
                            component="span"
                            className="thread-count"
                            label={thread.emails.length + '개 메일'}
                          />
                          <ThreadBadges
                            emails={thread.emails}
                            summaries={summaries}
                            unavailable={unavailable}
                          />
                          <span className="thread-meta">
                            {(mail.from ?? []).map((x) => x.name || x.address).join(', ')} ·{' '}
                            {date(mail.sentAt)}
                          </span>
                          {!!thread.manualLinkIds?.length && (
                            <Chip
                              component="span"
                              className="thread-manual-badge"
                              color="secondary"
                              variant="outlined"
                              label="수동 연결"
                            />
                          )}
                        </DisclosureTitle>
                        <div className="thread-members">
                          {thread.emails.map((m, i) =>
                            open ? draggable(m, i, !!m.manualLinkIds?.length) : button(m),
                          )}
                        </div>
                      </Disclosure>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            );
          })
        : page.emails.map((mail) => button(mail))}
    </>
  );
}
export function ThreadDetachZone({
  hidden,
  controls,
}: {
  hidden: boolean;
  controls: ReturnType<typeof useThreads>;
}) {
  return (
    <Droppable
      droppableId={detachDropId}
      direction="horizontal"
      isDropDisabled={hidden || !controls.dragging}
    >
      {(provided, snapshot) => (
        <div
          id="thread-detach-zone"
          ref={provided.innerRef}
          {...provided.droppableProps}
          hidden={hidden}
          className={
            (controls.dragging ? 'is-dragging' : '') +
            (snapshot.isDraggingOver ? ' thread-drop-target' : '')
          }
        >
          여기에 놓아 수동 연결 해제{provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}
