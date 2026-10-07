import type { Problem } from './types';

/**
 * Cloze deletions, Anki-compatible syntax: `{{c1::answer}}` and `{{c1::answer::hint}}`.
 * Braces inside an answer must be balanced (`{{c1::$\frac{a}{b}$}}`); `\{` and `\}` are literal
 * braces that do not count. Nested clozes are not supported.
 */
export type ClozeSegment =
  | { type: 'text'; text: string }
  | {
      type: 'cloze';
      /** Cloze number (`c1` -> 1). 0 only in invalid input (reported as an error). */
      n: number;
      answer: string;
      hint?: string;
      /** Offset of the opening `{{` in the source text. */
      offset: number;
    };

export interface ClozeParseResult {
  segments: ClozeSegment[];
  problems: Problem[];
  /** Distinct valid cloze numbers, ascending. One card per number. */
  numbers: number[];
}

const OPEN_RE = /\{\{c(\d+)::/y;
const MAX_CLOZE_NUMBER = 1000;

function matchOpen(text: string, at: number): { n: number; length: number } | null {
  OPEN_RE.lastIndex = at;
  const m = OPEN_RE.exec(text);
  if (!m) return null;
  return { n: Number(m[1]), length: m[0].length };
}

interface ClosedBody {
  closed: true;
  contentEnd: number;
  end: number;
  separator: number;
  nested: number[];
  stray: number[];
}

/** Scans a cloze body from `from` (just after `{{cN::`) up to the matching `}}`. */
function scanBody(text: string, from: number): ClosedBody | { closed: false; unbalanced: boolean } {
  let depth = 0;
  let separator = -1;
  const nested: number[] = [];
  const stray: number[] = [];
  let j = from;
  while (j < text.length) {
    const ch = text[j];
    const next = text[j + 1];
    if (ch === '\\' && (next === '{' || next === '}')) {
      j += 2;
    } else if (ch === '{') {
      const open = matchOpen(text, j);
      if (open) {
        nested.push(j);
        depth += 2;
        j += open.length;
      } else {
        depth++;
        j++;
      }
    } else if (ch === '}') {
      if (depth > 0) depth--;
      else if (next === '}')
        return { closed: true, contentEnd: j, end: j + 2, separator, nested, stray };
      else stray.push(j);
      j++;
    } else if (ch === ':' && next === ':' && depth === 0 && separator < 0) {
      separator = j;
      j += 2;
    } else {
      j++;
    }
  }
  return { closed: false, unbalanced: depth > 0 || stray.length > 0 };
}

function problem(
  code: string,
  severity: Problem['severity'],
  fr: string,
  en: string,
  offset?: number,
): Problem {
  return offset === undefined
    ? { code, severity, message: { fr, en } }
    : { code, severity, message: { fr, en }, offset };
}

/** Parses cloze text into segments and reports syntax problems. Never throws. */
export function parseCloze(text: string): ClozeParseResult {
  const segments: ClozeSegment[] = [];
  const problems: Problem[] = [];
  const pushText = (s: string): void => {
    if (s === '') return;
    const last = segments[segments.length - 1];
    if (last?.type === 'text') last.text += s;
    else segments.push({ type: 'text', text: s });
  };

  let i = 0;
  let textStart = 0;
  while (i < text.length) {
    const at = text.indexOf('{{c', i);
    if (at < 0) break;
    const open = matchOpen(text, at);
    if (!open) {
      i = at + 1;
      continue;
    }
    const contentStart = at + open.length;
    const body = scanBody(text, contentStart);
    if (!body.closed) {
      problems.push(
        body.unbalanced
          ? problem(
              'unbalanced_braces',
              'error',
              `Accolades non équilibrées dans le trou c${open.n} : il manque « } ».`,
              `Unbalanced braces in cloze c${open.n}: a "}" is missing.`,
              at,
            )
          : problem(
              'unterminated_cloze',
              'error',
              `Trou c${open.n} non fermé : il manque « }} ».`,
              `Unterminated cloze c${open.n}: "}}" is missing.`,
              at,
            ),
      );
      i = contentStart;
      continue;
    }
    for (const offset of body.nested) {
      problems.push(
        problem(
          'nested_cloze',
          'error',
          'Trous imbriqués non pris en charge : séparez-les en trous distincts.',
          'Nested clozes are not supported: split them into separate clozes.',
          offset,
        ),
      );
    }
    for (const offset of body.stray) {
      problems.push(
        problem(
          'unbalanced_braces',
          'error',
          `Accolade fermante « } » sans ouvrante dans le trou c${open.n}.`,
          `Closing brace "}" without an opening one in cloze c${open.n}.`,
          offset,
        ),
      );
    }
    const hasSep = body.separator >= 0;
    const answer = text.slice(contentStart, hasSep ? body.separator : body.contentEnd);
    const hint = hasSep ? text.slice(body.separator + 2, body.contentEnd).trim() : '';
    if (answer.trim() === '') {
      problems.push(
        problem(
          'empty_answer',
          'error',
          `Le trou c${open.n} n’a pas de réponse.`,
          `Cloze c${open.n} has an empty answer.`,
          at,
        ),
      );
    }
    if (open.n < 1 || open.n > MAX_CLOZE_NUMBER) {
      problems.push(
        problem(
          'invalid_number',
          'error',
          `Numéro de trou invalide c${open.n} : la numérotation commence à c1 (maximum c${MAX_CLOZE_NUMBER}).`,
          `Invalid cloze number c${open.n}: numbering starts at c1 (maximum c${MAX_CLOZE_NUMBER}).`,
          at,
        ),
      );
    }
    pushText(text.slice(textStart, at));
    const n = open.n > MAX_CLOZE_NUMBER ? 0 : open.n;
    segments.push(
      hint === ''
        ? { type: 'cloze', n, answer, offset: at }
        : { type: 'cloze', n, answer, hint, offset: at },
    );
    i = textStart = body.end;
  }
  pushText(text.slice(textStart));

  const numbers = distinctNumbers(segments);
  if (numbers.length === 0 && !segments.some((s) => s.type === 'cloze')) {
    problems.push(
      problem(
        'no_cloze',
        'error',
        'Aucun trou : utilisez la syntaxe {{c1::réponse}}.',
        'No cloze deletion: use the {{c1::answer}} syntax.',
      ),
    );
  }
  const max = numbers[numbers.length - 1] ?? 0;
  const missing: number[] = [];
  for (let k = 1; k <= max; k++) if (!numbers.includes(k)) missing.push(k);
  if (missing.length > 0) {
    const list = missing
      .slice(0, 10)
      .map((k) => `c${k}`)
      .join(', ');
    const more = missing.length > 10 ? '…' : '';
    problems.push(
      problem(
        'skipped_number',
        'warning',
        `Numéros de trous sautés : ${list}${more}.`,
        `Skipped cloze numbers: ${list}${more}.`,
      ),
    );
  }
  return { segments, problems, numbers };
}

function distinctNumbers(segments: readonly ClozeSegment[]): number[] {
  const set = new Set<number>();
  for (const s of segments) if (s.type === 'cloze' && s.n >= 1) set.add(s.n);
  return [...set].sort((a, b) => a - b);
}

/** Distinct valid cloze numbers of a text, ascending. */
export function clozeNumbers(text: string): number[] {
  return parseCloze(text).numbers;
}

/** Hints (`::hint`) of the occurrences of cloze `n`, distinct, in text order. */
export function clozeHints(text: string, n: number): string[] {
  const hints: string[] = [];
  for (const s of parseCloze(text).segments) {
    if (s.type === 'cloze' && s.n === n && s.hint !== undefined && !hints.includes(s.hint)) {
      hints.push(s.hint);
    }
  }
  return hints;
}

/** Wraps the non-blank core of `s` in `**`, keeping surrounding whitespace outside the markers. */
function bold(s: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  const core = m?.[2] ?? '';
  if (core === '') return s;
  return `${m?.[1] ?? ''}**${core}**${m?.[3] ?? ''}`;
}

/** Question side of cloze card `n`: its deletions become `**[…]**` (or `**[hint]**`). */
export function renderClozeFront(text: string, n: number): string {
  return parseCloze(text)
    .segments.map((s) => {
      if (s.type === 'text') return s.text;
      if (s.n !== n) return s.answer;
      return `**[${s.hint ?? '…'}]**`;
    })
    .join('');
}

/** Answer side of cloze card `n`: its answers in bold, other clozes as plain text. */
export function renderClozeBack(text: string, n: number): string {
  return parseCloze(text)
    .segments.map((s) => {
      if (s.type === 'text') return s.text;
      return s.n === n ? bold(s.answer) : s.answer;
    })
    .join('');
}

/** Text with every cloze replaced by its answer (search, fingerprints). */
export function stripCloze(text: string): string {
  return parseCloze(text)
    .segments.map((s) => (s.type === 'text' ? s.text : s.answer))
    .join('');
}
