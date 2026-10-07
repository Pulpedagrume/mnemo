import { stringify } from 'yaml';
import { FORMAT_ID } from '@mnemo/core';
import type { ImportDocument, ImportNote } from '../format/schema';
import { escapeValue, formatAttributes, oneLine } from './markdownText';
import {
  type BuiltinImportNote,
  type CustomImportNote,
  isCustomImportNote,
  asList,
  choicesOf,
  explanationWithChoices,
  noteLabel,
  sourceText,
  tagsOf,
} from './shape';

/**
 * Mnemo Markdown writer. Layout:
 *
 *     ---                                  optional front-matter (format, deck, tags)
 *     format: mnemo/1
 *     deck: Networks
 *     ---
 *
 *     @deck Networks::Ethernet             when the deck changes
 *
 *     ::: basic uid=net-001 tags="a b"     block opening line with attributes
 *     Q: question
 *     A: answer
 *     Hint: one line per hint
 *     :::
 *
 * Typed answers: `Answer: v1 | v2` (variants separated by ` | `; a variant containing ` | `
 * is not reversible and triggers a warning). Options without a field are block attributes:
 * `caseSensitive`, `ignoreAccents`, `shuffle`, `ordered`, `difficulty`, `needsReview`.
 * Matching: `- left => right`, distractors in a `Distractors:` field (`- item` lines).
 * Sources: plain text when only `doc` is set, else an inline JSON object.
 */

export const TYPED_ANSWER_SEPARATOR = ' | ';

interface Ctx {
  lines: string[];
  warnings: string[];
  label: string;
}

function warn(ctx: Ctx, message: string): void {
  ctx.warnings.push(`Note ${ctx.label}: ${message}`);
}

/** `Label: value` with escaping; multi-line values continue on the following lines. */
function field(ctx: Ctx, name: string, value: string | undefined, listFollows = false): void {
  if (value === undefined) return;
  const { text, escapedLines } = escapeValue(value, { listFollows });
  if (escapedLines.length > 0)
    warn(ctx, `${name} line(s) ${escapedLines.join(', ')} indented by one space (escaped)`);
  ctx.lines.push(text.startsWith('\n') ? `${name}:${text}` : `${name}: ${text}`);
}

function item(ctx: Ctx, prefix: string, value: string, what: string): void {
  const { text, changed } = oneLine(value);
  if (changed) warn(ctx, `line breaks in ${what} replaced by spaces`);
  ctx.lines.push(`${prefix}${text}`);
}

function customBody(ctx: Ctx, note: CustomImportNote): void {
  for (const [name, value] of Object.entries(note.fields)) {
    if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(name)) {
      warn(ctx, `field "${name}" has no valid Markdown label; skipped`);
      continue;
    }
    if (value !== '') field(ctx, name, value);
  }
}

function body(ctx: Ctx, note: ImportNote, explanation: { value: string | undefined }): void {
  if (isCustomImportNote(note)) {
    customBody(ctx, note);
    return;
  }
  builtinBody(ctx, note, explanation);
}

function builtinBody(
  ctx: Ctx,
  note: BuiltinImportNote,
  explanation: { value: string | undefined },
): void {
  switch (note.type) {
    case 'basic':
    case 'basic_reversed':
      field(ctx, 'Q', note.front);
      field(ctx, 'A', note.back);
      return;
    case 'typed': {
      field(ctx, 'Q', note.front);
      const answers = asList(note.answer).map((a) => oneLine(a).text);
      if (answers.some((a) => a.includes(TYPED_ANSWER_SEPARATOR.trim())))
        warn(ctx, `a typed answer contains "|": variants will not be split back correctly`);
      field(ctx, 'Answer', answers.join(TYPED_ANSWER_SEPARATOR));
      return;
    }
    case 'cloze':
      field(ctx, 'Text', note.text);
      return;
    case 'mcq': {
      const choices = choicesOf(note);
      field(ctx, 'Q', note.question, true);
      for (const c of choices) item(ctx, c.correct ? '- [x] ' : '- [ ] ', c.text, 'a choice');
      if (choices.some((c) => c.explanation !== undefined)) {
        warn(ctx, 'per-choice explanations are not representable; appended to Explanation');
        explanation.value = explanationWithChoices(explanation.value, choices);
      }
      return;
    }
    case 'truefalse':
      field(ctx, 'Statement', note.statement);
      ctx.lines.push(`Answer: ${String(note.answer)}`);
      return;
    case 'matching':
      field(ctx, 'Q', note.question, true);
      for (const p of note.pairs) {
        if (/=>|->|→/.test(p.left)) warn(ctx, 'a left item contains an arrow: not reversible');
        item(ctx, '- ', `${p.left} => ${p.right}`, 'a pair');
      }
      if (note.distractors && note.distractors.length > 0) {
        ctx.lines.push('Distractors:');
        for (const d of note.distractors) item(ctx, '- ', d, 'a distractor');
      }
      return;
    case 'ordering':
      field(ctx, 'Q', note.question, true);
      note.steps.forEach((s, i) => {
        item(ctx, `${i + 1}. `, s, 'a step');
      });
      return;
    case 'list':
      field(ctx, 'Q', note.question, true);
      note.items.forEach((s, i) => {
        item(ctx, note.ordered === true ? `${i + 1}. ` : '- ', s, 'an item');
      });
      return;
  }
}

