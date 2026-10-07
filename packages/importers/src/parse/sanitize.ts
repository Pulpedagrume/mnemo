import type { NoteCtx } from './context';
import { t } from './issue';
import { isPlainObject } from './text';

const DANGEROUS_BLOCKS = /<(script|iframe|style|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_TAGS = /<\/?(script|iframe|style|object|embed)\b[^>]*>?/gi;
const EVENT_ATTR = /(<[a-zA-Z][^>]*?)\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g;
const SCRIPT_URL =
  /((?:\]\(|\b(?:href|src|action|formaction|xlink:href)\s*=\s*["']?)\s*)(?:javascript|vbscript|data:text\/html)\s*:?/gi;

/** Code spans and fenced blocks are text, not HTML: they are kept as is. */
const CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`)/g;

function sanitizeHtml(s: string): string {
  let out = s.replace(DANGEROUS_BLOCKS, '').replace(DANGEROUS_TAGS, '');
  let prev: string;
  do {
    prev = out;
    out = out.replace(EVENT_ATTR, '$1');
  } while (out !== prev);
  return out.replace(SCRIPT_URL, '$1#');
}

/** Removes dangerous HTML outside code spans/blocks. Returns the same string when clean. */
export function sanitizeString(s: string): string {
  if (!s.includes('<') && !/script|data:text/i.test(s)) return s;
  const parts = s.split(CODE);
  return parts.map((part, i) => (i % 2 === 1 ? part : sanitizeHtml(part))).join('');
}

function walk(
  value: unknown,
  path: PropertyKey[],
  onChange: (path: PropertyKey[]) => void,
): unknown {
  if (typeof value === 'string') {
    const clean = sanitizeString(value);
    if (clean !== value) onChange(path);
    return clean;
  }
  if (Array.isArray(value)) return value.map((v, i) => walk(v, [...path, i], onChange));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, [...path, k], onChange);
    return out;
  }
  return value;
}

/**
 * Strips `<script>`, `<iframe>`, `<style>`, `<object>`, `<embed>`, `on*=` attributes and
 * `javascript:` URLs from every string of a note (info `html_sanitized` per field).
 */
export function sanitizeNote(note: Record<string, unknown>, ctx: NoteCtx): Record<string, unknown> {
  return walk(note, [], (path) => {
    ctx.sink.info(
      'html_sanitized',
      t(
        'HTML dangereux supprimé (script, iframe, style, object, attributs on*, liens javascript:).',
        'Dangerous HTML removed (script, iframe, style, object, on* attributes, javascript: links).',
      ),
      t(
        'Écrivez le contenu en Markdown, sans balises HTML actives.',
        'Write the content in Markdown, without active HTML tags.',
      ),
      ctx.loc(path),
    );
  }) as Record<string, unknown>;
}
