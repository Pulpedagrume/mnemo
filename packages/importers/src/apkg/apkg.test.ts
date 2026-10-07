/// <reference types="node" />
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { builtinType, makeNote } from '../export/test/fixtures';
import { ANKI_SCHEMA_SQL } from './schema';
import { nodeEngine } from './test/nodeEngine';
import { apkgExportWarnings, readApkg, uidFromGuid, writeApkg } from '.';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0]);
const CRT = 1_700_000_000; // collection creation (epoch seconds)

const field = (name: string, ord: number) => ({ name, ord });
const tmpl = (name: string, ord: number, qfmt: string, afmt: string) => ({ name, ord, qfmt, afmt });
const MODELS = {
  '100': {
    id: 100,
    name: 'Basic',
    type: 0,
    flds: [field('Front', 0), field('Back', 1)],
    tmpls: [tmpl('Card 1', 0, '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}')],
    css: '',
  },
  '101': {
    id: 101,
    name: 'Cloze',
    type: 1,
    flds: [field('Text', 0), field('Back Extra', 1)],
    tmpls: [tmpl('Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>{{Back Extra}}')],
    css: '',
  },
  '102': {
    id: 102,
    name: 'Japonais',
    type: 0,
    flds: [field('Mot', 0), field('Lecture', 1), field('Exemple', 2)],
    tmpls: [
      tmpl(
        'Recto',
        0,
        '<div class="big">{{Mot}}</div>',
        '{{FrontSide}}<hr id=answer>{{furigana:Lecture}}<br>{{#Exemple}}<i>{{Exemple}}</i>{{/Exemple}} {{Tags}}',
      ),
    ],
    css: '.big { font-size: 40px; }',
  },
  '103': {
    id: 103,
    name: 'Basic (and reversed card)',
    type: 0,
    flds: [field('Front', 0), field('Back', 1)],
    tmpls: [
      tmpl('Card 1', 0, '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
      tmpl('Card 2', 1, '{{Back}}', '{{FrontSide}}<hr id=answer>{{Front}}'),
    ],
    css: '',
  },
};
const DECKS = {
  '1': { id: 1, name: 'Default', desc: '', dyn: 0 },
  '200': { id: 200, name: 'Géo::Europe', desc: '<b>Capitales</b>', dyn: 0 },
};

interface CardSpec {
  ord: number;
  type?: number;
  queue?: number;
  due?: number;
  ivl?: number;
  factor?: number;
  reps?: number;
  lapses?: number;
}

async function handBuiltApkg(
  notes: { guid: string; mid: number; tags: string; flds: string[]; cards: CardSpec[] }[],
  extra: (zip: JSZip) => void = () => undefined,
): Promise<Uint8Array> {
  const db = await nodeEngine.open();
  db.run(ANKI_SCHEMA_SQL);
  db.run('INSERT INTO col VALUES (1, ?, 0, 0, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
    CRT,
    '{}',
    JSON.stringify(MODELS),
    JSON.stringify(DECKS),
    '{}',
    '{}',
  ]);
  let cid = 1;
  notes.forEach((n, i) => {
    db.run('INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, ?, 0, 0, ?)', [
      i + 1,
      n.guid,
      n.mid,
      n.tags,
      n.flds.join('\u001f'),
      n.flds[0] ?? '',
      '',
    ]);
    for (const c of n.cards)
      db.run('INSERT INTO cards VALUES (?, ?, 200, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)', [
        cid++,
        i + 1,
        c.ord,
        c.type ?? 0,
        c.queue ?? 0,
        c.due ?? i,
        c.ivl ?? 0,
        c.factor ?? 0,
        c.reps ?? 0,
        c.lapses ?? 0,
        '',
      ]);
  });
  const zip = new JSZip();
  zip.file('collection.anki21', db.export());
  db.close();
  zip.file('media', JSON.stringify({ '0': 'paris.png', '1': 'seine.mp3' }));
  zip.file('0', PNG);
  zip.file('1', MP3);
  extra(zip);
  return zip.generateAsync({ type: 'uint8array' });
}

