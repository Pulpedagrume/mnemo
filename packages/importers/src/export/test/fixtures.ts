import { builtinNoteType } from '@mnemo/core';
import type { BuiltinNoteTypeId, Note, NoteType } from '@mnemo/core';
import type { ExportNoteInput } from '../buildDocument';

export function builtinType(id: BuiltinNoteTypeId): NoteType {
  const spec = builtinNoteType(id);
  if (!spec) throw new Error(id);
  return { ...spec, createdAt: 0, updatedAt: 0 };
}

export const CUSTOM_TYPE: NoteType = {
  id: 'vocab',
  name: 'Vocabulary',
  builtin: false,
  renderer: 'template',
  fields: [{ name: 'Word' }, { name: 'Meaning' }],
  templates: [
    { name: 'Word → Meaning', front: '{{Word}}', back: '{{FrontSide}}\n---\n{{Meaning}}' },
  ],
  css: '.card { color: red; }',
  createdAt: 0,
  updatedAt: 0,
};

let counter = 0;
export function makeNote(partial: Partial<Note> & Pick<Note, 'noteTypeId' | 'fields'>): Note {
  counter += 1;
  return {
    id: `n${counter}`,
    deckId: 'd1',
    tags: [],
    hints: [],
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

const NET = 'Réseaux::Ethernet';
const PHYS = 'Réseaux::Physique';

/** One note of every built-in type plus a custom one, with the common keys exercised. */
export function sampleCollection(): ExportNoteInput[] {
  const t = builtinType;
  return [
    {
      deckPath: NET,
      noteType: t('basic'),
      note: makeNote({
        uid: 'net-1-001',
        noteTypeId: 'basic',
        fields: { front: 'Rôle du champ **FCS** ?', back: 'Détecter les erreurs.' },
        tags: ['ethernet', 'trame'],
        hints: ['Fin de trame'],
        explanation: 'CRC-32 calculé sur la trame.',
        source: { doc: 'Cours réseau', page: 12 },
        difficulty: 2,
      }),
    },
    {
      deckPath: NET,
      noteType: t('basic_reversed'),
      note: makeNote({
        uid: 'net-1-002',
        noteTypeId: 'basic_reversed',
        fields: { front: 'FCS', back: 'Frame Check Sequence' },
        source: { doc: 'Glossaire' },
      }),
    },
    {
      deckPath: NET,
      noteType: t('typed'),
      note: makeNote({
        uid: 'net-1-003',
        noteTypeId: 'typed',
        fields: { front: 'Commande Cisco pour la table MAC ?' },
        data: {
          kind: 'typed',
          answers: ['show mac address-table', 'sh mac add'],
          caseSensitive: false,
          ignoreAccents: true,
        },
        hints: ['Commence par show', 'show mac …'],
      }),
    },
    {
      deckPath: NET,
      noteType: t('cloze'),
      note: makeNote({
        uid: 'net-1-004',
        noteTypeId: 'cloze',
        fields: {
          text: 'Un commutateur apprend l’adresse {{c1::source::source ou destination ?}}.\n\n$$\nE = mc^2\n$$',
          extra: 'Voir la table CAM.',
        },
        tags: ['switch'],
      }),
    },
    {
      deckPath: PHYS,
      noteType: t('mcq'),
      note: makeNote({
        uid: 'phy-1-001',
        noteTypeId: 'mcq',
        fields: { question: 'Quel support est insensible aux EMI ?' },
        data: {
          kind: 'mcq',
          choices: [
            { text: 'Fibre optique', correct: true, explanation: 'La lumière.' },
            { text: 'UTP', correct: false },
            { text: 'STP', correct: false },
          ],
          shuffle: false,
        },
        needsReview: true,
      }),
    },
    {
      deckPath: PHYS,
      noteType: t('truefalse'),
      note: makeNote({
        uid: 'phy-1-002',
        noteTypeId: 'truefalse',
        fields: { statement: 'Le FCS est placé en début de trame.' },
        data: { kind: 'truefalse', answer: false },
      }),
    },
    {
      deckPath: NET,
      noteType: t('matching'),
      note: makeNote({
        uid: 'net-1-005',
        noteTypeId: 'matching',
        fields: { question: 'Associe chaque situation au support.' },
        data: {
          kind: 'matching',
          pairs: [
            { left: 'Bureau', right: 'Cuivre' },
            { left: 'Entre bâtiments', right: 'Fibre' },
          ],
          distractors: ['Pigeon voyageur'],
        },
      }),
    },
    {
      deckPath: NET,
      noteType: t('ordering'),
      note: makeNote({
        uid: 'net-1-006',
        noteTypeId: 'ordering',
        fields: { question: 'Ordre du store-and-forward' },
        data: { kind: 'ordering', steps: ['Réception', 'Vérification du FCS', 'Transmission'] },
      }),
    },
    {
      deckPath: NET,
      noteType: t('list'),
      note: makeNote({
        uid: 'net-1-007',
        noteTypeId: 'list',
        fields: { question: 'Cite les trois supports.' },
        data: { kind: 'list', items: ['Cuivre', 'Fibre', 'Sans fil'], ordered: false },
      }),
    },
    {
      deckPath: NET,
      noteType: CUSTOM_TYPE,
      note: makeNote({
        uid: 'voc-1',
        noteTypeId: 'vocab',
        fields: { word: 'trame', meaning: 'frame' },
      }),
    },
  ];
}