function attributes(note: ImportNote): [string, string][] {
  const attrs: [string, string][] = [];
  if (note.uid !== undefined) attrs.push(['uid', note.uid]);
  const tags = tagsOf(note.tags);
  if (tags.length > 0) attrs.push(['tags', tags.join(' ')]);
  const options = note as Partial<Record<string, unknown>>;
  for (const key of ['caseSensitive', 'ignoreAccents', 'shuffle', 'ordered'])
    if (typeof options[key] === 'boolean') attrs.push([key, String(options[key])]);
  if (note.difficulty !== undefined) attrs.push(['difficulty', String(note.difficulty)]);
  if (note.needsReview !== undefined) attrs.push(['needsReview', String(note.needsReview)]);
  return attrs;
}

function writeNote(ctx: Ctx, note: ImportNote): void {
  ctx.lines.push(`::: ${note.type}${formatAttributes(attributes(note))}`);
  const explanation = { value: note.explanation };
  body(ctx, note, explanation);
  field(ctx, 'Extra', note.extra);
  for (const hint of asList(note.hint)) field(ctx, 'Hint', hint);
  field(ctx, 'Explanation', explanation.value);
  field(ctx, 'Source', sourceText(note.source));
  if (note.media && note.media.length > 0) warn(ctx, 'media references are not exported');
  ctx.lines.push(':::', '');
}

function frontMatter(doc: ImportDocument): string {
  const fm: Record<string, unknown> = { format: FORMAT_ID };
  if (doc.defaults?.deck !== undefined) fm.deck = doc.defaults.deck;
  const tags = tagsOf(doc.defaults?.tags);
  if (tags.length > 0) fm.tags = tags;
  return `---\n${stringify(fm, { lineWidth: 0, version: '1.2' })}---\n`;
}

function documentWarnings(doc: ImportDocument): string[] {
  const out: string[] = [];
  const lost = (['meta', 'decks', 'media', 'noteTypes'] as const).filter((k) => {
    const v = doc[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined;
  });
  if (lost.length > 0)
    out.push(`Document keys not representable in Markdown, dropped: ${lost.join(', ')}`);
  if (doc.defaults?.type !== undefined) out.push('defaults.type is not exported to Markdown');
  return out;
}

/** Canonical document → Mnemo Markdown (see the module comment for the conventions). */
export function exportMarkdown(doc: ImportDocument): { text: string; warnings: string[] } {
  const warnings = documentWarnings(doc);
  const lines: string[] = [frontMatter(doc)];
  const defaultDeck = doc.defaults?.deck;
  let current = defaultDeck;
  doc.notes.forEach((note, index) => {
    const ctx: Ctx = { lines, warnings, label: noteLabel(note, index) };
    const deck = note.deck ?? defaultDeck;
    if (deck !== undefined && deck !== current) {
      item(ctx, '@deck ', deck, 'the deck path');
      lines.push('');
      current = deck;
    }
    for (const tag of tagsOf(note.tags))
      if (/\s/.test(tag)) warn(ctx, `tag "${tag}" contains spaces: it will be split on import`);
    writeNote(ctx, note);
  });
  return { text: `${lines.join('\n').replace(/\n+$/, '')}\n`, warnings };
}
