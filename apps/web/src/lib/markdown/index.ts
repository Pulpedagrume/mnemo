import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { mathPlugin } from './math';

for (const [name, lang] of Object.entries({
  bash,
  c,
  cpp,
  css,
  java,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
  yaml,
})) {
  hljs.registerLanguage(name, lang);
}
hljs.registerAliases(['sh', 'shell', 'console'], { languageName: 'bash' });
hljs.registerAliases(['js'], { languageName: 'javascript' });
hljs.registerAliases(['ts'], { languageName: 'typescript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['html'], { languageName: 'xml' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const md = new MarkdownIt({
  html: true, // raw HTML is allowed but sanitized below with a strict allowlist
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    }
    return escapeHtml(code);
  },
}).use(mathPlugin);

export interface RenderOptions {
  /** Resolves `media:<id>` image sources to displayable URLs (e.g. blob: URLs). */
  resolveMedia?: (id: string) => string | undefined;
  /** Remote (http/https) images are blocked unless explicitly allowed. */
  allowRemoteImages?: boolean;
}

const ALLOWED_TAGS = [
  ...['p', 'br', 'hr', 'span', 'div', 'blockquote', 'pre', 'code', 'kbd', 'mark', 'small'],
  ...['strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup', 'a', 'img'],
  ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd'],
  ...['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'],
  // KaTeX output (HTML + MathML)
  ...['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace'],
  ...['msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover'],
  ...['mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'svg', 'path', 'line'],
];
const ALLOWED_ATTR = [
  ...['href', 'title', 'alt', 'src', 'class', 'style', 'aria-hidden', 'colspan', 'rowspan'],
  ...['align', 'start', 'encoding', 'mathvariant', 'xmlns', 'display', 'width', 'height'],
  ...['viewBox', 'preserveAspectRatio', 'd', 'x1', 'x2', 'y1', 'y2', 'stroke-width'],
];

function sanitize(html: string, opts: RenderOptions): string {
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|media:|blob:|data:image\/(?:png|jpe?g|gif|webp);|#)/i,
    RETURN_DOM_FRAGMENT: true,
  });
  for (const img of Array.from(fragment.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('media:')) {
      const url = opts.resolveMedia?.(src.slice('media:'.length));
      if (url) img.setAttribute('src', url);
      else img.replaceWith(missingImage(img.getAttribute('alt')));
    } else if (/^https?:/i.test(src) && !opts.allowRemoteImages) {
      img.replaceWith(missingImage(img.getAttribute('alt')));
    }
    img.setAttribute('loading', 'lazy');
  }
  for (const a of Array.from(fragment.querySelectorAll('a'))) {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

function missingImage(alt: string | null): HTMLElement {
  const span = document.createElement('span');
  span.className = 'media-missing';
  span.textContent = `[${alt ?? 'image'}]`;
  return span;
}

/** Markdown (GFM-ish + KaTeX + code highlighting) to sanitized HTML. Input is untrusted. */
export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  return sanitize(md.render(source), opts);
}

/** Inline variant (no wrapping paragraph), for short labels such as MCQ choices. */
export function renderMarkdownInline(source: string, opts: RenderOptions = {}): string {
  return sanitize(md.renderInline(source), opts);
}
