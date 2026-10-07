import type { I18nString } from '../i18n';
import type { McqChoice } from '../model/note';
import {
  diffChars,
  normalizeAnswer,
  tidyAnswer,
  type AnswerNormalization,
  type DiffSegment,
} from './diff';

/** Result of an automatic check. The suggested rating can always be overridden by the user. */
export interface GradeResult<D> {
  correct: boolean;
  /** 3 (Good) when everything is right, 1 (Again) on any mistake. */
  suggestedRating: 1 | 3;
  details: D;
}

function result<D>(correct: boolean, details: D): GradeResult<D> {
  return { correct, suggestedRating: correct ? 3 : 1, details };
}

// ---------------------------------------------------------------------------------------- MCQ

export type McqChoiceStatus = 'correct' | 'wrong' | 'missed' | 'neutral';

/** Labels of the MCQ statuses shown next to each choice (`neutral` has none). */
export const MCQ_STATUS_LABELS: Readonly<Record<Exclude<McqChoiceStatus, 'neutral'>, I18nString>> =
  {
    correct: { fr: 'Bonne réponse', en: 'Correct' },
    wrong: { fr: 'Erreur', en: 'Wrong' },
    missed: { fr: 'À choisir', en: 'Should be selected' },
  };

export interface McqChoiceGrade {
  /** Index in `data.choices`. */
  index: number;
  selected: boolean;
  status: McqChoiceStatus;
  label?: I18nString;
}

/** Grades an MCQ answer given the selected original choice indices (out-of-range ones ignored). */
export function gradeMcq(
  choices: readonly McqChoice[],
  selectedOriginalIndices: readonly number[],
): GradeResult<{ choices: McqChoiceGrade[] }> {
  const selected = new Set(selectedOriginalIndices);
  const graded = choices.map((choice, index): McqChoiceGrade => {
    const isSelected = selected.has(index);
    const status: McqChoiceStatus = isSelected
      ? choice.correct
        ? 'correct'
        : 'wrong'
      : choice.correct
        ? 'missed'
        : 'neutral';
    return status === 'neutral'
      ? { index, selected: isSelected, status }
      : { index, selected: isSelected, status, label: MCQ_STATUS_LABELS[status] };
  });
  const ok = graded.every((g) => g.status === 'correct' || g.status === 'neutral');
  return result(ok, { choices: graded });
}

// ---------------------------------------------------------------------------------- True/false

export function gradeTrueFalse(
  answer: boolean,
  chosen: boolean,
): GradeResult<{ expected: boolean; chosen: boolean }> {
  return result(answer === chosen, { expected: answer, chosen });
}

// ------------------------------------------------------------------------------------ Matching

export interface MatchingPairGrade {
  /** Index in `data.pairs`. */
  index: number;
  expected: string;
  given: string | null;
  status: 'correct' | 'wrong' | 'missing';
}

/** Grades a matching answer: `assignment[leftIndex]` is the chosen right text, or null. */
export function gradeMatching(
  pairs: readonly { left: string; right: string }[],
  assignment: Readonly<Record<number, string | null | undefined>>,
): GradeResult<{ pairs: MatchingPairGrade[] }> {
  const graded = pairs.map((pair, index): MatchingPairGrade => {
    const given = assignment[index] ?? null;
    const status =
      given === null ? 'missing' : given.trim() === pair.right.trim() ? 'correct' : 'wrong';
    return { index, expected: pair.right, given, status };
  });
  return result(
    graded.every((g) => g.status === 'correct'),
    { pairs: graded },
  );
}

// ------------------------------------------------------------------------------------ Ordering

export interface OrderingPositionGrade {
  position: number;
  /** Original index of the step expected at this position. */
  expectedIndex: number;
  /** Original index of the step placed here, or null when missing. */
  givenIndex: number | null;
  correct: boolean;
}

