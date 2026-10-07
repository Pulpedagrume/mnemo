import Papa from 'papaparse';
import { FORMAT_ID } from '@mnemo/core';
import { KEY_ALIASES, TYPE_ALIASES } from '../format/aliases';
import { reportProse } from './cleanup/text';
import { excerptOf, makeIssue, notePath, t, type IssueSink } from './issue';
import { answerRef } from './resolve-mcq';
import { foldName, lineOf, lineStarts } from './text';
import type { FormatOutput, NoteLoc } from './types';

const COLUMNS = new Set([
  'type',
  'deck',
  'tags',
  'uid',
  'front',
  'back',
  'text',
  'extra',
  'hint',
  'explanation',
  'source',
  'question',
  'correct',
]);
const EXTRA_ALIASES: Readonly<Record<string, string>> = {
  answer: 'back',
  correcte: 'correct',
  correctes: 'correct',
  bonne_reponse: 'correct',
  bonnes_reponses: 'correct',
  answers: 'correct',
};
const MAX_CHOICES = 8;
const HINT_SEPARATOR = ' | ';

/** Canonical column of a header cell, or undefined; `alias` is true when renamed. */
function column(header: string): { name: string; alias: boolean } | undefined {
  const h = foldName(header).replace(/\s+/g, '_');
  if (COLUMNS.has(h)) return { name: h, alias: header.trim() !== h };
  const choice = /^(?:choice|choix|option|proposition)_?(\d)$/.exec(h);
  if (choice) {
    const n = Number(choice[1]);
    return n >= 1 && n <= MAX_CHOICES
      ? { name: `choice${n}`, alias: !h.startsWith('choice') }
      : undefined;
  }
  const target = KEY_ALIASES[h] ?? KEY_ALIASES[foldName(header)] ?? EXTRA_ALIASES[h];
  if (target === undefined) return undefined;
  // `q`/`recto` map to `front`; the `question` column is the MCQ question.
  return COLUMNS.has(target) ? { name: target, alias: true } : undefined;
}

function detectDelimiter(line: string): string {
  let best = ',';
  let bestCount = 0;
  for (const d of ['\t', ';', ',']) {
    const count = line.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

interface Row {
  cells: string[];
  line: number;
  text: string;
}

function readRows(text: string, delimiter: string, sink: IssueSink): Row[] {
  const starts = lineStarts(text);
  const rows: Row[] = [];
  let offset = 0;
  Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: false,
    step: (results) => {
      const end = results.meta.cursor;
      let start = offset;
      while (text.charAt(start) === '\n') start++;
      offset = end;
      const cells = results.data;
      if (cells.every((c) => c.trim() === '')) return;
      const line = lineOf(starts, start);
      for (const error of results.errors) {
        sink.error(
          'csv_bad_row',
          t(
            `Ligne CSV ${line} mal formée : ${error.message}.`,
            `Malformed CSV line ${line}: ${error.message}.`,
          ),
          t(
            'Encadrez de guillemets doubles les cellules contenant le séparateur, des guillemets (doublés : "") ou des retours à la ligne.',
            'Wrap cells containing the delimiter, quotes (doubled: "") or line breaks in double quotes.',
          ),
          { line, excerpt: text.slice(start, end) },
        );
      }
      rows.push({ cells, line, text: text.slice(start, end) });
    },
  });
  return rows;
}

function headerScore(cells: readonly string[]): number {
  return cells.filter((c) => column(c) !== undefined).length;
}

function rowToNote(
  get: (name: string) => string | undefined,
  index: number,
  row: Row,
  sink: IssueSink,
): Record<string, unknown> {
  const rawType = get('type') ?? 'basic';
  const type = TYPE_ALIASES[foldName(rawType)] ?? foldName(rawType);
  const note: Record<string, unknown> = { type: rawType };
  for (const key of ['uid', 'deck', 'tags', 'explanation', 'extra']) {
    const v = get(key);
    if (v !== undefined) note[key] = v;
  }
  const hint = get('hint');
  if (hint !== undefined)
    note.hint = hint.includes(HINT_SEPARATOR)
      ? hint.split(HINT_SEPARATOR).map((h) => h.trim())
      : hint;
  const source = get('source');
  if (source !== undefined) note.source = parseSource(source);
  if (type === 'mcq') {
    const question = get('question') ?? get('front');
    if (question !== undefined) note.question = question;
    const choices: string[] = [];
    for (let n = 1; n <= MAX_CHOICES; n++) {
      const c = get(`choice${n}`);
      if (c !== undefined) choices.push(c);
    }
    const correct = new Set<number>();
    const refs = (get('correct') ?? '').split(/[|,;\s]+/).filter((s) => s !== '');
    refs.forEach((ref) => {
      const idx = answerRef(ref, choices);
      if (idx === undefined) {
        sink.add(
          makeIssue(
            'mcq_bad_answer_ref',
            'error',
            t(
              `Colonne « correct » : « ${ref} » ne désigne aucune proposition (${choices.length} propositions).`,
              `Column "correct": "${ref}" matches no choice (${choices.length} choices).`,
            ),
            t(
              'Indiquez les numéros des bonnes propositions séparés par « | », ex. « 1|3 ».',
              'Give the numbers of the correct choices separated by "|", e.g. "1|3".',
            ),
            {
              path: notePath(index, 'correct'),
              noteIndex: index,
              line: row.line,
              excerpt: row.text,
            },
          ),
        );
      } else correct.add(idx);
    });
    note.choices = choices.map((text, i) => ({ text, correct: correct.has(i) }));
    return note;
  }
  const front = get('front') ?? get('question');
  for (const [key, value] of [
    ['front', front],
    ['back', get('back')],
    ['text', get('text')],
  ] as const) {
    if (value !== undefined) note[key] = value;
  }
  return note;
}

