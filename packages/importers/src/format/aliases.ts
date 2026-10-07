/**
 * Tolerated aliases (French and common AI variants). Each use produces an `alias` warning.
 * Versioned: changing this table is a format change, covered by tests.
 */
export const ALIASES_VERSION = 1;

/** Note type aliases → canonical type. */
export const TYPE_ALIASES: Readonly<Record<string, string>> = {
  qcm: 'mcq',
  quiz: 'mcq',
  trous: 'cloze',
  lacunes: 'cloze',
  'cloze-deletion': 'cloze',
  vf: 'truefalse',
  true_false: 'truefalse',
  association: 'matching',
  appariement: 'matching',
  ordre: 'ordering',
  sequence: 'ordering',
  liste: 'list',
  enumeration: 'list',
  flashcard: 'basic',
  carte: 'basic',
  reversible: 'basic_reversed',
  'aller-retour': 'basic_reversed',
};

/**
 * Note key aliases → canonical key. `question`, `q` and `recto` mean `front` only for
 * basic/basic_reversed/typed (mcq, ordering, list and matching have a real `question` key).
 */
export const KEY_ALIASES: Readonly<Record<string, string>> = {
  question: 'front',
  q: 'front',
  recto: 'front',
  réponse: 'back',
  reponse: 'back',
  r: 'back',
  verso: 'back',
  texte: 'text',
  phrase: 'text',
  indice: 'hint',
  hints: 'hint',
  explication: 'explanation',
  étiquettes: 'tags',
  etiquettes: 'tags',
  'mots-clés': 'tags',
  'mots-cles': 'tags',
  paquet: 'deck',
  deck_name: 'deck',
};

/** Keys whose alias to `front` applies only to these types. */
export const FRONT_ALIAS_TYPES: readonly string[] = ['basic', 'basic_reversed', 'typed'];
