import { normalizeForFingerprint, parseCloze, type Problem } from '@mnemo/core';
import type { ImportNote } from '../format/schema';
import type { IssueCode } from '../report';
import type { NoteCtx } from './context';
import { t } from './issue';
import { isPlainObject } from './text';
import { isCustomNote } from './validate';

export const MAX_FIELD_LENGTH = 2000;
const MIN_QUESTION_LENGTH = 3;

const CLOZE_CODES: Readonly<Record<string, IssueCode>> = {
  no_cloze: 'cloze_no_hole',
  empty_answer: 'cloze_empty',
  unbalanced_braces: 'cloze_unbalanced',
  unterminated_cloze: 'cloze_unbalanced',
  nested_cloze: 'cloze_nested',
  invalid_number: 'cloze_invalid_number',
  skipped_number: 'cloze_skipped_number',
};

const CLOZE_FIX: Readonly<Record<string, ReturnType<typeof t>>> = {
  cloze_no_hole: t(
    'Ajoutez au moins un trou : {{c1::réponse}} (ou {{c1::réponse::indice}}), ou changez le type en « basic ».',
    'Add at least one cloze: {{c1::answer}} (or {{c1::answer::hint}}), or change the type to "basic".',
  ),
  cloze_empty: t(
    'Écrivez la réponse dans le trou : {{c1::réponse}}.',
    'Write the answer inside the cloze: {{c1::answer}}.',
  ),
  cloze_unbalanced: t(
    'Fermez chaque trou par « }} » et équilibrez les accolades (\\{ pour une accolade littérale).',
    'Close each cloze with "}}" and balance braces (\\{ for a literal brace).',
  ),
  cloze_nested: t(
    'Ne mettez pas de trou dans un trou : séparez-les.',
    'Do not put a cloze inside a cloze: split them.',
  ),
  cloze_invalid_number: t('Numérotez les trous à partir de c1.', 'Number clozes from c1.'),
  cloze_skipped_number: t(
    'Renumérotez les trous sans sauter de numéro (c1, c2, c3…).',
    'Renumber clozes without gaps (c1, c2, c3…).',
  ),
};

function checkCloze(text: string, ctx: NoteCtx): string[] {
  const parsed = parseCloze(text);
  // A broken hole is still a hole: do not also report « no cloze ».
  const broken = parsed.problems.some((p) => p.code !== 'no_cloze' && p.severity === 'error');
  parsed.problems.forEach((p: Problem) => {
    if (broken && p.code === 'no_cloze') return;
    const code = CLOZE_CODES[p.code] ?? 'cloze_unbalanced';
    const fix = CLOZE_FIX[code] ?? t('Corrigez le texte à trous.', 'Fix the cloze text.');
    const extra =
      p.offset === undefined
        ? {}
        : { excerpt: text.slice(Math.max(0, p.offset - 20), p.offset + 60) };
    if (p.severity === 'error') ctx.sink.error(code, p.message, fix, ctx.loc(['text'], extra));
    else ctx.sink.warn(code, p.message, fix, ctx.loc(['text'], extra));
  });
  return parsed.segments.flatMap((s) => (s.type === 'cloze' ? [s.answer] : []));
}

interface ChoiceLike {
  text: string;
  correct?: boolean;
}

function checkMcq(choices: readonly ChoiceLike[], ctx: NoteCtx): string[] {
  if (!choices.some((c) => c.correct === true)) {
    ctx.sink.error(
      'mcq_no_correct',
      t('QCM sans bonne réponse.', 'MCQ without a correct answer.'),
      t(
        'Marquez au moins une proposition comme correcte ("correct": true, ou « - [x] » en Markdown).',
        'Mark at least one choice as correct ("correct": true, or "- [x]" in Markdown).',
      ),
      ctx.loc(['choices']),
    );
  }
  const seen = new Map<string, number>();
  choices.forEach((c, i) => {
    const key = normalizeForFingerprint(c.text);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else {
      ctx.sink.error(
        'mcq_duplicate_choice',
        t(
          `Propositions ${first + 1} et ${i + 1} identiques : « ${c.text} ».`,
          `Choices ${first + 1} and ${i + 1} are identical: "${c.text}".`,
        ),
        t(
          'Remplacez le doublon par une autre proposition.',
          'Replace the duplicate with another choice.',
        ),
        ctx.loc(['choices', i]),
      );
    }
  });
  return choices.filter((c) => c.correct === true).map((c) => c.text);
}

