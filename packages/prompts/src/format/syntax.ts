import type { I18nString } from '@mnemo/core';
import type { ImportNoteType } from '@mnemo/importers';

/**
 * How each field of NOTE_TYPE_DOCS is written in Markdown and CSV (JSON and YAML use the
 * canonical keys as is). The field descriptions themselves always come from NOTE_TYPE_DOCS /
 * COMMON_FIELD_DOCS; a test checks that every documented field has an entry here.
 *
 * - `label`: `Label: value` line; `syntax` replaces the generic description when the value has
 *   a dedicated line syntax; `attribute`: option written on the `::: type` line.
 * - `null`: not representable in that format (left out of the spec).
 */
export type FieldSyntax =
  | { kind: 'label'; label: string; syntax?: I18nString }
  | { kind: 'lines'; syntax: I18nString }
  | { kind: 'attribute'; value?: string }
  | null;

const label = (l: string, syntax?: I18nString): FieldSyntax =>
  syntax ? { kind: 'label', label: l, syntax } : { kind: 'label', label: l };
const lines = (fr: string, en: string): FieldSyntax => ({ kind: 'lines', syntax: { fr, en } });
const attribute: FieldSyntax = { kind: 'attribute' };
const attr = (value: string): FieldSyntax => ({ kind: 'attribute', value });

export const MARKDOWN_FIELDS: Readonly<Record<ImportNoteType, Readonly<Record<string, FieldSyntax>>>> =
  {
    basic: { front: label('Q'), back: label('A') },
    basic_reversed: { front: label('Q'), back: label('A') },
    typed: {
      front: label('Q'),
      answer: label('Answer', {
        fr: 'réponse (variantes séparées par « | »)',
        en: 'answer (variants separated by " | ")',
      }),
      caseSensitive: attr('true'),
      ignoreAccents: attr('false'),
    },
    cloze: {
      text: label('Text', {
        fr: 'phrase avec {{c1::réponse}} ou {{c1::réponse::indice}} (au moins un trou)',
        en: 'sentence with {{c1::answer}} or {{c1::answer::hint}} (at least one blank)',
      }),
    },
    mcq: {
      question: label('Q'),
      choices: lines(
        '« - [x] juste » ou « - [ ] faux », une par ligne (2 à 8)',
        '"- [x] right" or "- [ ] wrong", one per line (2 to 8)',
      ),
      shuffle: attr('false'),
    },
    truefalse: { statement: label('Statement'), answer: label('Answer') },
    matching: {
      question: label('Q'),
      pairs: lines(
        '« - gauche => droite », une par ligne (2 à 12)',
        '"- left => right", one per line (2 to 12)',
      ),
      distractors: lines(
        '« Distractors: » puis « - leurre » par ligne',
        '"Distractors:" then "- item" per line',
      ),
    },
    ordering: {
      question: label('Q'),
      steps: lines(
        '« 1. étape », une par ligne, dans le BON ordre (2 à 12)',
        '"1. step", one per line, in the CORRECT order (2 to 12)',
      ),
    },
    list: {
      question: label('Q'),
      items: lines('« - élément », un par ligne', '"- item", one per line'),
      ordered: attr('true'),
    },
  };

/**
 * Common keys in Markdown, rendered compactly (the quality rules explain their use): attributes
 * with a sample value, field labels with a short note. `@deck` (structure lines) covers deck.
 */
export const MARKDOWN_COMMON: Readonly<Record<string, FieldSyntax>> = {
  uid: attribute,
  deck: null,
  tags: attr('"a b"'),
  hint: label('Hint', { fr: 'une ligne par indice', en: 'one line per hint' }),
  explanation: label('Explanation'),
  source: label('Source'),
  difficulty: attr('1…5'),
  needsReview: attr('true'),
  extra: label('Extra'),
};

export const CSV_FIELDS: Readonly<Partial<Record<ImportNoteType, Readonly<Record<string, FieldSyntax>>>>> =
  {
    basic: { front: label('front'), back: label('back') },
    basic_reversed: { front: label('front'), back: label('back') },
    cloze: { text: label('text') },
    mcq: {
      question: label('question'),
      choices: lines(
        'colonnes choice1 à choice8 (2 à 8 propositions) et correct = numéros des bonnes propositions, à partir de 1, séparés par |',
        'columns choice1 to choice8 (2 to 8 choices) and correct = numbers of the correct choices, from 1, separated by |',
      ),
      shuffle: null,
    },
  };

export const CSV_COMMON: Readonly<Record<string, FieldSyntax>> = {
  uid: label('uid'),
  deck: label('deck'),
  tags: label('tags', { fr: 'séparés par des espaces', en: 'separated by spaces' }),
  hint: label('hint', { fr: 'plusieurs : séparés par « | »', en: 'several: separated by " | "' }),
  explanation: label('explanation'),
  source: label('source'),
  difficulty: null,
  needsReview: null,
  extra: label('extra'),
};
