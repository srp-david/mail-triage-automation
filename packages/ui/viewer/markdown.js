import { Marked } from 'marked';
import DOMPurify from 'dompurify';

let sequence = 0;
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// Escape raw HTML before parsing into DOM: it must never initiate a resource request.
const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html: (token) => escape(token.text),
    image: (token) => escape('[이미지: ' + (token.text || '설명 없음') + ']'),
  },
});

export function markdownView(value, label = '문서') {
  const source = String(value ?? '');
  const root = document.createElement('div');
  root.className = 'markdown-view';
  const body = document.createElement('div');
  body.className = 'markdown-body';
  body.id = 'markdown-body-' + ++sequence;
  const html = markdown.parse(source);
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'em',
      'del',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'input',
    ],
    ALLOWED_ATTR: ['href', 'title', 'start', 'type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  for (const link of fragment.querySelectorAll('a')) {
    const href = link.getAttribute('href') ?? '';
    let safe = false;
    try {
      const url = new URL(href);
      safe =
        /^https?:\/\//i.test(href) &&
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password;
    } catch {
      // Malformed URLs remain unsafe and lose their href below.
    }
    if (safe) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else link.removeAttribute('href');
  }
  for (const input of fragment.querySelectorAll('input')) {
    if (input.type !== 'checkbox') {
      input.remove();
      continue;
    }
    input.disabled = true;
    input.setAttribute('aria-label', input.checked ? '완료' : '미완료');
  }
  for (const table of fragment.querySelectorAll('table')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', '표 (가로 스크롤 가능)');
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
  body.append(fragment);
  const raw = document.createElement('pre');
  raw.className = 'markdown-source';
  raw.textContent = source;
  raw.hidden = true;
  raw.id = 'markdown-source-' + sequence;
  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-toolbar';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '원문 보기';
  toggle.setAttribute('aria-label', label + ' 원문 보기');
  toggle.setAttribute('aria-controls', body.id + ' ' + raw.id);
  toggle.setAttribute('aria-pressed', 'false');
  toggle.onclick = () => {
    const showSource = raw.hidden;
    raw.hidden = !showSource;
    body.hidden = showSource;
    toggle.textContent = showSource ? '문서 보기' : '원문 보기';
    toggle.setAttribute('aria-label', label + (showSource ? ' 문서 보기' : ' 원문 보기'));
    toggle.setAttribute('aria-pressed', String(showSource));
  };
  toolbar.append(toggle);
  root.append(toolbar, body, raw);
  return root;
}
