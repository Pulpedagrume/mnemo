import type { I18nString, Locale } from '../i18n';
import type { McqChoice, NoteData } from '../model/note';
import { seededRng, shuffled, type Rng } from '../rng';
import { canonicalJson, fnv1a } from '../util/hash';
import type { IndexedText, InteractivePayload, NoteContent } from './types';

/** Labels of a true/false answer. */
export const TRUE_FALSE_LABELS: Readonly<Record<'true' | 'false', I18nString>> = {
  true: { fr: 'Vrai', en: 'True' },
  false: { fr: 'Faux', en: 'False' },
};

/** Deterministic generator seeded from the note content (used when no Rng is injected). */
export function contentRng(note: NoteContent): Rng {
  return seededRng(parseInt(fnv1a(canonicalJson({ f: note.fields, d: note.data })), 16));
}

const indexed = (items: readonly string[]): IndexedText[] =>
  items.map((text, index) => ({ index, text }));

/** MCQ choices in display order (shuffled only when `shuffle`). */
export function mcqDisplayOrder(
  choices: readonly McqChoice[],
  shuffle: boolean,
  rng: Rng,
): IndexedText[] {
  const items = indexed(choices.map((c) => c.text));
  return shuffle ? shuffled(rng, items) : items;
}

/** Distinct right-hand options of a matching card (pair rights + distractors), shuffled. */
export function matchingOptions(
  pairs: readonly { right: string }[],
  distractors: readonly string[],
  rng: Rng,
): string[] {
  return shuffled(rng, [...new Set([...pairs.map((p) => p.right), ...distractors])]);
}

/**
 * Shuffled steps of an ordering card. When there are at least two distinct steps, the displayed
 * text sequence is guaranteed to differ from the correct one.
 */
export function shuffleOrdering(rng: Rng, steps: readonly string[]): IndexedText[] {
  const out = shuffled(rng, indexed(steps));
  const same = out.every((item, i) => item.text === steps[i]);
  if (same) {
    const j = out.findIndex((item) => item.text !== out[0]?.text);
    const first = out[0];
    const other = out[j];
    if (j > 0 && first && other) {
      out[0] = other;
      out[j] = first;
    }
  }
  return out;
}

/** Collapses an item onto one line so it fits in a Markdown list. */
const inline = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim();

export interface InteractiveParts {
  answer: string;
  payload: InteractivePayload;
}

/** Answer Markdown (without the question) and UI payload of an interactive card. */
export function interactiveParts(data: NoteData, rng: Rng, locale: Locale): InteractiveParts {
  switch (data.kind) {
    case 'typed':
      return {
        answer: data.answers.map((a) => `**${inline(a)}**`).join(' / '),
        payload: {
          kind: 'typed',
          caseSensitive: data.caseSensitive,
          ignoreAccents: data.ignoreAccents,
        },
      };
    case 'mcq': {
      const order = mcqDisplayOrder(data.choices, data.shuffle, rng);
      const lines = order.map(({ index }) => {
        const c = data.choices[index] as McqChoice;
        const text = c.correct ? `✓ **${inline(c.text)}**` : `✗ ${inline(c.text)}`;
        return c.explanation ? `- ${text} — ${inline(c.explanation)}` : `- ${text}`;
      });
      return {
        answer: lines.join('\n'),
        payload: {
          kind: 'mcq',
          choices: order,
          multiple: data.choices.filter((c) => c.correct).length > 1,
        },
      };
    }
    case 'truefalse':
      return {
        answer: `**${TRUE_FALSE_LABELS[data.answer ? 'true' : 'false'][locale]}**`,
        payload: { kind: 'truefalse' },
      };
    case 'matching':
      return {
        answer: data.pairs.map((p) => `- ${inline(p.left)} → **${inline(p.right)}**`).join('\n'),
        payload: {
          kind: 'matching',
          left: indexed(data.pairs.map((p) => p.left)),
          right: matchingOptions(data.pairs, data.distractors, rng),
        },
      };
    case 'ordering':
      return {
        answer: data.steps.map((s, i) => `${i + 1}. ${inline(s)}`).join('\n'),
        payload: { kind: 'ordering', steps: shuffleOrdering(rng, data.steps) },
      };
    case 'list':
      return {
        answer: data.items
          .map((s, i) => `${data.ordered ? `${i + 1}.` : '-'} ${inline(s)}`)
          .join('\n'),
        payload: { kind: 'list', ordered: data.ordered, count: data.items.length },
      };
  }
}
