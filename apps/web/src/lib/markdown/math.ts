import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';
import katex from 'katex';

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
  });
}

/**
 * Inline `$…$`: the opening `$` must be followed by a non-space, the closing one preceded by a
 * non-space and not followed by a digit (so "$5 and $6" stays text). `\$` is a literal dollar.
 */
function mathInline(state: StateInline, silent: boolean): boolean {
  const { src, pos, posMax } = state;
  if (src[pos] !== '$' || src[pos + 1] === '$') return false;
  const first = src[pos + 1];
  if (first === undefined || /\s/.test(first)) return false;
  let end = pos + 1;
  while (end < posMax) {
    end = src.indexOf('$', end);
    if (end === -1) return false;
    if (src[end - 1] === '\\') {
      end++;
      continue;
    }
    break;
  }
  if (end >= posMax || end === -1) return false;
  const last = src[end - 1];
  const after = src[end + 1];
  if (last === undefined || /\s/.test(last) || (after !== undefined && /\d/.test(after)))
    return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = src.slice(pos + 1, end);
  }
  state.pos = end + 1;
  return true;
}

/** Block `$$ … $$`, on one line or several. */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean) {
  let pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
  let max = state.eMarks[startLine] ?? 0;
  if (state.src.slice(pos, pos + 2) !== '$$') return false;
  pos += 2;
  let firstLine = state.src.slice(pos, max);
  let lastLine = '';
  let next = startLine;
  let found = false;
  if (firstLine.trim().endsWith('$$')) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }
  while (!found) {
    next++;
    if (next >= endLine) return false;
    pos = (state.bMarks[next] ?? 0) + (state.tShift[next] ?? 0);
    max = state.eMarks[next] ?? 0;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith('$$')) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }
  if (silent) return true;
  state.line = next + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content =
    (firstLine.trim() ? `${firstLine}\n` : '') +
    state.getLines(startLine + 1, next, state.tShift[startLine] ?? 0, true) +
    (lastLine.trim() ? lastLine : '');
  token.map = [startLine, state.line];
  return true;
}

export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx]?.content ?? '', false);
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block">${renderMath(tokens[idx]?.content ?? '', true)}</div>\n`;
}
