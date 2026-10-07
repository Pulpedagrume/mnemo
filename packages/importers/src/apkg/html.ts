/**
 * Anki field HTML → Mnemo Markdown. The common formatting subset (b/i/u/br/div/p/lists/img/a/
 * sub/sup/code) is converted; `span`/`font` wrappers are dropped (their text is kept); any other
 * tag is kept as raw HTML (sanitized later by the import pipeline and at display time).
 */

export interface HtmlToMarkdownResult {
  text: string;
  /** Image file names referenced by the field, in order (unresolved ones included). */
  images: string[];
  /** `[sound:…]` file names that were removed. */
  sounds: string[];
  /** Raw HTML tags were kept. */
  keptHtml: boolean;
  /** `span`/`font` styling was dropped. */
  droppedStyle: boolean;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  times: '×',
  divide: '÷',
  deg: '°',
  euro: '€',
  copy: '©',
  reg: '®',
  shy: '',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, ref: string) => {
    if (ref.startsWith('#')) {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : all;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? all;
  });
}

const TOKEN =
  /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
const MATH = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
const SOUND = /\[sound:([^\]]*)\]/g;
const DROPPED_BLOCKS = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const INLINE_MARKERS: Readonly<Record<string, string>> = {
  b: '**',
  strong: '**',
  i: '*',
  em: '*',
  code: '`',
};
const KEPT_INLINE = new Set(['u', 'sub', 'sup', 's', 'del', 'ins', 'mark', 'kbd', 'small']);
const STYLE_ONLY = new Set(['span', 'font']);
const VOID_IGNORED = new Set(['wbr', 'meta', 'link']);

/** Reads one attribute value from a tag's attribute string. */
export function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attrs);
  if (!m) return undefined;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