const SAMPLE = [
  {
    guid: 'abc123',
    mid: 100,
    tags: ' geo europe ',
    flds: ['<b>Capitale</b> de la France&nbsp;?', 'Paris<br><img src="paris.png">'],
    cards: [{ ord: 0, type: 2, queue: 2, due: 10, ivl: 7, factor: 2300, reps: 4, lapses: 1 }],
  },
  {
    guid: 'g`{x}',
    mid: 101,
    tags: '',
    flds: ['La {{c1::Seine}} traverse {{c2::Paris}}. [sound:seine.mp3]', '<div>Fleuve</div>'],
    cards: [{ ord: 0 }, { ord: 1, type: 1, queue: 1, due: CRT + 600, ivl: 0, factor: 2500 }],
  },
  {
    guid: 'jp1',
    mid: 102,
    tags: 'japonais',
    flds: ['猫', 'ねこ', '<table><tr><td>猫がいる</td></tr></table>'],
    cards: [{ ord: 0, queue: -1 }],
  },
  {
    guid: 'rev1',
    mid: 103,
    tags: '',
    flds: ['dog', '<span style="color:red">chien</span>'],
    cards: [{ ord: 0 }, { ord: 1 }],
  },
];

describe('readApkg', () => {
  it('converts a hand-built collection (models, decks, HTML, media, sounds)', async () => {
    const r = await readApkg(await handBuiltApkg(SAMPLE), nodeEngine, { fileName: 'x.apkg' });
    expect(r.report.counts).toMatchObject({ notes: 4, valid: 4, invalid: 0, errors: 0 });
    const [basic, cloze, custom, reversed] = r.notes;
    expect(basic).toMatchObject({
      uid: 'anki-abc123',
      noteTypeId: 'basic',
      deck: 'Géo::Europe',
      tags: ['geo', 'europe'],
      fields: { front: '**Capitale** de la France ?', back: 'Paris\n![](media:paris.png)' },
      media: ['paris.png'],
    });
    expect(cloze).toMatchObject({
      uid: uidFromGuid('g`{x}'),
      noteTypeId: 'cloze',
      fields: { text: 'La {{c1::Seine}} traverse {{c2::Paris}}.', extra: 'Fleuve' },
      cards: 2,
    });
    expect(cloze?.uid).toMatch(/^anki-x[0-9a-f]+$/);
    expect(custom?.noteTypeId).toBe('custom:anki-japonais-102');
    expect(custom?.fields).toEqual({
      mot: '猫',
      lecture: 'ねこ',
      exemple: '<table><tr><td>猫がいる</td></tr></table>',
    });
    expect(reversed).toMatchObject({ noteTypeId: 'basic_reversed', cards: 2 });
    expect(reversed?.fields.back).toBe('chien');

    expect(r.noteTypes).toEqual([
      {
        id: 'anki-japonais-102',
        name: 'Japonais',
        fields: ['Mot', 'Lecture', 'Exemple'],
        templates: [
          {
            name: 'Recto',
            front: '{{Mot}}',
            back: '{{FrontSide}}\n\n---\n\n{{Lecture}}\n{{#Exemple}}*{{Exemple}}*{{/Exemple}}',
          },
        ],
        css: '.big { font-size: 40px; }',
      },
    ]);
    expect(r.decks).toEqual([{ path: 'Géo::Europe', description: '**Capitales**' }]);
    expect(r.media).toEqual([{ id: 'paris.png', file: 'paris.png' }]);
    expect(r.mediaFiles.get('paris.png')).toEqual({
      bytes: PNG,
      mime: 'image/png',
      name: 'paris.png',
    });
    const codes = r.report.issues.map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining(['media_bad_type', 'unknown_note_type_def', 'html_sanitized']),
    );
    expect(r.report.issues.find((i) => i.code === 'media_bad_type')?.message.en).toContain(
      'seine.mp3',
    );
    expect(r.scheduling.size).toBe(0);
  });

  it('converts scheduling on request', async () => {
    const r = await readApkg(await handBuiltApkg(SAMPLE), nodeEngine, { withScheduling: true });
    expect(r.scheduling.get('anki-abc123')).toEqual([
      {
        ord: 0,
        suspended: false,
        memory: expect.objectContaining({
          state: 'review',
          due: (CRT + 10 * 86_400) * 1000,
          interval: 7,
          ease: 2.3,
          reps: 4,
          lapses: 1,
        }) as unknown,
      },
    ]);
    const learning = r.scheduling.get(uidFromGuid('g`{x}'));
    expect(learning).toHaveLength(1);
    expect(learning?.[0]).toMatchObject({
      ord: 1,
      memory: { state: 'learning', due: (CRT + 600) * 1000 },
    });
    expect(r.scheduling.get('anki-jp1')).toMatchObject([
      { ord: 0, suspended: true, memory: { state: 'new' } },
    ]);
    expect(r.scheduling.has('anki-rev1')).toBe(false);
  });

  it('refuses the recent anki21b format with a clear message', async () => {
    const bytes = await handBuiltApkg(SAMPLE, (zip) => zip.file('collection.anki21b', 'zstd'));
    const r = await readApkg(bytes, nodeEngine);
    expect(r.notes).toEqual([]);
    expect(r.report.counts.errors).toBe(1);
    expect(r.report.issues[0]?.howToFix.fr).toContain('Prendre en charge les anciennes versions');
  });

  it('reports non-zip and empty packages', async () => {
    const r = await readApkg(new Uint8Array([1, 2, 3]), nodeEngine);
    expect(r.report.issues[0]?.code).toBe('parse_error');
    const zip = new JSZip();
    zip.file('readme.txt', 'x');
    const empty = await readApkg(await zip.generateAsync({ type: 'uint8array' }), nodeEngine);
    expect(empty.report.issues[0]?.code).toBe('not_a_document');
  });
});

