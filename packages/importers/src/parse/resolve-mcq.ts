import type { NoteCtx } from './context';
import { t } from './issue';
import { foldName, isPlainObject } from './text';

function choiceText(c: unknown): string | undefined {
  if (typeof c === 'string') return c;
  if (isPlainObject(c) && typeof c.text === 'string') return c.text;
  return undefined;
}

/** 0-based index of an answer reference: letter, 1-based number, or the choice text. */
export function answerRef(ref: unknown, choices: readonly unknown[]): number | undefined {
  if (typeof ref === 'number') {
    return Number.isInteger(ref) && ref >= 1 && ref <= choices.length ? ref - 1 : undefined;
  }
  if (typeof ref !== 'string') return undefined;
  const s = ref.trim();
  const letter = /^([A-Ha-h])[).:]?$/.exec(s);
  if (letter) {
    const idx = (letter[1] ?? 'a').toLowerCase().charCodeAt(0) - 97;
    return idx < choices.length ? idx : undefined;
  }
  if (/^\d+$/.test(s)) return answerRef(Number(s), choices);
  const folded = foldName(s);
  const byText = choices.findIndex((c) => {
    const text = choiceText(c);
    return text !== undefined && foldName(text) === folded;
  });
  return byText >= 0 ? byText : undefined;
}

/**
 * Compact MCQ variant: `choices` as strings and `answers` as letters ("A"), 1-based numbers or
 * choice texts. Rewritten to `{ text, correct }` choices with an `answers_normalized` warning;
 * a reference to no choice is an `mcq_bad_answer_ref` error.
 */
export function normalizeCompactMcq(note: Record<string, unknown>, ctx: NoteCtx): void {
  const answers = note.answers;
  const choices = note.choices;
  if (answers === undefined || !Array.isArray(choices)) return;
  const refs = Array.isArray(answers) ? (answers as unknown[]) : [answers];
  const correct = new Set<number>();
  refs.forEach((ref, i) => {
    const idx = answerRef(ref, choices);
    if (idx === undefined) {
      ctx.sink.error(
        'mcq_bad_answer_ref',
        t(
          `La bonne réponse « ${String(ref)} » ne correspond à aucune proposition (${choices.length} propositions).`,
          `Correct answer "${String(ref)}" matches no choice (${choices.length} choices).`,
        ),
        t(
          'Indiquez les bonnes réponses par leur lettre (A, B…) ou leur numéro (1, 2…), ou mieux : mettez "correct": true dans la proposition.',
          'Give correct answers by letter (A, B…) or number (1, 2…), or better: set "correct": true on the choice.',
        ),
        ctx.loc(['answers', i]),
      );
    } else correct.add(idx);
  });
  note.choices = (choices as unknown[]).map((c, i) => {
    if (isPlainObject(c)) return { ...c, correct: c.correct === true || correct.has(i) };
    return { text: c, correct: correct.has(i) };
  });
  delete note.answers;
  ctx.sink.warn(
    'answers_normalized',
    t(
      'Format compact du QCM (« answers ») converti en propositions { text, correct }.',
      'Compact MCQ format ("answers") converted to { text, correct } choices.',
    ),
    t(
      'Préférez "choices": [{ "text": "…", "correct": true }, …].',
      'Prefer "choices": [{ "text": "…", "correct": true }, …].',
    ),
    ctx.loc(['answers']),
  );
}
