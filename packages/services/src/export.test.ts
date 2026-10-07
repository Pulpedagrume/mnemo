import { describe, expect, it } from 'vitest';
import type { Note } from '@mnemo/core';
import { manualClock, seededRng } from '@mnemo/core';
import { parseImport, readBundle } from '@mnemo/importers';
import { createMemoryRepository } from '@mnemo/storage';
import {
  applyImport,
  createDeck,
  createNote,
  createServiceContext,
  ensureCollection,
  exportNotes,
  type MediaPayload,
  type NoteInput,
} from './index';

// 1×1 PNG.
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 10, 0x49, 0x44, 0x41, 0x54, 0x78,
  0x9c, 0x63, 0, 1, 0, 0, 5, 0, 1, 0x0d, 0x0a, 0x2d, 0xb4, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

async function context() {
  const ctx = createServiceContext({
    repo: createMemoryRepository(),
    clock: manualClock(Date.UTC(2026, 9, 7)),
    rng: seededRng(9),
    deviceTimeZone: 'UTC',
  });
  await ensureCollection(ctx, 'fr');
  return ctx;
}

const base = { tags: ['ccna', 'trame'], hints: ['Indice discret', 'Indice explicite'] };

function samples(deckId: string, mediaId: string): NoteInput[] {
  return [
    {
      ...base,
      uid: 'n-basic',
      noteTypeId: 'basic',
      deckId,
      fields: { front: 'FCS ? ![t](media:' + mediaId + ')', back: 'Détection $E=mc^2$' },
      explanation: 'Car CRC.',
      source: { section: '5.2', page: '12' },
    },
    {
      ...base,
      uid: 'n-rev',
      noteTypeId: 'basic_reversed',
      deckId,
      fields: { front: 'FCS', back: 'Frame Check Sequence' },
    },
    {
      ...base,
      uid: 'n-typed',
      noteTypeId: 'typed',
      deckId,
      fields: { front: 'Commande ?' },
      data: {
        kind: 'typed',
        answers: ['show run', 'sh run'],
        caseSensitive: false,
        ignoreAccents: true,
      },
    },
    {
      ...base,
      uid: 'n-cloze',
      noteTypeId: 'cloze',
      deckId,
      fields: { text: 'Le {{c1::CRC::sigle}} et la {{c2::trame}}.', extra: 'Couche 2' },
    },
    {
      ...base,
      uid: 'n-mcq',
      noteTypeId: 'mcq',
      deckId,
      fields: { question: 'Support insensible aux EMI ?' },
      data: {
        kind: 'mcq',
        shuffle: true,
        choices: [
          { text: 'Fibre', correct: true },
          { text: 'UTP', correct: false },
          { text: 'STP', correct: false },
        ],
      },
    },
    {
      ...base,
      uid: 'n-tf',
      noteTypeId: 'truefalse',
      deckId,
      fields: { statement: 'Le FCS est en tête.' },
      data: { kind: 'truefalse', answer: false },
    },
    {
      ...base,
      uid: 'n-match',
      noteTypeId: 'matching',
      deckId,
      fields: { question: 'Associe.' },
      data: {
        kind: 'matching',
        pairs: [
          { left: 'Bureau', right: 'Cuivre' },
          { left: 'Campus', right: 'Fibre' },
        ],
        distractors: [],
      },
    },
    {
      ...base,
      uid: 'n-order',
      noteTypeId: 'ordering',
      deckId,
      fields: { question: 'Ordre ?' },
      data: { kind: 'ordering', steps: ['Réception', 'Vérification', 'Envoi'] },
    },
    {
      ...base,
      uid: 'n-list',
      noteTypeId: 'list',
      deckId,
      fields: { question: 'Supports ?' },
      data: { kind: 'list', items: ['Cuivre', 'Fibre'], ordered: false },
    },
  ];
}