/** Grades an ordering answer given the original step indices in submitted order. */
export function gradeOrdering(
  steps: readonly string[],
  submittedOrder: readonly number[],
): GradeResult<{ positions: OrderingPositionGrade[] }> {
  const positions = steps.map((step, position): OrderingPositionGrade => {
    const given = submittedOrder[position];
    const givenIndex = given !== undefined && given >= 0 && given < steps.length ? given : null;
    // Compared by text, so swapping two identical steps is not a mistake.
    const correct = givenIndex !== null && steps[givenIndex] === step;
    return { position, expectedIndex: position, givenIndex, correct };
  });
  const ok = submittedOrder.length === steps.length && positions.every((p) => p.correct);
  return result(ok, { positions });
}

// ---------------------------------------------------------------------------------------- List

/** Lenient comparison used for typed list items. */
const LIST_NORMALIZATION: AnswerNormalization = { caseSensitive: false, ignoreAccents: true };

export interface ListGradeDetails {
  /** Typed items that match an expected item. */
  matched: { itemIndex: number; typed: string }[];
  /** Indices of expected items that were not typed. */
  missing: number[];
  /** Typed items matching nothing. */
  extra: string[];
  /** Ordered lists: whether the matched items were typed in the right order. */
  inOrder?: boolean;
}

/**
 * Grades a list answer. Without typed items (the user only revealed the answer), the card is
 * self-graded and this returns null.
 */
export function gradeList(
  items: readonly string[],
  typedItems: readonly string[] | undefined,
  ordered: boolean,
): GradeResult<ListGradeDetails> | null {
  if (typedItems === undefined) return null;
  const expected = items.map((i) => normalizeAnswer(i, LIST_NORMALIZATION));
  const used = new Set<number>();
  const matched: ListGradeDetails['matched'] = [];
  const extra: string[] = [];
  for (const typed of typedItems) {
    const norm = normalizeAnswer(typed, LIST_NORMALIZATION);
    if (norm === '') continue;
    const itemIndex = expected.findIndex((e, k) => e === norm && !used.has(k));
    if (itemIndex < 0) {
      extra.push(typed);
    } else {
      used.add(itemIndex);
      matched.push({ itemIndex, typed });
    }
  }
  const missing = items.map((_, k) => k).filter((k) => !used.has(k));
  const details: ListGradeDetails = { matched, missing, extra };
  let ok = missing.length === 0 && extra.length === 0;
  if (ordered) {
    details.inOrder = matched.every((m, k) => m.itemIndex === k);
    ok &&= details.inOrder;
  }
  return result(ok, details);
}

// --------------------------------------------------------------------------------------- Typed

export interface TypedGradeDetails {
  /** Input as compared (tidied, capped at 500 characters). */
  input: string;
  /** Accepted variant closest to the input ('' when there is none). */
  closest: string;
  /** Character diff of the input against `closest`. */
  segments: DiffSegment[];
}

/**
 * Grades a typed answer: correct when it equals one accepted variant after normalization (trim,
 * whitespace collapsing, optional case folding, optional accent stripping).
 */
export function gradeTyped(
  input: string,
  answers: readonly string[],
  opts: AnswerNormalization,
): GradeResult<TypedGradeDetails> {
  const tidyInput = tidyAnswer(input);
  const normInput = normalizeAnswer(tidyInput, opts);
  let best: { variant: string; segments: DiffSegment[]; distance: number } | null = null;
  let correct = false;
  for (const answer of answers) {
    const variant = tidyAnswer(answer);
    const { segments, lcs } = diffChars(tidyInput, variant, opts);
    const distance = Array.from(tidyInput).length + Array.from(variant).length - 2 * lcs;
    const exact = normalizeAnswer(variant, opts) === normInput;
    if (exact && !correct) {
      correct = true;
      best = { variant, segments, distance: -1 };
    } else if (!correct && (best === null || distance < best.distance)) {
      best = { variant, segments, distance };
    }
  }
  return result(correct, {
    input: tidyInput,
    closest: best?.variant ?? '',
    segments: best?.segments ?? (tidyInput === '' ? [] : [{ type: 'extra', text: tidyInput }]),
  });
}
