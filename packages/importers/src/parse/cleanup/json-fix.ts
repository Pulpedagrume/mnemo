/**
 * String-aware JSON repairs. Each function only touches the JSON structure, never the content of
 * string literals, and keeps line breaks so that line numbers stay valid.
 */

const OPEN_SMART = new Set(['“', '”', '„', '‟', '″']);

/** Replaces typographic quotes used as string delimiters by `"`. */
export function fixStructuralSmartQuotes(text: string): { text: string; count: number } {
  let out = '';
  let count = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '"') {
      const end = skipString(text, i, (c) => c === '"');
      out += text.slice(i, end);
      i = end;
    } else if (OPEN_SMART.has(ch)) {
      // A string opened with a typographic quote: it ends at the next quote of any kind.
      const end = skipString(text, i, (c) => c === '"' || OPEN_SMART.has(c));
      const last = text.charAt(end - 1);
      const closed = end - 1 > i && (last === '"' || OPEN_SMART.has(last));
      out += `"${text.slice(i + 1, closed ? end - 1 : end)}${closed ? '"' : ''}`;
      count++;
      i = end;
    } else {
      out += ch;
      i++;
    }
  }
  return { text: out, count };
}

/** Index just after the string starting at `start` (or text.length if unterminated). */
function skipString(text: string, start: number, isClose: (c: string) => boolean): number {
  let i = start + 1;
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === '\\') i += 2;
    else if (isClose(c)) return i + 1;
    else if (c === '\n')
      return i; // JSON strings cannot span lines: stop here.
    else i++;
  }
  return text.length;
}

/** Removes `// …` and `/* … *\/` comments outside strings. */
export function removeComments(text: string): { text: string; count: number } {
  let out = '';
  let count = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
    if (ch === '"') {
      const end = skipString(text, i, (c) => c === '"');
      out += text.slice(i, end);
      i = end;
    } else if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      count++;
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      count++;
    } else if (ch === '#' && /^\s*$/.test(lineBefore(out))) {
      // `# comment` lines (YAML habit).
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      count++;
    } else {
      out += ch;
      i++;
    }
  }
  return { text: out, count };
}

function lineBefore(out: string): string {
  return out.slice(out.lastIndexOf('\n') + 1);
}

/** Removes commas directly followed by `]` or `}`. */
export function removeTrailingCommas(text: string): { text: string; count: number } {
  let out = '';
  let count = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '"') {
      const end = skipString(text, i, (c) => c === '"');
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text.charAt(j))) j++;
      const after = text.charAt(j);
      if (after === ']' || after === '}') {
        count++;
        i++;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return { text: out, count };
}