/** Comparable view of a note, independent of ids and timestamps. */
function view(n: Note, mediaName: (id: string) => string) {
  const fix = (s: string) =>
    s.replace(/media:([\w.-]+)/g, (_, id: string) => `media:${mediaName(id)}`);
  return {
    uid: n.uid,
    noteTypeId: n.noteTypeId,
    fields: Object.fromEntries(Object.entries(n.fields).map(([k, v]) => [k, fix(v)])),
    data: n.data,
    tags: n.tags,
    hints: n.hints,
    explanation: n.explanation,
    source: n.source,
  };
}

describe('export → import round trip', () => {
  it.each(['json', 'yaml', 'markdown', 'zip'] as const)(
    'gives back the same notes (%s)',
    async (format) => {
      const source = await context();
      const deck = await createDeck(source, 'Réseaux::Ethernet');
      const now = source.clock.now();
      await source.repo.media.put({
        id: 'img1',
        sha256: 'f'.repeat(64),
        mime: 'image/png',
        size: PNG.byteLength,
        name: 'trame.png',
        createdAt: now,
        updatedAt: now,
      });
      await source.repo.media.putContent('img1', PNG);
      for (const input of samples(deck.id, 'img1')) await createNote(source, input);

      const exported = await exportNotes(source, { deckId: deck.id, format });
      expect(exported.notes).toBe(9);
      let text: string;
      let media = new Map<string, MediaPayload>();
      if (typeof exported.content === 'string') text = exported.content;
      else {
        const bundle = await readBundle(exported.content);
        expect(bundle.issues.filter((i) => i.severity === 'error')).toEqual([]);
        text = bundle.main?.text ?? '';
        const parsedForMedia = parseImport(text, { fileName: bundle.main?.name ?? 'deck.json' });
        media = new Map(
          parsedForMedia.media.flatMap((d) => {
            const entry = d.file ? bundle.media.get(d.file) : undefined;
            return entry ? [[d.id, { bytes: entry.bytes, mime: entry.mime }] as const] : [];
          }),
        );
      }
      const parsed = parseImport(text, { fileName: exported.fileName });
      expect(parsed.report.counts.errors).toBe(0);

      const target = await context();
      await applyImport(target, parsed, {
        mode: 'add',
        targetDeck: 'X',
        fileName: exported.fileName,
        media,
      });
      const before = (await source.repo.notes.list()).sort((a, b) =>
        (a.uid ?? '').localeCompare(b.uid ?? ''),
      );
      const after = (await target.repo.notes.list()).sort((a, b) =>
        (a.uid ?? '').localeCompare(b.uid ?? ''),
      );
      const sourceName = () => 'IMG';
      const targetName = () => 'IMG';
      expect(after.map((n) => view(n, targetName))).toEqual(before.map((n) => view(n, sourceName)));
      expect((await target.repo.decks.list()).map((d) => d.name)).toContain('Réseaux::Ethernet');
      expect(await target.repo.cards.count()).toBe(await source.repo.cards.count());
      if (format === 'zip') {
        const [stored] = await target.repo.media.list();
        expect(stored?.mime).toBe('image/png');
        expect(await target.repo.media.getContent(stored?.id ?? '')).toEqual(PNG);
        const basic = after.find((n) => n.uid === 'n-basic');
        expect(basic?.fields.front).toContain(`media:${stored?.id ?? ''}`);
      }
    },
  );

  it('exports CSV for the types it can carry', async () => {
    const ctx = await context();
    const deck = await createDeck(ctx, 'D');
    for (const input of samples(deck.id, 'none')) await createNote(ctx, input);
    const exported = await exportNotes(ctx, { format: 'csv' });
    expect(exported.fileName).toBe('mnemo-collection.csv');
    expect(exported.warnings.length).toBeGreaterThan(0);
    const parsed = parseImport(exported.content as string, { fileName: 'x.csv' });
    expect(parsed.notes.map((n) => n.uid).sort()).toEqual(['n-basic', 'n-cloze', 'n-mcq', 'n-rev']);
  });
});
