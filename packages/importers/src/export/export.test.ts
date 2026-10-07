import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { Media } from '@mnemo/core';
import { ImportDocumentSchema, ImportNoteSchema } from '../format/schema';
import { IMPORT_FORMATS } from '../api';
import {
  IMPORT_SCHEMA_URL,
  buildImportDocument,
  exportDocument,
  exportNotes,
  mediaFileNames,
  mostCommonDeck,
  noteToImportNote,
  safeFileName,
} from '.';
import { CUSTOM_TYPE, builtinType, makeNote, sampleCollection } from './test/fixtures';

const media = (id: string, name: string, alt?: string): Media => ({
  id,
  sha256: 'a'.repeat(64),
  mime: 'image/png',
  size: 3,
  name,
  ...(alt === undefined ? {} : { alt }),
  createdAt: 0,
  updatedAt: 0,
});

describe('noteToImportNote', () => {
  it('maps every sample note to a valid canonical note', () => {
    for (const { note, noteType, deckPath } of sampleCollection()) {
      const out = noteToImportNote(note, noteType, { deckPath });
      expect(() => ImportNoteSchema.parse(out)).not.toThrow();
    }
  });

  it('omits defaults and the default deck, keeps type first and uid second', () => {
    const note = makeNote({
      uid: 'u1',
      noteTypeId: 'typed',
      fields: { front: 'Q' },
      data: { kind: 'typed', answers: ['a'], caseSensitive: false, ignoreAccents: true },
      hints: ['h'],
    });
    const out = noteToImportNote(note, builtinType('typed'), { deckPath: 'A', defaultDeck: 'A' });
    expect(out).toEqual({ type: 'typed', uid: 'u1', front: 'Q', answer: 'a', hint: 'h' });
    expect(Object.keys(out)).toEqual(['type', 'uid', 'front', 'answer', 'hint']);
  });

  it('keeps non-default options and several variants', () => {
    const note = makeNote({
      noteTypeId: 'typed',
      fields: { front: 'Q' },
      data: { kind: 'typed', answers: ['a', 'b'], caseSensitive: true, ignoreAccents: false },
    });
    expect(noteToImportNote(note, builtinType('typed'), { deckPath: 'B' })).toEqual({
      type: 'typed',
      front: 'Q',
      answer: ['a', 'b'],
      caseSensitive: true,
      ignoreAccents: false,
      deck: 'B',
    });
  });

  it('exports ordered lists, matching without question, drops empty sources', () => {
    const list = makeNote({
      noteTypeId: 'list',
      fields: { question: 'Q' },
      data: { kind: 'list', items: ['x'], ordered: true },
      source: { doc: ' ', section: '' },
    });
    expect(noteToImportNote(list, builtinType('list'), { deckPath: '' })).toEqual({
      type: 'list',
      question: 'Q',
      items: ['x'],
      ordered: true,
    });
    const matching = makeNote({
      noteTypeId: 'matching',
      fields: {},
      data: {
        kind: 'matching',
        pairs: [
          { left: 'a', right: 'b' },
          { left: 'c', right: 'd' },
        ],
        distractors: [],
      },
    });
    expect(noteToImportNote(matching, builtinType('matching'), { deckPath: '' })).toEqual({
      type: 'matching',
      pairs: [
        { left: 'a', right: 'b' },
        { left: 'c', right: 'd' },
      ],
    });
  });

  it('exports custom types with their declared field names', () => {
    const note = makeNote({ noteTypeId: 'vocab', fields: { word: 'w', meaning: 'm' } });
    expect(noteToImportNote(note, CUSTOM_TYPE, { deckPath: '' })).toEqual({
      type: 'custom:vocab',
      fields: { Word: 'w', Meaning: 'm' },
    });
  });

  it('throws when the structured data is missing', () => {
    const note = makeNote({ noteTypeId: 'mcq', fields: { question: 'Q' } });
    expect(() => noteToImportNote(note, builtinType('mcq'), { deckPath: '' })).toThrow(/mcq/);
  });
});

