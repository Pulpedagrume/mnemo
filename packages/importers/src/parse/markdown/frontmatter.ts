import { LineCounter, parseDocument } from 'yaml';
import { t, type IssueSink } from '../issue';
import { isPlainObject } from '../text';
import { yamlToJs } from '../yaml';

export interface FrontMatter {
  format?: unknown;
  type?: string;
}

export interface FrontMatterResult {
  front: FrontMatter;
  meta: Record<string, unknown>;
  defaults: Record<string, unknown>;
  /** Index of the first line after the front-matter. */
  next: number;
}

const META_KEYS = new Set(['title', 'language', 'source']);

/** Optional YAML front-matter between `---` lines at the top of a Markdown import. */
export function parseFrontMatter(lines: readonly string[], sink: IssueSink): FrontMatterResult {
  const result: FrontMatterResult = { front: {}, meta: {}, defaults: {}, next: 0 };
  let first = 0;
  while (first < lines.length && (lines[first] ?? '').trim() === '') first++;
  if ((lines[first] ?? '').trim() !== '---') return result;
  let end = first + 1;
  while (end < lines.length && !/^(---|\.\.\.)\s*$/.test(lines[end] ?? '')) end++;
  if (end >= lines.length) return result;
  result.next = end + 1;
  const counter = new LineCounter();
  const doc = parseDocument(lines.slice(first + 1, end).join('\n'), {
    lineCounter: counter,
    prettyErrors: false,
  });
  const error = doc.errors[0];
  if (error) {
    sink.error(
      'parse_error',
      t(
        `En-tête YAML (front-matter) invalide : ${error.message.split('\n')[0] ?? ''}`,
        `Invalid YAML front-matter: ${error.message.split('\n')[0] ?? ''}`,
      ),
      t(
        'Corrigez l’en-tête entre les lignes « --- » (ex. « deck: Réseaux::Ethernet »).',
        'Fix the header between the "---" lines (e.g. "deck: Networks::Ethernet").',
      ),
      { line: counter.linePos(error.pos[0]).line + first + 1 },
    );
    return result;
  }
  const converted = yamlToJs(doc);
  const value = converted.ok ? converted.value : undefined;
  if (!isPlainObject(value)) return result;
  for (const [key, v] of Object.entries(value)) {
    if (key === 'format') result.front.format = v;
    else if (key === 'deck' || key === 'tags') result.defaults[key] = v;
    else if (key === 'type' && typeof v === 'string') {
      result.front.type = v;
      result.defaults.type = v;
    } else if (META_KEYS.has(key)) result.meta[key] = typeof v === 'string' ? v : String(v);
    else {
      sink.fix(
        'unknown_key',
        t(
          `Clé inconnue « ${key} » ignorée dans l’en-tête.`,
          `Unknown key "${key}" ignored in the header.`,
        ),
        t(
          'Clés acceptées : format, deck, tags, language, source, title, type.',
          'Accepted keys: format, deck, tags, language, source, title, type.',
        ),
        { path: key, line: first + 2 },
      );
    }
  }
  return result;
}
