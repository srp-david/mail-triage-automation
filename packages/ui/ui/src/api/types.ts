export interface Address {
  name?: string;
  address?: string;
}
export interface Attachment {
  attachmentId: string | null;
  filename?: string;
  contentType?: string;
  size: number;
}
export interface Mail {
  id: number;
  subject: string;
  messageId?: string;
  fetchedAt?: string;
  sentAt?: string;
  from?: Address[];
  to?: Address[];
  body?: string;
  attachments?: Attachment[];
  warnings?: string[];
  manualLinkIds?: string[];
}
export interface Body {
  html: string;
  inlineImages?: { contentId: string; attachmentId: string }[];
  warnings?: string[];
  unavailable?: boolean;
}
export interface Thread {
  id: string;
  emails: Mail[];
  totalMembers?: number;
  manualLinkIds?: string[];
}
export interface MailPage {
  emails: Mail[];
  threads?: Thread[];
  total: number;
  mailTotal?: number;
  nextOffset: number | null;
}
export interface Summary {
  mailId: number;
  runCount: number;
  completedCount: number;
  legacyCount: number;
  latestStatus?: string;
  handledAt?: string;
}
export interface ProgressEvent {
  kind: string;
  outcome: string;
  at: string;
}
export interface RelatedLink {
  id: string;
  store_id: string;
  mail_id: number;
  available?: boolean;
  metadata: Mail;
}
export interface Run {
  id: string;
  subject: string;
  status: string;
  source?: string;
  store_id: string;
  mail_id: number;
  message_id?: string;
  identity_kind?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
  heartbeat_at?: string;
  handled_at?: string;
  error?: string;
  progress_events?: ProgressEvent[];
  result?: { report: string; question?: string; knowledge?: string };
  reviews?: { author: string; authorDisplay?: string; body: string }[];
  relatedMails?: RelatedLink[];
}
export interface Legacy {
  id: string;
  title?: string;
  source_path: string;
  source_hash?: string;
  body?: string;
  mail_key?: string;
}
export interface Sync {
  id: string;
  status: string;
  saved: number;
  failed: number;
  remaining: number | null;
  batch_count?: number;
  started_at?: string;
  finished_at?: string;
  retry_count?: number;
  next_attempt_at?: string;
  uncertain?: boolean;
  detail?: { reason?: string; serverCount?: number; serverStored?: number };
}
export interface Status {
  storeId: string;
  originalAvailable?: boolean;
  worker?: { online?: boolean; state?: string };
  sync: Sync | null;
}
export interface ThreadLink {
  id: string;
  source: Mail;
  target: Mail;
}
export type Api = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
export const labels: Record<string, string> = {
  queued: '대기',
  running: '분석 중',
  completed: '분석 완료',
  needs_input: '확인 필요',
  failed: '실패',
  partial: '일부 미완료',
  cancelled: '취소',
};
export const activeRun = (status?: string) => status === 'queued' || status === 'running';
export const activeSync = (sync?: Sync | null) =>
  !!sync && ['queued', 'running', 'retrying', 'stopping'].includes(sync.status);
export const date = (value?: string) =>
  value ? new Date(value).toLocaleString('ko-KR') : '날짜 미확인';
export const legacyTitle = (item: Legacy) =>
  item.title || item.source_path?.split(/[\\/]/).pop() || '이전 문서';
