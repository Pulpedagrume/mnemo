import type { ImportFormat } from '../api';

const EXTENSIONS: readonly (readonly [RegExp, ImportFormat])[] = [
  [/\.json$/i, 'json'],
  [/\.ya?ml$/i, 'yaml'],
  [/\.(md|markdown|txt)$/i, 'markdown'],
  [/\.(csv|tsv)$/i, 'csv'],
];

const FENCE_LANGS: Readonly<Record<string, ImportFormat>> = {
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  markdown: 'markdown',
  md: 'markdown',
  csv: 'csv',
  tsv: 'csv',
};

const CSV_HEADER_WORDS =
  /^(type|deck|tags|uid|front|back|text|extra|hint|explanation|source|question|choice\d|correct|recto|verso|réponse|reponse|texte)$/i;

function sniffCsv(firstLine: string): boolean {
  for (const delimiter of ['\t', ';', ',']) {
    const cells = firstLine.split(delimiter);
    if (cells.length < 2) continue;
    const known = cells.filter((c) => CSV_HEADER_WORDS.test(c.trim().replace(/^"|"$/g, '')));
    if (known.length >= 2 || (known.length >= 1 && cells.length >= 2 && delimiter !== ',')) {
      return true;
    }
  }
  return false;
}

/**
 * Detects the format of an import: by file extension first, then by content (fenced code block
 * language, leading `{`/`[`, YAML document keys, Markdown blocks/front-matter, CSV header line).
 * Defaults to Markdown, the most forgiving format.
 */
export function detectFormat(text: string, fileName?: string): ImportFormat {
  if (fileName !== undefined) {
    for (const [re, format] of EXTENSIONS) if (re.test(fileName.trim())) return format;
  }
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const fence = /^[ \t]*(`{3,}|~{3,})[ \t]*([A-Za-z0-9]+)[ \t]*$/m.exec(body);
  const lang = fence?.[2]?.toLowerCase();
  if (lang !== undefined) {
    const byFence = FENCE_LANGS[lang];
    if (byFence) return byFence;
  }
  const trimmed = body.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (/^:::/m.test(body)) return 'markdown';
  if (/^format:\s*["']?mnemo\//m.test(body) || /^notes:\s*$/m.test(body)) return 'yaml';
  if (trimmed.startsWith('---')) {
    // Front-matter followed by Markdown blocks, or a YAML document start.
    return /^notes:/m.test(body) ? 'yaml' : 'markdown';
  }
  if (/^[ \t]*[{[]/m.test(body) && /"(format|notes|type)"\s*:/.test(body)) return 'json';
  const firstLine = trimmed.split('\n', 1)[0] ?? '';
  if (sniffCsv(firstLine)) return 'csv';
  if (/^-\s+type:/m.test(body)) return 'yaml';
  return 'markdown';
}
