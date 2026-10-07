import { DEFAULT_LOCALE } from '../i18n';
import { FIELD, getField, primaryFieldKey } from './builtins';
import { clozeHints, clozeNumbers, renderClozeBack, renderClozeFront } from './cloze';
import { templateClozeFields } from './generate';
import { contentRng, interactiveParts } from './interactive';
import { noteTypeRegistry, type NoteTypeRegistry } from './registry';
import { renderTemplate } from './template';
import {
  CardRenderError,
  type NoteContent,
  type NoteTypeLike,
  type RenderOptions,
  type RenderedCard,
} from './types';

/** Separator between the question and the answer on self-sufficient back sides. */
export const ANSWER_SEPARATOR = '\n\n---\n\n';

function withExplanation(card: RenderedCard, note: NoteContent): RenderedCard {
  if (
    card.explanation === undefined &&
    note.explanation !== undefined &&
    note.explanation.trim() !== ''
  ) {
    card.explanation = note.explanation;
  }
  return card;
}

const noteHints = (note: NoteContent): string[] => [...(note.hints ?? [])];

function renderTemplated(note: NoteContent, noteType: NoteTypeLike, ord: number): RenderedCard {
  const clozeFields = templateClozeFields(noteType);
  const isCloze = clozeFields.length > 0;
  const template = noteType.templates[isCloze ? 0 : ord];
  if (!template) {
    throw new CardRenderError('invalid_ord', `No template ${ord} in note type ${noteType.id}`);
  }
  const clozeNumber = isCloze ? ord + 1 : 1;
  if (
    isCloze &&
    !clozeFields.some((f) => clozeNumbers(getField(note.fields, f)).includes(clozeNumber))
  ) {
    throw new CardRenderError('invalid_ord', `The note has no cloze c${clozeNumber}`);
  }
  const front = renderTemplate(template.front, { fields: note.fields, side: 'front', clozeNumber });
  const back = renderTemplate(template.back, {
    fields: note.fields,
    side: 'back',
    frontSide: front,
    clozeNumber,
  });
  const hints = clozeFields.flatMap((f) => clozeHints(getField(note.fields, f), clozeNumber));
  return { kind: noteType.renderer, front, back, hints: dedupe([...hints, ...noteHints(note)]) };
}

function renderClozeCard(note: NoteContent, ord: number): RenderedCard {
  const text = getField(note.fields, FIELD.text);
  const n = ord + 1;
  if (!clozeNumbers(text).includes(n)) {
    throw new CardRenderError('invalid_ord', `The note has no cloze c${n}`);
  }
  const card: RenderedCard = {
    kind: 'cloze',
    front: renderClozeFront(text, n),
    back: renderClozeBack(text, n),
    hints: dedupe([...clozeHints(text, n), ...noteHints(note)]),
  };
  const extra = getField(note.fields, FIELD.extra);
  if (extra.trim() !== '') card.extra = extra;
  return card;
}

function renderInteractiveCard(
  note: NoteContent,
  noteType: NoteTypeLike,
  ord: number,
  opts: RenderOptions,
): RenderedCard {
  if (ord !== 0) {
    throw new CardRenderError('invalid_ord', `Interactive cards only have ord 0 (got ${ord})`);
  }
  const data = note.data;
  if (data?.kind !== noteType.renderer) {
    throw new CardRenderError(
      'missing_data',
      `Note type ${noteType.id} needs data of kind "${noteType.renderer}"`,
    );
  }
  const question = getField(note.fields, primaryFieldKey(noteType));
  const { answer, payload } = interactiveParts(
    data,
    opts.rng ?? contentRng(note),
    opts.locale ?? DEFAULT_LOCALE,
  );
  return {
    kind: noteType.renderer,
    front: question,
    back: question.trim() === '' ? answer : `${question}${ANSWER_SEPARATOR}${answer}`,
    hints: noteHints(note),
    interactive: payload,
  };
}

function dedupe(items: readonly string[]): string[] {
  return [...new Set(items)];
}

/**
 * Renders card `ord` of a note as Markdown plus, for interactive types, the UI payload.
 * The front never contains the answer. Throws CardRenderError for an ord the note does not
 * produce or for missing/mismatched `data`.
 */
export function renderCard(
  note: NoteContent,
  noteType: NoteTypeLike,
  ord: number,
  opts: RenderOptions = {},
  registry: NoteTypeRegistry = noteTypeRegistry,
): RenderedCard {
  const custom = registry.get(noteType.id)?.render;
  const card = custom
    ? custom(note, noteType, ord, opts)
    : noteType.renderer === 'basic' || noteType.renderer === 'template'
      ? renderTemplated(note, noteType, ord)
      : noteType.renderer === 'cloze'
        ? renderClozeCard(note, ord)
        : renderInteractiveCard(note, noteType, ord, opts);
  return withExplanation(card, note);
}