/** Escapes the Markdown syntax that plain Anki text could trigger by accident. */
function escapeText(text: string, atLineStart: boolean): string {
  let out = text
    .replace(/[\\`*$]/g, '\\$&')
    .replace(/(^|[^\p{L}\p{N}])_|_(?=[^\p{L}\p{N}]|$)/gu, (m) => m.replace('_', '\\_'))
    .replace(/\]\(/g, '\\](')
    .replace(/!\[/g, '!\\[')
    .replace(/</g, '&lt;');
  if (atLineStart) out = out.replace(/^(\s*)([#>+-]|\d+\.)(?=\s)/, '$1\\$2');
  return out;
}

function textWithMath(text: string, atLineStart: boolean): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(MATH)) {
    out += escapeText(text.slice(last, m.index), atLineStart && last === 0);
    out += m[1] !== undefined ? `$${m[1].trim()}$` : `$$${(m[2] ?? '').trim()}$$`;
    last = m.index + m[0].length;
  }
  return out + escapeText(text.slice(last), atLineStart && last === 0);
}

interface Open {
  tag: string;
  pos: number;
  marker?: string;
  href?: string;
}

class Writer {
  out = '';
  private readonly stack: Open[] = [];
  private readonly lists: { ordered: boolean; n: number }[] = [];

  atLineStart(): boolean {
    return this.out === '' || this.out.endsWith('\n');
  }

  newline(): void {
    if (!this.atLineStart()) this.out += '\n';
  }

  blankLine(): void {
    if (this.out === '') return;
    this.newline();
    if (!this.out.endsWith('\n\n')) this.out += '\n';
  }

  open(o: Omit<Open, 'pos'>): void {
    this.stack.push({ ...o, pos: this.out.length });
  }

  /** Wraps what was written since the opening tag, moving outer whitespace outside the markers. */
  close(tag: string): void {
    const i = this.stack.map((s) => s.tag).lastIndexOf(tag);
    if (i < 0) return;
    const [o] = this.stack.splice(i);
    if (!o) return;
    const content = this.out.slice(o.pos);
    const core = content.trim();
    if (core === '') return;
    const lead = /^\s*/.exec(content)?.[0] ?? '';
    const trail = /\s*$/.exec(content)?.[0] ?? '';
    const wrapped =
      o.href !== undefined ? `[${core}](${o.href})` : `${o.marker ?? ''}${core}${o.marker ?? ''}`;
    this.out = this.out.slice(0, o.pos) + lead + wrapped + trail;
  }

  listOpen(ordered: boolean): void {
    this.newline();
    this.lists.push({ ordered, n: 0 });
  }

  listClose(): void {
    this.lists.pop();
    this.newline();
  }

  listItem(): void {
    this.newline();
    const list = this.lists[this.lists.length - 1] ?? { ordered: false, n: 0 };
    list.n += 1;
    const indent = '   '.repeat(Math.max(0, this.lists.length - 1));
    this.out += `${indent}${list.ordered ? `${list.n}.` : '-'} `;
  }
}

function safeHref(href: string | undefined): string | undefined {
  if (href === undefined || !/^(https?:|mailto:)/i.test(href.trim())) return undefined;
  return href.trim().replace(/[()\s]/g, encodeURIComponent);
}

/**
 * Converts an Anki field. `imageRef` maps an image file name to the Markdown reference to use
 * (e.g. `media:<id>`), or undefined when the file is not available (the image is then dropped).
 */
export function ankiHtmlToMarkdown(
  html: string,
  imageRef: (fileName: string) => string | undefined,
): HtmlToMarkdownResult {
  const result: HtmlToMarkdownResult = {
    text: '',
    images: [],
    sounds: [],
    keptHtml: false,
    droppedStyle: false,
  };
  let src = html.replace(SOUND, (_all, name: string) => {
    result.sounds.push(name.trim());
    return '';
  });
  src = src.replace(DROPPED_BLOCKS, () => {
    result.keptHtml = true;
    return '';
  });
  const w = new Writer();
  for (const m of src.matchAll(TOKEN)) {
    const raw = m[0];
    const tag = m[2]?.toLowerCase();
    if (raw.startsWith('<!--')) continue;
    if (tag === undefined) {
      const text = decodeEntities(raw).replace(/[ \t\r\n\u00a0]+/g, ' ');
      const value = w.atLineStart() ? text.replace(/^ +/, '') : text;
      if (value !== '') w.out += textWithMath(value, w.atLineStart());
      continue;
    }
    const closing = m[1] === '/';
    const attrs = m[3] ?? '';
    if (tag === 'br') {
      w.out = w.out.replace(/ +$/, '') + '\n';
    } else if (tag === 'div' || tag === 'li' || /^h[1-6]$/.test(tag) || tag === 'blockquote') {
      if (tag === 'li' && !closing) w.listItem();
      else w.newline();
    } else if (tag === 'hr') {
      w.blankLine();
      w.out += '---\n\n';
    } else if (tag === 'p') {
      w.blankLine();
    } else if (tag === 'ul' || tag === 'ol') {
      if (closing) w.listClose();
      else w.listOpen(tag === 'ol');
    } else if (tag === 'img') {
      const file = attr(attrs, 'src');
      if (file === undefined || file === '') continue;
      result.images.push(file);
      const ref = imageRef(file);
      if (ref !== undefined) {
        const alt = (attr(attrs, 'alt') ?? '').replace(/[[\]\\]/g, '');
        w.out += `![${alt}](${ref})`;
      }
    } else if (tag === 'a') {
      if (closing) w.close('a');
      else {
        const href = safeHref(attr(attrs, 'href'));
        w.open(href === undefined ? { tag: 'a', marker: '' } : { tag: 'a', href });
      }
    } else if (INLINE_MARKERS[tag] !== undefined) {
      if (closing) w.close(tag);
      else w.open({ tag, marker: INLINE_MARKERS[tag] });
    } else if (KEPT_INLINE.has(tag)) {
      w.out += `<${closing ? '/' : ''}${tag}>`;
    } else if (STYLE_ONLY.has(tag)) {
      if (!closing && attrs.trim() !== '') result.droppedStyle = true;
    } else if (!VOID_IGNORED.has(tag)) {
      result.keptHtml = true;
      w.out += raw;
    }
  }
  result.text = w.out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, '').replace(/(\S) {2,}/g, '$1 '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return result;
}
