import { previewImageType } from './attachments.js';
export const PREVIEW_LIMIT = 5 * 1024 * 1024;
export function previewFormat(attachment) {
  if (previewImageType(attachment)) return 'image';
  const extension = /\.([^.]+)$/.exec(String(attachment.filename ?? ''))?.[1].toLowerCase();
  return ['docx', 'pptx', 'xlsx'].includes(extension) ? extension : null;
}
let activeClose;
export function closeOfficePreview() { activeClose?.(); }
export function openOfficePreview(attachment, loadFile, download) {
  closeOfficePreview();
  const format = previewFormat(attachment);
  if (!format || !attachment.attachmentId || attachment.size > PREVIEW_LIMIT) return;
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'office-preview';
  dialog.setAttribute('aria-labelledby', 'preview-title');
  const head = document.createElement('div'); head.className = 'preview-head';
  const title = document.createElement('h2'); title.id = 'preview-title'; title.textContent = attachment.filename;
  const controls = document.createElement('div'); controls.className = 'preview-controls';
  const save = document.createElement('button'); save.textContent = '원본 다운로드'; save.type = 'button';
  const retry = document.createElement('button'); retry.textContent = '다시 시도'; retry.type = 'button'; retry.hidden = true;
  const close = document.createElement('button'); close.textContent = '닫기'; close.type = 'button'; close.autofocus = true;
  controls.append(save, retry, close); head.append(title, controls);
  const hint = document.createElement('p'); hint.className = 'preview-hint';
  hint.textContent = format === 'image' ? '이미지 미리보기' : '읽기 전용 미리보기 · 원본과 서식이 다를 수 있습니다.';
  const status = document.createElement('p'); status.className = 'preview-status'; status.setAttribute('role', 'status');
  const viewport = document.createElement('div'); viewport.className = 'preview-viewport';
  if (format === 'image') viewport.classList.add('image-preview-viewport');
  dialog.append(head, hint, status, viewport); document.body.append(dialog);
  let controller, timer, frame, generation = 0, closed = false;
  const finish = () => {
    if (closed) return; closed = true; ++generation;
    controller?.abort(); clearTimeout(timer); window.removeEventListener('message', receive);
    viewport.replaceChildren(); dialog.remove(); document.body.classList.remove('preview-open');
    if (previousFocus?.isConnected) previousFocus.focus();
    if (activeClose === finish) activeClose = undefined;
  };
  function fail(message) {
    clearTimeout(timer); controller?.abort(); viewport.replaceChildren(); frame = null;
    status.hidden = false; status.textContent = message; retry.hidden = false;
  }
  function receive(event) {
    if (event.source !== frame?.contentWindow || event.origin !== location.origin || event.data?.type !== 'office-preview') return;
    if (event.data.state === 'close') finish();
    else if (event.data.state === 'loaded') { clearTimeout(timer); status.hidden = true; }
    else if (event.data.state === 'error') fail('문서를 표시하지 못했습니다. 다시 시도하거나 원본을 다운로드해 주세요.');
  }
  async function start() {
    const current = ++generation;
    controller?.abort(); clearTimeout(timer); viewport.replaceChildren(); frame = null;
    controller = new AbortController(); retry.hidden = true; status.hidden = false;
    status.textContent = '첨부파일을 가져오는 중입니다…';
    timer = setTimeout(() => { ++generation; fail('미리보기 시간이 초과되었습니다. 다시 시도하거나 원본을 다운로드해 주세요.'); }, 60000);
    try {
      const blob = await loadFile(attachment, controller.signal);
      if (blob.size > PREVIEW_LIMIT) throw new Error('미리보기는 파일당 5 MiB까지 지원합니다.');
      if (closed || current !== generation) return;
      if (format === 'image') {
        const source = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
          reader.readAsDataURL(new Blob([blob], {type: previewImageType(attachment)}));
        });
        if (closed || current !== generation) return;
        status.textContent = '이미지를 여는 중입니다…';
        const image = document.createElement('img'); image.alt = attachment.filename || '첨부 이미지';
        image.onload = () => {
          if (closed || current !== generation) return;
          clearTimeout(timer); status.hidden = true;
        };
        image.onerror = () => {
          if (!closed && current === generation) fail('이미지를 표시하지 못했습니다. 다시 시도하거나 원본을 다운로드해 주세요.');
        };
        image.src = source; viewport.append(image);
        return;
      }
      const buffer = await blob.arrayBuffer();
      if (closed || current !== generation) return;
      if (buffer.byteLength < 4 || new DataView(buffer).getUint32(0, true) !== 0x04034b50)
        throw new Error('지원하는 Office 문서가 아니거나 암호화된 파일입니다. 원본을 다운로드해 주세요.');
      status.textContent = '문서를 여는 중입니다…';
      frame = document.createElement('iframe'); frame.title = attachment.filename + ' 미리보기';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.referrerPolicy = 'no-referrer';
      const ownFrame = frame;
      const send = event => {
        if (current !== generation || closed || event.source !== ownFrame.contentWindow || event.origin !== location.origin ||
            event.data?.type !== 'office-preview' || event.data.state !== 'ready') return;
        window.removeEventListener('message', send);
        ownFrame.contentWindow.postMessage({type: 'office-preview-file', format, filename: attachment.filename, buffer}, location.origin, [buffer]);
      };
      window.addEventListener('message', send, {signal: controller.signal});
      frame.src = '/preview/'; viewport.append(frame);
    } catch (error) { if (!closed && current === generation) fail(error.message || '미리보기를 불러오지 못했습니다.'); }
  }
  save.onclick = async () => {
    save.disabled = true;
    try { await download(attachment); }
    catch (error) { status.hidden = false; status.textContent = error.message || '다운로드에 실패했습니다.'; }
    finally { save.disabled = false; }
  };
  retry.onclick = () => void start(); close.onclick = finish;
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  dialog.addEventListener('close', finish);
  window.addEventListener('message', receive); activeClose = finish;
  document.body.classList.add('preview-open'); dialog.showModal(); void start();
}
