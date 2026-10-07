/**
 * Text helpers of the Mnemo Markdown writer: escaping of multi-line values, block attributes.
 *
 * A field value runs until the next field name or the closing `:::`. A value line that the
 * parser would mistake for structure is escaped by indenting it by one space (a warning is
 * emitted since the space is not removed on import):
 * - outside code: `Word:` at the start of a line (field), `@word` (directive), `:::` (block);
 * - list markers when the value is followed by a list (`- `, `- [x]`, `1. `);
 * - inside ``` / ~~~ fences and `$$` blocks: only `:::` lines; everything else is verbatim.
 */

const FIELD_LIKE = /^\p{L}[\p{L}\p{N}_-]*\s*:/u;
const DIRECTIVE_LIKE = /^@\p{L}/u;
const BLOCK_LIKE = /^:::/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const LIST_LIKE = /^\s{0,3}([-*+]\s|\d+[.)](\s|$))/;

export interface EscapeResult {
  text: string;
  /** Lines that had to be escaped (1-based numbers within the value). */
  escapedLines: number[];
}

export interface EscapeOptions {
  /** The value is followed by list items in the same block: escape list markers too. */
  listFollows?: boolean;
}

/** Escapes the lines of a multi-line value that would be read as structure. */
export function escapeValue(value: string, opts: EscapeOptions = {}): EscapeResult {
  const escapedLines: number[] = [];
  let fence: string | undefined;
  let math = false;
  const lines = value.split(/\r?\n/).map((line, i) => {
    const fenceMatch = FENCE.exec(line);
    const inCode = fence !== undefined || math;
    if (fence !== undefined) {
      if (fenceMatch?.[1]?.startsWith(fence)) fence = undefined;
    } else if (!math && fenceMatch?.[1] !== undefined) {
      fence = fenceMatch[1].slice(0, 3);
    } else {
      const t = line.trim();
      // `$$ x $$` on one line neither opens nor closes a block.
      const sameLine = t.length > 4 && t.startsWith('$$') && t.endsWith('$$');
      if (!sameLine && (t.startsWith('$$') || (math && t.endsWith('$$')))) math = !math;
    }
    // The first line follows the field label on the same line: it cannot be mistaken.
    const risky =
      i > 0 &&
      (BLOCK_LIKE.test(line) ||
        (!inCode &&
          (FIELD_LIKE.test(line) ||
            DIRECTIVE_LIKE.test(line) ||
            (opts.listFollows === true && LIST_LIKE.test(line)))));
    if (!risky) return line;
    escapedLines.push(i + 1);
    return ` ${line}`;
  });
  return { text: lines.join('\n'), escapedLines };
}

/** One-line value (list item, choice, attribute): newlines become spaces. */
export function oneLine(value: string): { text: string; changed: boolean } {
  const text = value.replace(/\s*\r?\n\s*/g, ' ');
  return { text, changed: text !== value };
}

/** Attribute value: bare when safe, else double-quoted with `\` and `"` escaped. */
export function attrValue(value: string): string {
  if (/^[A-Za-z0-9._:-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `key=value` attributes of a block opening line, in insertion order. */
export function formatAttributes(attrs: ReadonlyArray<readonly [string, string]>): string {
  return attrs.map(([k, v]) => ` ${k}=${attrValue(v)}`).join('');
}
