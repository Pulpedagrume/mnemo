import type { ExampleDocument, ExampleNote } from './example-doc';
import { choicesOf, mergedExplanation, pairsOf, str, strings } from './example-doc';
import { yamlString } from './yaml';

/**
 * Mnemo Markdown writer for the prompt examples. Same conventions as the importer's exporter:
 * `::: type uid=… tags="…"` blocks closed by `:::`, `Q:`/`A:` fields, `- [x]` choices,
 * `- left => right` pairs, `1. step` steps, `Answer: a | b` typed variants, boolean options
 * and `difficulty`/`needsReview` as block attributes, `@deck` directives.
 */

const ATTRIBUTE_OPTIONS = ['caseSensitive', 'ignoreAccents', 'shuffle', 'ordered'] as const;

function attrValue(value: string): string {
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : `"${value.replace(/"/g, "'")}"`;
}

function openingLine(note: ExampleNote): string {
  const attrs: string[] = [];
  const uid = str(note.uid);
  if (uid !== undefined) attrs.push(`uid=${uid}`);
  const tags = strings(note.tags);
  if (tags.length > 0) attrs.push(`tags=${attrValue(tags.join(' '))}`);
  for (const key of ATTRIBUTE_OPTIONS) {
    if (typeof note[key] === 'boolean') attrs.push(`${key}=${String(note[key])}`);
  }
  if (typeof note.difficulty === 'number') attrs.push(`difficulty=${String(note.difficulty)}`);
  if (typeof note.needsReview === 'boolean') attrs.push(`needsReview=${String(note.needsReview)}`);
  return [`::: ${String(note.type)}`, ...attrs].join(' ');
}

function body(note: ExampleNote, lines: string[]): void {
  const field = (name: string, value: string | undefined): void => {
    if (value !== undefined) lines.push(`${name}: ${value}`);
  };
  switch (note.type) {
    case 'basic':
    case 'basic_reversed':
      field('Q', str(note.front));
      field('A', str(note.back));
      return;
    case 'typed':
      field('Q', str(note.front));
      field('Answer', strings(note.answer).join(' | '));
      return;
    case 'cloze':
      field('Text', str(note.text));
      return;
    case 'mcq':
      field('Q', str(note.question));
      for (const c of choicesOf(note)) lines.push(`${c.correct ? '- [x]' : '- [ ]'} ${c.text}`);
      return;
    case 'truefalse':
      field('Statement', str(note.statement));
      lines.push(`Answer: ${String(note.answer === true)}`);
      return;
    case 'matching':
      field('Q', str(note.question));
      for (const p of pairsOf(note)) lines.push(`- ${p.left} => ${p.right}`);
      if (strings(note.distractors).length > 0) {
        lines.push('Distractors:');
        for (const d of strings(note.distractors)) lines.push(`- ${d}`);
      }
      return;
    case 'ordering':
      field('Q', str(note.question));
      strings(note.steps).forEach((s, i) => lines.push(`${String(i + 1)}. ${s}`));
      return;
    case 'list':
      field('Q', str(note.question));
      strings(note.items).forEach((s, i) =>
        lines.push(note.ordered === true ? `${String(i + 1)}. ${s}` : `- ${s}`),
      );
      return;
    default:
      return;
  }
}

function sourceLine(source: unknown): string | undefined {
  if (typeof source === 'string') return source;
  return source === undefined ? undefined : JSON.stringify(source);
}

export function toMarkdown(doc: ExampleDocument): string {
  const deck = doc.defaults?.deck;
  const lines = ['---', `format: ${doc.format}`];
  if (deck !== undefined) lines.push(`deck: ${yamlString(deck)}`);
  lines.push('---', '');
  let current = deck;
  for (const note of doc.notes) {
    const noteDeck = str(note.deck) ?? deck;
    if (noteDeck !== undefined && noteDeck !== current) {
      lines.push(`@deck ${noteDeck}`, '');
      current = noteDeck;
    }
    lines.push(openingLine(note));
    body(note, lines);
    const field = (name: string, value: string | undefined): void => {
      if (value !== undefined) lines.push(`${name}: ${value}`);
    };
    field('Extra', str(note.extra));
    for (const hint of strings(note.hint)) field('Hint', hint);
    field('Explanation', note.type === 'mcq' ? mergedExplanation(note) : str(note.explanation));
    field('Source', sourceLine(note.source));
    lines.push(':::', '');
  }
  return lines.join('\n').trimEnd();
}