function walkStrings(
  value: unknown,
  path: PropertyKey[],
  visit: (s: string, path: PropertyKey[]) => void,
): void {
  if (typeof value === 'string') visit(value, path);
  else if (Array.isArray(value))
    value.forEach((v, i) => {
      walkStrings(v, [...path, i], visit);
    });
  else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walkStrings(v, [...path, k], visit);
  }
}

const MEDIA_REF = /\]\(\s*<?media:([A-Za-z0-9._-]+)/g;

function primaryText(note: ImportNote): string | undefined {
  if ('front' in note) return note.front;
  if ('question' in note) return note.question;
  if ('statement' in note) return note.statement;
  return undefined;
}

function answersOf(note: ImportNote, ctx: NoteCtx): string[] {
  if (isCustomNote(note)) return [];
  switch (note.type) {
    case 'basic':
    case 'basic_reversed':
      return [note.back];
    case 'typed':
      return Array.isArray(note.answer) ? note.answer : [note.answer];
    case 'cloze':
      return checkCloze(note.text, ctx);
    case 'mcq':
      return checkMcq(
        note.choices.map((c) => (typeof c === 'string' ? { text: c } : c)),
        ctx,
      );
    default:
      return [];
  }
}

function checkHints(note: ImportNote, answers: readonly string[], ctx: NoteCtx): void {
  const hints = note.hint === undefined ? [] : Array.isArray(note.hint) ? note.hint : [note.hint];
  const norm = answers.map(normalizeForFingerprint).filter((a) => a !== '');
  hints.forEach((h, i) => {
    const hint = normalizeForFingerprint(h);
    const leak = norm.find((a) => hint === a || (a.length >= 3 && hint.includes(a)));
    if (leak === undefined) return;
    ctx.sink.warn(
      'hint_contains_answer',
      t(`L’indice contient la réponse (« ${leak} »).`, `The hint contains the answer ("${leak}").`),
      t(
        'Reformulez l’indice pour orienter sans donner la réponse.',
        'Rephrase the hint so it guides without giving the answer.',
      ),
      ctx.loc(Array.isArray(note.hint) ? ['hint', i] : ['hint']),
    );
  });
}

/**
 * Semantic checks of a schema-valid note (cloze syntax, MCQ answers, hints, lengths, media).
 * Returns the media ids the note references.
 */
export function checkNote(
  note: ImportNote,
  ctx: NoteCtx,
  declaredMedia: ReadonlySet<string>,
): string[] {
  const answers = answersOf(note, ctx);
  checkHints(note, answers, ctx);
  const primary = primaryText(note);
  if (primary !== undefined && primary.trim().length < MIN_QUESTION_LENGTH) {
    ctx.sink.warn(
      'question_too_short',
      t(`Question très courte : « ${primary} ».`, `Very short question: "${primary}".`),
      t(
        'Formulez une vraie question, compréhensible hors contexte.',
        'Write a real question, understandable out of context.',
      ),
      ctx.loc(['front' in note ? 'front' : 'question' in note ? 'question' : 'statement']),
    );
  }
  const media = new Set<string>(note.media ?? []);
  walkStrings(note, [], (s, path) => {
    if (s.length > MAX_FIELD_LENGTH) {
      ctx.sink.warn(
        'field_too_long',
        t(
          `Champ très long (${s.length} caractères, plus de ${MAX_FIELD_LENGTH}).`,
          `Very long field (${s.length} characters, over ${MAX_FIELD_LENGTH}).`,
        ),
        t(
          'Découpez en plusieurs notes plus courtes (une idée par carte).',
          'Split into several shorter notes (one idea per card).',
        ),
        ctx.loc(path),
      );
    }
    for (const m of s.matchAll(MEDIA_REF)) if (m[1] !== undefined) media.add(m[1]);
  });
  for (const id of media) {
    if (declaredMedia.has(id)) continue;
    ctx.sink.warn(
      'media_undeclared',
      t(
        `Média « ${id} » utilisé mais non déclaré dans « media ».`,
        `Media "${id}" is used but not declared in "media".`,
      ),
      t(
        `Déclarez-le : media: [{ id: "${id}", file: "media/…" }] et joignez le fichier (archive .zip), ou retirez l’image.`,
        `Declare it: media: [{ id: "${id}", file: "media/…" }] and include the file (.zip bundle), or remove the image.`,
      ),
      ctx.loc(['media']),
    );
  }
  return [...media];
}
