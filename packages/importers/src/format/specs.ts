import type { I18nString } from '@mnemo/core';
import type { ImportNoteType } from './schema';

/**
 * Human/AI-readable description of each note type, kept next to the Zod schemas (a test checks
 * that every field listed here exists in the schema with the same optionality). The prompt
 * composer and the documentation are generated from this table.
 */
export interface FieldDoc {
  key: string;
  required: boolean;
  doc: I18nString;
}

export interface NoteTypeDoc {
  type: ImportNoteType;
  doc: I18nString;
  cards: I18nString;
  fields: FieldDoc[];
  /** Minimal valid example (canonical keys). */
  example: Record<string, unknown>;
}

const f = (key: string, required: boolean, fr: string, en: string): FieldDoc => ({
  key,
  required,
  doc: { fr, en },
});

export const COMMON_FIELD_DOCS: readonly FieldDoc[] = [
  f(
    'uid',
    false,
    'identifiant stable et unique, [A-Za-z0-9._:-], 64 caractères max',
    'stable unique id, [A-Za-z0-9._:-], max 64 chars',
  ),
  f(
    'deck',
    false,
    'chemin du paquet, ex. « Réseaux::Ethernet »',
    'deck path, e.g. "Networks::Ethernet"',
  ),
  f('tags', false, 'liste d’étiquettes courtes', 'list of short tags'),
  f(
    'hint',
    false,
    'indice (ou liste, du plus discret au plus explicite) ; ne contient jamais la réponse',
    'hint (or list, most subtle first); never contains the answer',
  ),
  f(
    'explanation',
    false,
    'explication affichée avec la réponse',
    'explanation shown with the answer',
  ),
  f(
    'source',
    false,
    'objet {doc, page, section, url} ou texte',
    '{doc, page, section, url} object or text',
  ),
  f('difficulty', false, 'entier de 1 à 5', 'integer 1 to 5'),
  f('needsReview', false, 'true si le contenu est incertain', 'true when the content is uncertain'),
  f('extra', false, 'texte libre affiché après la réponse', 'free text shown after the answer'),
];

export const NOTE_TYPE_DOCS: Readonly<Record<ImportNoteType, NoteTypeDoc>> = {
  basic: {
    type: 'basic',
    doc: { fr: 'question / réponse', en: 'question / answer' },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [f('front', true, 'question', 'question'), f('back', true, 'réponse', 'answer')],
    example: {
      type: 'basic',
      front: 'Quel est le rôle du champ FCS ?',
      back: 'Détecter les erreurs de transmission.',
    },
  },
  basic_reversed: {
    type: 'basic_reversed',
    doc: { fr: 'paire symétrique terme ⇄ définition', en: 'symmetric pair term ⇄ definition' },
    cards: {
      fr: '2 cartes (recto→verso et verso→recto)',
      en: '2 cards (front→back and back→front)',
    },
    fields: [f('front', true, 'terme', 'term'), f('back', true, 'définition', 'definition')],
    example: { type: 'basic_reversed', front: 'FCS', back: 'Frame Check Sequence' },
  },
  typed: {
    type: 'typed',
    doc: { fr: 'réponse courte à saisir exactement', en: 'short answer to type exactly' },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [
      f('front', true, 'question', 'question'),
      f(
        'answer',
        true,
        'réponse, ou liste de variantes acceptées',
        'answer, or list of accepted variants',
      ),
      f(
        'caseSensitive',
        false,
        'true si la casse compte (défaut false)',
        'true if case matters (default false)',
      ),
      f(
        'ignoreAccents',
        false,
        'false si les accents comptent (défaut true)',
        'false if accents matter (default true)',
      ),
    ],
    example: {
      type: 'typed',
      front: 'Commande Cisco pour afficher la table MAC ?',
      answer: 'show mac address-table',
    },
  },
  cloze: {
    type: 'cloze',
    doc: {
      fr: 'texte à trous {{c1::réponse}} ou {{c1::réponse::indice}}',
      en: 'cloze text {{c1::answer}} or {{c1::answer::hint}}',
    },
    cards: { fr: '1 carte par numéro de trou (c1, c2…)', en: '1 card per cloze number (c1, c2…)' },
    fields: [
      f('text', true, 'phrase avec au moins un {{c1::…}}', 'sentence with at least one {{c1::…}}'),
    ],
    example: {
      type: 'cloze',
      text: 'Un commutateur apprend l’adresse {{c1::source::source ou destination ?}} des trames.',
    },
  },
  mcq: {
    type: 'mcq',
    doc: {
      fr: 'QCM, une ou plusieurs bonnes réponses',
      en: 'multiple choice, one or more correct answers',
    },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [
      f('question', true, 'énoncé', 'question'),
      f(
        'choices',
        true,
        '2 à 8 objets {text, correct, explanation}',
        '2 to 8 {text, correct, explanation} objects',
      ),
      f(
        'shuffle',
        false,
        'mélanger les propositions (défaut true)',
        'shuffle choices (default true)',
      ),
    ],
    example: {
      type: 'mcq',
      question: 'Quel support est insensible aux interférences électromagnétiques ?',
      choices: [
        {
          text: 'Fibre optique',
          correct: true,
          explanation: 'La lumière n’est pas sensible aux EMI.',
        },
        { text: 'UTP', correct: false },
        { text: 'STP', correct: false },
        { text: 'Coaxial', correct: false },
      ],
    },
  },
  truefalse: {
    type: 'truefalse',
    doc: { fr: 'affirmation vraie ou fausse', en: 'true or false statement' },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [
      f('statement', true, 'affirmation', 'statement'),
      f('answer', true, 'true ou false', 'true or false'),
    ],
    example: { type: 'truefalse', statement: 'Le FCS est placé en début de trame.', answer: false },
  },
  matching: {
    type: 'matching',
    doc: { fr: 'associer des éléments deux à deux', en: 'match items in pairs' },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [
      f('question', false, 'consigne', 'instruction'),
      f('pairs', true, '2 à 12 objets {left, right}', '2 to 12 {left, right} objects'),
      f(
        'distractors',
        false,
        'correspondances en trop (leurres)',
        'extra right-hand items (distractors)',
      ),
    ],
    example: {
      type: 'matching',
      question: 'Associe chaque situation au support adapté.',
      pairs: [
        { left: 'Câblage d’un bureau', right: 'Cuivre' },
        { left: 'Liaison entre bâtiments', right: 'Fibre optique' },
      ],
    },
  },
  ordering: {
    type: 'ordering',
    doc: { fr: 'remettre des étapes dans l’ordre', en: 'put steps in order' },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [
      f('question', true, 'consigne', 'instruction'),
      f('steps', true, '2 à 12 étapes dans le BON ordre', '2 to 12 steps in the CORRECT order'),
    ],
    example: {
      type: 'ordering',
      question: 'Remets dans l’ordre le traitement store-and-forward.',
      steps: ['Réception de la trame', 'Vérification du FCS', 'Transmission'],
    },
  },
  list: {
    type: 'list',
    doc: { fr: 'énumération à restituer', en: 'enumeration to recall' },
    cards: { fr: '1 carte', en: '1 card' },
    fields: [
      f('question', true, 'consigne', 'instruction'),
      f('items', true, 'éléments attendus', 'expected items'),
      f(
        'ordered',
        false,
        'true si l’ordre compte (défaut false)',
        'true if order matters (default false)',
      ),
    ],
    example: {
      type: 'list',
      question: 'Cite les trois types de supports réseau.',
      items: ['Cuivre', 'Fibre optique', 'Sans fil'],
    },
  },
};
