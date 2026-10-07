/**
 * Lightweight structural scan of a JSON(-ish) text: finds where the top-level value starts and
 * ends, and the span of every element of the notes array (`[...]` at the root or the `notes` key
 * of the root object). Used for line numbers, prose removal and truncation recovery.
 */

export interface NoteSpan {
  start: number;
  end: number;
  /** Brackets that close the document right after this element, e.g. `]}`. */
  closers: string;
}

export interface JsonScan {
  /** Offset of the first `{` or `[`, or -1. */
  start: number;
  /** Offset just after the top-level value, or -1 when it never closes (truncated). */
  end: number;
  notes: NoteSpan[];
}

interface Frame {
  kind: '{' | '[';
  isNotes: boolean;
  expectKey: boolean;
  lastKey?: string;
  elementStart: number;
}

function closersOf(stack: readonly Frame[]): string {
  let s = '';
  for (let k = stack.length - 1; k >= 0; k--) s += stack[k]?.kind === '{' ? '}' : ']';
  return s;
}

function stringEnd(text: string, from: number): number {
  let i = from + 1;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 92) i += 2;
    else if (c === 34) return i + 1;
    else i++;
  }
  return text.length;
}

/** First line starting with `{` or `[`, else the first `{`. */
export function findJsonStart(text: string): number {
  const m = /^[ \t]*[{[]/m.exec(text);
  if (m) return m.index + m[0].length - 1;
  return text.indexOf('{');
}

export function scanJson(text: string, from = findJsonStart(text)): JsonScan {
  const result: JsonScan = { start: from, end: -1, notes: [] };
  if (from < 0) return result;
  const stack: Frame[] = [];
  let i = from;
  while (i < text.length) {
    const ch = text.charAt(i);
    const top = stack[stack.length - 1];
    if (ch === '"') {
      const end = stringEnd(text, i);
      if (top?.kind === '{' && top.expectKey) {
        top.lastKey = text.slice(i + 1, end - 1);
        top.expectKey = false;
      } else if (top?.isNotes === true) {
        result.notes.push({ start: i, end, closers: closersOf(stack) });
      }
      i = end;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (top?.isNotes === true) top.elementStart = i;
      const parent = stack[stack.length - 1];
      const isNotes =
        ch === '[' &&
        (stack.length === 0 ||
          (stack.length === 1 && parent?.kind === '{' && parent.lastKey === 'notes'));
      stack.push({ kind: ch, isNotes, expectKey: ch === '{', elementStart: -1 });
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        result.end = i + 1;
        return result;
      }
      if (parent.isNotes && parent.elementStart >= 0) {
        result.notes.push({ start: parent.elementStart, end: i + 1, closers: closersOf(stack) });
        parent.elementStart = -1;
      }
    } else if (ch === ',' && top?.kind === '{') {
      top.expectKey = true;
    }
    i++;
  }
  return result;
}

/** The text cut after the last complete note, with its brackets closed; undefined if none. */
export function recoverTruncated(text: string, scan: JsonScan): string | undefined {
  const last = scan.notes[scan.notes.length - 1];
  if (!last) return undefined;
  return text.slice(0, last.end) + last.closers;
}
