import type { I18nString, Locale } from '../i18n';
import type { Note } from '../model/note';
import type { NoteType, Renderer } from '../model/noteType';
import type { Rng } from '../rng';

/** The parts of a NoteType that card generation and rendering read. */
export type NoteTypeLike = Pick<NoteType, 'id' | 'renderer' | 'fields' | 'templates'>;

/** A NoteType without its sync timestamps (built-in definitions, extension definitions). */
export type NoteTypeSpec = Omit<NoteType, 'createdAt' | 'updatedAt' | 'deletedAt'>;

/** The parts of a Note that card generation and rendering read. */
export type NoteContent = Pick<Note, 'fields' | 'data' | 'explanation'> & {
  readonly hints?: readonly string[];
};

/** A problem found while parsing user content (cloze text, card template). */
export interface Problem {
  code: string;
  severity: 'error' | 'warning';
  message: I18nString;
  /** UTF-16 offset in the analysed text, when the problem has a location. */
  offset?: number;
}

export interface RenderOptions {
  /**
   * Randomness for shuffled choices/steps/options. When absent, a deterministic generator seeded
   * from the note content is used, so the same note always renders the same way.
   */
  rng?: Rng;
  /** Locale of the few labels written into the Markdown (e.g. True/False). Default `fr`. */
  locale?: Locale;
}

/** An item shown to the user, carrying its index in the note data. */
export interface IndexedText {
  /** Index in the original array (`data.choices`, `data.steps`, `data.pairs`). */
  index: number;
  text: string;
}

/** What the study UI needs to display an interactive card. Never contains the answer. */
export type InteractivePayload =
  | { kind: 'typed'; caseSensitive: boolean; ignoreAccents: boolean }
  | {
      kind: 'mcq';
      /** Choices in display order. */
      choices: IndexedText[];
      /** More than one correct choice: the UI shows checkboxes ("select all that apply"). */
      multiple: boolean;
    }
  | { kind: 'truefalse' }
  | {
      kind: 'matching';
      /** Left items in note order. */
      left: IndexedText[];
      /** Distinct right texts (pairs + distractors), shuffled. */
      right: string[];
    }
  | {
      kind: 'ordering';
      /** Steps in a shuffled order that always differs from the correct one (length >= 2). */
      steps: IndexedText[];
    }
  | { kind: 'list'; ordered: boolean; count: number };

export interface RenderedCard {
  kind: Renderer;
  /** Question side, Markdown. */
  front: string;
  /** Answer side, Markdown, self-sufficient (it repeats the question). */
  back: string;
  /** Hints from the most subtle to the most explicit (cloze `::hint` first). */
  hints: string[];
  /** Cloze `Extra` field, shown with the answer. */
  extra?: string;
  explanation?: string;
  interactive?: InteractivePayload;
}

export type GenerateFn = (note: NoteContent, noteType: NoteTypeLike) => number[];
export type RenderFn = (
  note: NoteContent,
  noteType: NoteTypeLike,
  ord: number,
  opts: RenderOptions,
) => RenderedCard;

/** A note type definition: its record plus optional custom card generation and rendering. */
export interface NoteTypeDef {
  noteType: NoteTypeSpec;
  generate?: GenerateFn;
  render?: RenderFn;
}

/** Thrown by renderCard when a card cannot be rendered (bad ord, missing data). */
export class CardRenderError extends Error {
  readonly code: 'invalid_ord' | 'missing_data';
  constructor(code: 'invalid_ord' | 'missing_data', message: string) {
    super(message);
    this.name = 'CardRenderError';
    this.code = code;
  }
}
