import { isMap, isSeq, LineCounter, parseDocument, type Document } from 'yaml';
import { TYPE_ALIASES } from '../format/aliases';
import { BUILTIN_NOTE_SCHEMAS } from '../format/schema';
import { reportProse } from './cleanup/text';
import { t, type IssueSink } from './issue';
import { isBuiltinType } from './resolve';
import { isPlainObject } from './text';
import type { FormatOutput, NoteLoc } from './types';

const YAML_LINE = /^(---|\.\.\.|#|- |-$|[A-Za-z_$][\w$.-]*:(\s|$)|"[^"\n]*"\s*:|'[^'\n]*'\s*:)/;
const MAX_ERRORS = 5;

function convertTabs(text: string, sink: IssueSink): string {
  if (!/^ *\t/m.test(text)) return text;
  sink.fix(
    'yaml_tabs_converted',
    t('Tabulations d’indentation converties en espaces.', 'Indentation tabs converted to spaces.'),
    t(
      'En YAML, indentez avec des espaces (2 par niveau), jamais des tabulations.',
      'In YAML, indent with spaces (2 per level), never tabs.',
    ),
  );
  if (sink.strict) return text;
  return text.replace(/^[ \t]+/gm, (indent) => indent.replace(/\t/g, '  '));
}

/** Drops sentences before and after the YAML document; returns the removed line count above. */
function stripProse(text: string, sink: IssueSink): { text: string; lineOffset: number } {
  const lines = text.split('\n');
  let first = 0;
  while (first < lines.length && (lines[first] ?? '').trim() === '') first++;
  let start = first;
  while (start < lines.length && !YAML_LINE.test(lines[start] ?? '')) start++;
  if (start >= lines.length) return { text, lineOffset: 0 };
  let end = lines.length;
  while (end > start && (lines[end - 1] ?? '').trim() === '') end--;
  let stop = end;
  while (
    stop > start &&
    /^\S/.test(lines[stop - 1] ?? '') &&
    !YAML_LINE.test(lines[stop - 1] ?? '')
  )
    stop--;
  const removed = [...lines.slice(first, start), ...lines.slice(stop, end)].join('\n').trim();
  if (removed === '') return { text, lineOffset: 0 };
  reportProse(sink, removed);
  if (sink.strict) return { text, lineOffset: 0 };
  const kept =
    lines.slice(start, stop).join('\n') + (stop < lines.length || text.endsWith('\n') ? '\n' : '');
  return { text: kept, lineOffset: start };
}

interface Parsed {
  doc: Document;
  counter: LineCounter;
}

function parse(text: string): Parsed {
  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: false });
  return { doc, counter };
}

/** Document to JS; aliases to unknown anchors or alias bombs throw in `toJS`. */
export function yamlToJs(
  doc: Document,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: doc.toJS({ maxAliasCount: 50 }) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function notesItems(doc: Document): { range?: readonly number[] | null }[] {
  const contents = doc.contents;
  const seq = isMap(contents) ? contents.get('notes', true) : contents;
  return isSeq(seq) ? (seq.items as { range?: readonly number[] | null }[]) : [];
}

/** Start of the line holding `offset`. */
function lineStartOf(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function looksIncomplete(value: unknown): boolean {
  if (!isPlainObject(value)) return true;
  const raw = typeof value.type === 'string' ? value.type.toLowerCase() : '';
  const type = TYPE_ALIASES[raw] ?? raw;
  if (!isBuiltinType(type)) return false;
  const result = BUILTIN_NOTE_SCHEMAS[type].safeParse(value);
  return (
    !result.success &&
    result.error.issues.some((i) => i.code === 'invalid_type' || i.code === 'too_small')
  );
}

/** AI output cut off: text without final newline whose last note is broken or incomplete. */
function truncationCut(text: string, parsed: Parsed): string | undefined {
  if (text.endsWith('\n')) return undefined;
  const items = notesItems(parsed.doc);
  const last = items[items.length - 1];
  const start = last?.range?.[0];
  if (start === undefined || items.length < 2) return undefined;
  const lineStart = lineStartOf(text, start);
  if (parsed.doc.errors.length > 0) {
    if (!parsed.doc.errors.every((e) => e.pos[0] >= lineStart)) return undefined;
  } else {
    const converted = yamlToJs(parsed.doc);
    const js = converted.ok ? converted.value : undefined;
    const notes = isPlainObject(js) ? js.notes : js;
    if (!Array.isArray(notes) || !looksIncomplete(notes[notes.length - 1])) return undefined;
  }
  return text.slice(0, lineStart);
}

function locsOf(text: string, parsed: Parsed, lineOffset: number): NoteLoc[] {
  return notesItems(parsed.doc).map((item) => {
    const [start = 0, end = start] = item.range ?? [];
    const lineStart = lineStartOf(text, start);
    return {
      line: parsed.counter.linePos(start).line + lineOffset,
      excerpt: text.slice(lineStart, Math.min(end, lineStart + 400)),
    };
  });
}

/** Parses a YAML 1.2 import (tabs and surrounding prose fixed in tolerant mode). */
export function parseYamlText(input: string, sink: IssueSink): FormatOutput {
  const stripped = stripProse(convertTabs(input, sink), sink);
  let text = stripped.text;
  let parsed = parse(text);
  let truncated = false;
  const cut = truncationCut(text, parsed);
  if (cut !== undefined) {
    truncated = true;
    if (!sink.strict) {
      text = cut;
      parsed = parse(text);
    }
  }
  if (parsed.doc.errors.length > 0) {
    for (const error of parsed.doc.errors.slice(0, MAX_ERRORS)) {
      const pos = parsed.counter.linePos(error.pos[0]);
      const lineText = text.slice(lineStartOf(text, error.pos[0])).split('\n', 1)[0] ?? '';
      sink.error(
        'parse_error',
        t(
          `YAML invalide : ${error.message.split('\n')[0] ?? ''}`,
          `Invalid YAML: ${error.message.split('\n')[0] ?? ''}`,
        ),
        t(
          'Vérifiez l’indentation (espaces, alignement des « - »), les « : » suivis d’un espace et mettez entre guillemets les textes contenant « : » ou « # ».',
          'Check indentation (spaces, aligned "-"), ": " followed by a space, and quote texts containing ":" or "#".',
        ),
        { line: pos.line + stripped.lineOffset, column: pos.col, excerpt: lineText },
      );
    }
    return { root: undefined, locs: [], truncated };
  }
  const converted = yamlToJs(parsed.doc);
  if (!converted.ok) {
    sink.error(
      'parse_error',
      t(`YAML invalide : ${converted.error}`, `Invalid YAML: ${converted.error}`),
      t(
        'Supprimez les ancres et alias YAML (&nom, *nom) : écrivez les valeurs en entier.',
        'Remove YAML anchors and aliases (&name, *name): write values in full.',
      ),
    );
    return { root: undefined, locs: [], truncated };
  }
  return { root: converted.value, locs: locsOf(text, parsed, stripped.lineOffset), truncated };
}
