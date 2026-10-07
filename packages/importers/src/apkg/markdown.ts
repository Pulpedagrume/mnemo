/**
 * Mnemo Markdown → Anki field HTML (the subset Anki displays without add-ons): emphasis, code,
 * links, images (`media:<id>` → `<img src="file">`), lists, rules, math (`$…$` → `\(…\)`).
 * Raw HTML tags already present in the field are kept; other `<`/`&` are escaped.
 */

const escapeHtml = (s: string): string =>
  s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/<(?!\/?[A-Za-z][^<>]*>)/g, '&lt;');
const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export type MediaFileName = (id: string) => string | undefined;

class Protector {
  private readonly items: string[] = [];
  put(html: string): string {
    this.items.push(html);
    return `${this.items.length - 1}`;
  }
  restore(s: string): string {
    let out = s;
    while (/\d+/.test(out))
      out = out.replace(/(\d+)/g, (_a, i: string) => this.items[Number(i)] ?? '');
    return out;
  }
}

function inline(src: string, media: MediaFileName, p: Protector): string {
  let s = src
    .replace(/\\([\\`*_{}[\]()#+\-.!$<>~|])/g, (_a, c: string) => p.put(escapeHtml(c)))
    .replace(/`([^`]+)`/g, (_a, code: string) => p.put(`<code>${escapeHtml(code)}</code>`))
    .replace(/\$\$([^$]+)\$\$/g, (_a, tex: string) => p.put(`\\[${escapeHtml(tex)}\\]`))
    .replace(/\$(\S(?:[^$]*\S)?)\$(?!\d)/g, (_a, tex: string) => p.put(`\\(${escapeHtml(tex)}\\)`))
    .replace(
      /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
      (_a, alt: string, url: string) => {
        const ref = /^media:(.+)$/.exec(url);
        const file = ref ? media(ref[1] ?? '') : url;
        if (file === undefined) return '';
        const altAttr = alt === '' ? '' : ` alt="${escapeAttr(alt)}"`;
        return p.put(`<img src="${escapeAttr(file)}"${altAttr}>`);
      },
    )
    .replace(
      /\[([^\]]+)\]\(\s*<?([^)\s>]+)>?\s*\)/g,
      (_a, label: string, url: string) =>
        p.put(`<a href="${escapeAttr(url)}">`) + label + p.put('</a>'),
    );
  s = escapeHtml(s)
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}])/gu, '$1<b>$2</b>')
    .replace(/\*(?=\S)([^*]*?\S)\*/g, '<i>$1</i>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}])/gu, '$1<i>$2</i>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  return s;
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** Converts a Markdown field to Anki HTML. */
export function markdownToAnkiHtml(md: string, media: MediaFileName): string {
  const p = new Protector();
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const parts: { html: string; block: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      const code: string[] = [];
      for (i++; i < lines.length && !(lines[i] ?? '').trim().startsWith(fence.slice(0, 3)); i++)
        code.push(lines[i] ?? '');
      parts.push({
        html: p.put(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`),
        block: true,
      });
      continue;
    }
    if (line.trim() === '$$') {
      const tex: string[] = [];
      for (i++; i < lines.length && (lines[i] ?? '').trim() !== '$$'; i++) tex.push(lines[i] ?? '');
      parts.push({ html: p.put(`\\[${escapeHtml(tex.join('\n'))}\\]`), block: true });
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      parts.push({ html: '<hr>', block: true });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = LIST_ITEM.exec(lines[i] ?? '');
        if (!m || /^\s*\d/.test(lines[i] ?? '') !== ordered) break;
        items.push(`<li>${inline(m[3] ?? '', media, p)}</li>`);
      }
      i--;
      const tag = ordered ? 'ol' : 'ul';
      parts.push({ html: `<${tag}>${items.join('')}</${tag}>`, block: true });
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const html = heading ? `<b>${inline(heading[1] ?? '', media, p)}</b>` : inline(line, media, p);
    parts.push({ html, block: false });
  }
  let out = '';
  parts.forEach((part, i) => {
    const prev = parts[i - 1];
    if (i > 0 && prev && !prev.block && !part.block) out += '<br>';
    out += part.html;
  });
  return p.restore(out).replace(/(<br>)+$/, '');
}