describe('buildImportDocument', () => {
  it('builds a valid document with defaults, media and custom note types', () => {
    const doc = buildImportDocument({
      notes: sampleCollection(),
      decks: [{ path: 'Réseaux', description: 'Cours' }],
      media: [media('m1', 'fig 1.png', 'Figure'), media('m2', 'fig_1.png')],
      meta: { title: 'Réseaux', language: 'fr' },
    });
    expect(ImportDocumentSchema.parse(doc)).toBeTruthy();
    expect(doc.$schema).toBe(IMPORT_SCHEMA_URL);
    expect(doc.defaults).toEqual({ deck: 'Réseaux::Ethernet' });
    expect(doc.media).toEqual([
      { id: 'm1', file: 'media/fig_1.png', alt: 'Figure' },
      { id: 'm2', file: 'media/fig_1-2.png' },
    ]);
    expect(doc.noteTypes?.map((t) => t.id)).toEqual(['vocab']);
    expect(doc.notes.find((n) => n.uid === 'phy-1-001')?.deck).toBe('Réseaux::Physique');
    expect(doc.notes.find((n) => n.uid === 'net-1-001')?.deck).toBeUndefined();
  });

  it('gives template types without templates a default one', () => {
    const type = { ...CUSTOM_TYPE, templates: [], css: '' };
    const note = makeNote({ noteTypeId: 'vocab', fields: { word: 'w' } });
    const doc = buildImportDocument({ notes: [{ note, noteType: type, deckPath: '' }] });
    expect(doc.noteTypes?.[0]).toEqual({
      id: 'vocab',
      name: 'Vocabulary',
      fields: ['Word', 'Meaning'],
      templates: [{ name: 'Card 1', front: '{{Word}}', back: '{{FrontSide}}' }],
    });
    expect(doc.defaults).toBeUndefined();
  });

  it('helpers: most common deck, safe and unique file names', () => {
    expect(mostCommonDeck(['a', 'b', 'b', '', 'a'])).toBe('a');
    expect(mostCommonDeck([' '])).toBeUndefined();
    expect(safeFileName('../../etc/passwd')).toBe('etc_passwd');
    expect(safeFileName('...')).toBe('file');
    const names = mediaFileNames([media('x', 'README'), media('y', 'readme')]);
    expect([...names.values()]).toEqual(['README', 'readme-2']);
  });
});

