import type { ImportFormat } from '../../api';
import { t, type IssueSink } from '../issue';

/** Text after the generic cleanup, with the number of lines removed before it. */
export interface CleanText {
  text: string;
  /** Lines removed above `text` (add it to 1-based lines computed on `text`). */
  lineOffset: number;
}

/** Removes a byte-order mark and normalizes line endings to `\n`. */
export function normalizeText(input: string, sink: IssueSink): string {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) {
    // A BOM is harmless and never content: removed even in strict mode, with a notice.
    text = text.slice(1);
    sink.warn(
      'bom_removed',
      t(
        'Marque d’ordre des octets (BOM) supprimée en début de fichier.',
        'Byte-order mark (BOM) removed at the start of the file.',
      ),
      t(
        'Rien à faire ; enregistrez de préférence en UTF-8 sans BOM.',
        'Nothing to do; preferably save as UTF-8 without BOM.',
      ),
    );
  }
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

const LANGS = /^(json|json5|jsonc|yaml|yml|markdown|md|csv|tsv)$/i;
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})[ \t]*([A-Za-z0-9]*)[ \t]*$/;

interface Fence {
  start: number;
  marker: string;
  lang: string;
}

function findOpening(lines: readonly string[]): Fence | undefined {
  const firstContent = lines.findIndex((l) => l.trim() !== '');
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_LINE.exec(lines[i] ?? '');
    if (!m) continue;
    const lang = (m[2] ?? '').toLowerCase();
    if (LANGS.test(lang) || (lang === '' && i === firstContent)) {
      return { start: i, marker: m[1] ?? '```', lang };
    }
    // Any other fence before the document: keep looking only if it is not content.
    if (i === firstContent) return undefined;
  }
  return undefined;
}

function isClosing(line: string, marker: string): boolean {
  const m = FENCE_LINE.exec(line);
  return (
    m !== null &&
    (m[2] ?? '') === '' &&
    (m[1] ?? '').charAt(0) === marker.charAt(0) &&
    (m[1] ?? '').length >= marker.length
  );
}

function findClosing(lines: readonly string[], open: Fence): number {
  const markdown = open.lang === 'markdown' || open.lang === 'md';
  if (!markdown) {
    for (let i = open.start + 1; i < lines.length; i++) {
      if (isClosing(lines[i] ?? '', open.marker)) return i;
    }
    return -1;
  }
  // Markdown content may contain its own fences: the outer fence is the last bare fence
  // line that is not followed by more blocks or directives.
  for (let i = lines.length - 1; i > open.start; i--) {
    const line = lines[i] ?? '';
    if (/^[ \t]*(:::|@\w)/.test(line)) return -1;
    if (isClosing(line, open.marker)) return i;
  }
  return -1;
}

/**
 * Extracts the content of a ```json|yaml|markdown|csv fenced block and drops the prose around it
 * ("Voici votre fichier :"). In strict mode the problems are reported and nothing is changed.
 */
export function extractFence(text: string, sink: IssueSink, format: ImportFormat): CleanText {
  const lines = text.split('\n');
  const open = findOpening(lines);
  if (!open) return { text, lineOffset: 0 };
  // A fenced block inside a Markdown document is content, unless the whole file is wrapped.
  if (format === 'markdown' && open.lang === '' && open.start !== 0) return { text, lineOffset: 0 };
  const close = findClosing(lines, open);
  const before = lines.slice(0, open.start).join('\n').trim();
  const after =
    close >= 0
      ? lines
          .slice(close + 1)
          .join('\n')
          .trim()
      : '';
  sink.fix(
    'code_fence_extracted',
    t(
      `Contenu extrait du bloc de code \`\`\`${open.lang} (ligne ${open.start + 1}).`,
      `Content extracted from the \`\`\`${open.lang} code block (line ${open.start + 1}).`,
    ),
    t(
      'Fournissez le fichier brut, sans bloc de code Markdown autour.',
      'Provide the raw file, without a Markdown code block around it.',
    ),
    { line: open.start + 1 },
  );
  if (before !== '' || after !== '') {
    sink.fix(
      'prose_removed',
      t(
        'Texte hors du fichier ignoré (phrases avant ou après le contenu).',
        'Text outside the file ignored (sentences before or after the content).',
      ),
      t(
        'Ne répondez qu’avec le contenu du fichier, sans phrase d’introduction ni de conclusion.',
        'Reply with the file content only, without introduction or closing sentences.',
      ),
      { excerpt: before !== '' ? before : after },
    );
  }
  if (sink.strict) return { text, lineOffset: 0 };
  const body = lines.slice(open.start + 1, close >= 0 ? close : lines.length).join('\n');
  return { text: body, lineOffset: open.start + 1 };
}

/** Reports prose removed by a format-specific parser (JSON before `{`, YAML before keys…). */
export function reportProse(sink: IssueSink, excerpt: string): void {
  sink.fix(
    'prose_removed',
    t(
      'Texte hors du fichier ignoré (phrases avant ou après le contenu).',
      'Text outside the file ignored (sentences before or after the content).',
    ),
    t(
      'Ne répondez qu’avec le contenu du fichier, sans phrase d’introduction ni de conclusion.',
      'Reply with the file content only, without introduction or closing sentences.',
    ),
    { excerpt },
  );
}
