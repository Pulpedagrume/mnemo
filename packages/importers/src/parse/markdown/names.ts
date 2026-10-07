/** Field names, list syntax and value words of Mnemo Markdown blocks. */

export type Group =
  | 'front'
  | 'back'
  | 'text'
  | 'extra'
  | 'hint'
  | 'explanation'
  | 'source'
  | 'tags'
  | 'difficulty'
  | 'statement'
  | 'distractors';

/** Field names (folded: lowercase, no accents) → field group. */
export const FIELD_GROUPS: Readonly<Record<string, Group>> = {
  front: 'front',
  q: 'front',
  question: 'front',
  recto: 'front',
  back: 'back',
  a: 'back',
  answer: 'back',
  reponse: 'back',
  verso: 'back',
  text: 'text',
  texte: 'text',
  extra: 'extra',
  hint: 'hint',
  indice: 'hint',
  explanation: 'explanation',
  explication: 'explanation',
  source: 'source',
  tags: 'tags',
  difficulty: 'difficulty',
  difficulte: 'difficulty',
  statement: 'statement',
  affirmation: 'statement',
  distractors: 'distractors',
  leurres: 'distractors',
};

export const COMMON_GROUPS: ReadonlySet<Group> = new Set([
  'hint',
  'explanation',
  'source',
  'tags',
  'difficulty',
  'extra',
]);
export const LIST_TYPES = new Set(['mcq', 'matching', 'ordering', 'list']);
export const BOOLEAN_WORDS: Readonly<Record<string, boolean>> = {
  true: true,
  vrai: true,
  oui: true,
  v: true,
  yes: true,
  false: false,
  faux: false,
  non: false,
  f: false,
  no: false,
};

export const FIELD_LINE = /^(\p{L}[\p{L}\p{N}_-]*)([ \t]*):(?:[ \t]?)(.*)$/u;
export const BULLET = /^([-*+])[ \t]+(.*)$/;
export const NUMBERED = /^(\d{1,3})[.)][ \t]+(.*)$/;
export const CHECKBOX = /^\[([ xX✓✔])\][ \t]*(.*)$/;
export const ARROW = /\s*(=>|->|→)\s*/;

/** Note key of a field group for a note type (Q: is front, question or statement…). */
export function keyFor(type: string, group: Group): string {
  if (group === 'front') {
    if (type === 'basic' || type === 'basic_reversed' || type === 'typed') return 'front';
    if (LIST_TYPES.has(type)) return 'question';
    if (type === 'truefalse') return 'statement';
    return 'front';
  }
  if (group === 'back') {
    if (type === 'typed' || type === 'truefalse') return 'answer';
    return 'back';
  }
  return group;
}