describe('writeApkg', () => {
  it('round-trips basic, reversed and cloze notes with tags, decks and an image', async () => {
    const notes = [
      {
        note: makeNote({
          uid: 'q-1',
          noteTypeId: 'basic',
          fields: { front: 'Capitale de la **France** ?', back: 'Paris\n![carte](media:m1)' },
          tags: ['geo', 'europe'],
        }),
        noteType: builtinType('basic'),
        deckPath: 'Géo::Europe',
      },
      {
        note: makeNote({ noteTypeId: 'basic_reversed', fields: { front: 'dog', back: 'chien' } }),
        noteType: builtinType('basic_reversed'),
        deckPath: 'Langues',
      },
      {
        note: makeNote({
          uid: 'anki-abc',
          noteTypeId: 'cloze',
          fields: { text: 'La {{c1::Seine}} traverse *Paris* (x < y & z).', extra: 'Fleuve' },
          tags: ['geo'],
        }),
        noteType: builtinType('cloze'),
        deckPath: '',
      },
    ];
    const bytes = await writeApkg(
      { notes, media: [{ id: 'm1', name: 'carte de France.png', bytes: PNG }], now: CRT * 1000 },
      nodeEngine,
    );
    const r = await readApkg(bytes, nodeEngine);
    expect(r.report.counts).toMatchObject({ notes: 3, valid: 3, errors: 0 });
    const [a, b, c] = r.notes;
    expect(a).toMatchObject({
      uid: 'q-1',
      noteTypeId: 'basic',
      deck: 'Géo::Europe',
      tags: ['geo', 'europe'],
      fields: {
        front: 'Capitale de la **France** ?',
        back: 'Paris\n![carte](media:carte_de_France.png)',
      },
    });
    expect(b).toMatchObject({ noteTypeId: 'basic_reversed', deck: 'Langues', cards: 2 });
    expect(b?.fields).toEqual({ front: 'dog', back: 'chien' });
    expect(c).toMatchObject({
      uid: 'anki-abc',
      noteTypeId: 'cloze',
      deck: 'Default',
      tags: ['geo'],
      fields: { text: 'La {{c1::Seine}} traverse *Paris* (x &lt; y & z).', extra: 'Fleuve' },
    });
    expect(r.mediaFiles.get('carte_de_France.png')?.bytes).toEqual(PNG);
  });

  it('converts other note types to Basic and reports what is lost', async () => {
    const note = makeNote({
      noteTypeId: 'truefalse',
      fields: { statement: 'Le ciel est vert.' },
      data: { kind: 'truefalse', answer: false },
      hints: ['couleur'],
    });
    const notes = [{ note, noteType: builtinType('truefalse'), deckPath: 'Quiz' }];
    expect(apkgExportWarnings(notes)).toHaveLength(2);
    const r = await readApkg(await writeApkg({ notes, media: [], now: 0 }, nodeEngine), nodeEngine);
    expect(r.notes[0]).toMatchObject({ noteTypeId: 'basic', deck: 'Quiz' });
    expect(r.notes[0]?.fields.front).toContain('Le ciel est vert.');
  });
});