function parseSource(s: string): unknown {
  if (!s.startsWith('{')) return s;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}

/** Parses CSV/TSV (header line, auto-detected delimiter, RFC 4180 quoting). */
export function parseCsvText(input: string, sink: IssueSink): FormatOutput {
  const lines = input.split('\n');
  let first = 0;
  while (first < lines.length && (lines[first] ?? '').trim() === '') first++;
  let headerAt = first;
  for (let i = first; i < Math.min(lines.length, first + 5); i++) {
    if (headerScore((lines[i] ?? '').split(detectDelimiter(lines[i] ?? ''))) >= 2) {
      headerAt = i;
      break;
    }
  }
  if (headerAt > first) reportProse(sink, lines.slice(first, headerAt).join('\n'));
  const skip = sink.strict ? first : headerAt;
  const text = lines.slice(skip).join('\n');
  const rows = readRows(text, detectDelimiter(lines[skip] ?? ''), sink);
  const header = rows[0];
  if (!header) return { root: undefined, locs: [] };
  const columns = header.cells.map(column);
  const hasHeaders = columns.some((c) => c !== undefined);
  let dataRows = rows.slice(1);
  let names: (string | undefined)[] = columns.map((c) => c?.name);
  if (!hasHeaders) {
    sink.fix(
      'csv_no_headers',
      t(
        'Aucun en-tête reconnu : colonnes lues comme « front » puis « back » (la première ligne est une carte).',
        'No recognized header: columns read as "front" then "back" (the first row is a card).',
      ),
      t(
        'Ajoutez une première ligne d’en-têtes, ex. « type,front,back ».',
        'Add a header row, e.g. "type,front,back".',
      ),
      { line: header.line + skip },
    );
    names = ['front', 'back'];
    dataRows = rows;
  } else {
    header.cells.forEach((cell, i) => {
      const col = columns[i];
      if (col?.alias === true) {
        sink.fix(
          'alias',
          t(
            `Colonne « ${cell} » interprétée comme « ${col.name} ».`,
            `Column "${cell}" interpreted as "${col.name}".`,
          ),
          t(`Nommez la colonne « ${col.name} ».`, `Name the column "${col.name}".`),
          {
            path: cell,
            line: header.line + skip,
            suggestion: t(`« ${cell} » → « ${col.name} »`, `"${cell}" → "${col.name}"`),
          },
        );
      } else if (col === undefined && cell.trim() !== '') {
        sink.fix(
          'unknown_key',
          t(`Colonne inconnue « ${cell} » ignorée.`, `Unknown column "${cell}" ignored.`),
          t(
            'Colonnes reconnues : type, deck, tags, uid, front, back, text, extra, hint, explanation, source, question, choice1…choice8, correct.',
            'Recognized columns: type, deck, tags, uid, front, back, text, extra, hint, explanation, source, question, choice1…choice8, correct.',
          ),
          { path: cell, line: header.line + skip },
        );
      }
    });
  }
  const notes: unknown[] = [];
  const locs: NoteLoc[] = [];
  dataRows.forEach((row) => {
    const index = notes.length;
    const line = row.line + skip;
    const get = (name: string): string | undefined => {
      const i = names.indexOf(name);
      const v = i < 0 ? undefined : row.cells[i]?.trim();
      return v === undefined || v === '' ? undefined : v;
    };
    if (
      row.cells.length > names.length &&
      row.cells.slice(names.length).some((c) => c.trim() !== '')
    ) {
      sink.warn(
        'csv_bad_row',
        t(
          `Ligne ${line} : plus de cellules que d’en-têtes, cellules en trop ignorées.`,
          `Line ${line}: more cells than headers, extra cells ignored.`,
        ),
        t(
          'Vérifiez les séparateurs et les guillemets de cette ligne.',
          'Check the delimiters and quotes of this line.',
        ),
        { line, noteIndex: index, path: notePath(index), excerpt: row.text },
      );
    }
    notes.push(rowToNote(get, index, { ...row, line }, sink));
    locs.push({ line, excerpt: excerptOf(row.text) });
  });
  return { root: { format: FORMAT_ID, notes }, locs };
}