describe('exportDocument', () => {
  const doc = buildImportDocument({ notes: sampleCollection() });

  it.each(IMPORT_FORMATS)('exports every built-in type to %s', (format) => {
    const { text } = exportDocument(doc, format);
    expect(text.endsWith('\n')).toBe(true);
    if (format === 'json') expect(ImportDocumentSchema.parse(JSON.parse(text))).toEqual(doc);
    if (format === 'yaml') expect(ImportDocumentSchema.parse(parseYaml(text))).toEqual(doc);
  });

  it('JSON uses 2 spaces and the stable key order', () => {
    const { text } = exportNotes({ notes: sampleCollection().slice(0, 1) }, 'json');
    expect(text).toMatchInlineSnapshot(`
      "{
        "$schema": "https://mnemo.example/schema/mnemo-import.schema.json",
        "format": "mnemo/1",
        "defaults": {
          "deck": "Réseaux::Ethernet"
        },
        "notes": [
          {
            "type": "basic",
            "uid": "net-1-001",
            "front": "Rôle du champ **FCS** ?",
            "back": "Détecter les erreurs.",
            "tags": [
              "ethernet",
              "trame"
            ],
            "hint": "Fin de trame",
            "explanation": "CRC-32 calculé sur la trame.",
            "source": {
              "doc": "Cours réseau",
              "page": 12
            },
            "difficulty": 2
          }
        ]
      }
      "
    `);
  });

  it('YAML keeps LaTeX and code verbatim in literal blocks', () => {
    const tricky = [
      'Code:',
      '```ts',
      'const a = "x: y" # not a comment',
      '```',
      '$$',
      String.raw`\frac{a}{b} \\ x: 1`,
      '$$',
    ].join('\n');
    const note = makeNote({
      noteTypeId: 'basic',
      fields: { front: tricky, back: '  indented\n- not a list' },
    });
    const d = buildImportDocument({
      notes: [{ note, noteType: builtinType('basic'), deckPath: 'A' }],
    });
    const { text } = exportDocument(d, 'yaml');
    expect(text).toContain('front: |');
    expect(parseYaml(text)).toEqual(d);
  });

  it('Markdown snapshot', () => {
    const { text, warnings } = exportDocument(doc, 'markdown');
    expect(text).toMatchInlineSnapshot(`
      "---
      format: mnemo/1
      deck: Réseaux::Ethernet
      ---

      ::: basic uid=net-1-001 tags="ethernet trame" difficulty=2
      Q: Rôle du champ **FCS** ?
      A: Détecter les erreurs.
      Hint: Fin de trame
      Explanation: CRC-32 calculé sur la trame.
      Source: {"doc":"Cours réseau","page":12}
      :::

      ::: basic_reversed uid=net-1-002
      Q: FCS
      A: Frame Check Sequence
      Source: Glossaire
      :::

      ::: typed uid=net-1-003
      Q: Commande Cisco pour la table MAC ?
      Answer: show mac address-table | sh mac add
      Hint: Commence par show
      Hint: show mac …
      :::

      ::: cloze uid=net-1-004 tags=switch
      Text: Un commutateur apprend l’adresse {{c1::source::source ou destination ?}}.

      $$
      E = mc^2
      $$
      Extra: Voir la table CAM.
      :::

      @deck Réseaux::Physique

      ::: mcq uid=phy-1-001 shuffle=false needsReview=true
      Q: Quel support est insensible aux EMI ?
      - [x] Fibre optique
      - [ ] UTP
      - [ ] STP
      Explanation: - Fibre optique: La lumière.
      :::

      ::: truefalse uid=phy-1-002
      Statement: Le FCS est placé en début de trame.
      Answer: false
      :::

      @deck Réseaux::Ethernet

      ::: matching uid=net-1-005
      Q: Associe chaque situation au support.
      - Bureau => Cuivre
      - Entre bâtiments => Fibre
      Distractors:
      - Pigeon voyageur
      :::

      ::: ordering uid=net-1-006
      Q: Ordre du store-and-forward
      1. Réception
      2. Vérification du FCS
      3. Transmission
      :::

      ::: list uid=net-1-007
      Q: Cite les trois supports.
      - Cuivre
      - Fibre
      - Sans fil
      :::

      ::: custom:vocab uid=voc-1
      Word: trame
      Meaning: frame
      :::
      "
    `);
    expect(warnings).toMatchInlineSnapshot(`
      [
        "Document keys not representable in Markdown, dropped: noteTypes",
        "Note phy-1-001: per-choice explanations are not representable; appended to Explanation",
      ]
    `);
  });

  it('CSV snapshot', () => {
    const { text, warnings } = exportDocument(doc, 'csv');
    expect(text).toMatchInlineSnapshot(`
      "type,deck,tags,uid,front,back,text,extra,hint,explanation,source,question,choice1,choice2,choice3,choice4,choice5,choice6,choice7,choice8,correct
      basic,Réseaux::Ethernet,ethernet trame,net-1-001,Rôle du champ **FCS** ?,Détecter les erreurs.,,,Fin de trame,CRC-32 calculé sur la trame.,"{""doc"":""Cours réseau"",""page"":12}",,,,,,,,,,
      basic_reversed,Réseaux::Ethernet,,net-1-002,FCS,Frame Check Sequence,,,,,Glossaire,,,,,,,,,,
      cloze,Réseaux::Ethernet,switch,net-1-004,,,"Un commutateur apprend l’adresse {{c1::source::source ou destination ?}}.

      $$
      E = mc^2
      $$",Voir la table CAM.,,,,,,,,,,,,,
      mcq,Réseaux::Physique,,phy-1-001,,,,,,- Fibre optique: La lumière.,,Quel support est insensible aux EMI ?,Fibre optique,UTP,STP,,,,,,1
      "
    `);
    expect(warnings).toMatchInlineSnapshot(`
      [
        "Notes not representable in CSV, skipped: net-1-003 (typed), phy-1-002 (truefalse), net-1-005 (matching), net-1-006 (ordering), net-1-007 (list), voc-1 (custom:vocab)",
        "difficulty not representable, dropped: net-1-001",
        "needsReview not representable, dropped: phy-1-001",
        "per-choice explanations appended to explanation: phy-1-001",
        "shuffle=false not representable, dropped: phy-1-001",
      ]
    `);
  });
});
