import { describe, expect, it } from 'vitest';
import { manualClock, seededRng } from '@mnemo/core';
import type { ImportParseResult, ParsedNote } from '@mnemo/importers';
import { createMemoryRepository } from '@mnemo/storage';
import {
  applyImport,
  createServiceContext,
  decodeDataUri,
  ensureCollection,
  listDecks,
  listImportBatches,
  planImport,
  undoImport,
  ImportUndoError,
} from './index';

async function setup() {
  const repo = createMemoryRepository();
  const clock = manualClock(Date.UTC(2026, 9, 7, 8));
  const ctx = createServiceContext({ repo, clock, rng: seededRng(2), deviceTimeZone: 'UTC' });
  await ensureCollection(ctx, 'fr');
  return { ctx, clock };
}

let n = 0;
function basic(front: string, back: string, extra: Partial<ParsedNote> = {}): ParsedNote {
  return {
    index: n++,
    noteTypeId: 'basic',
    deck: 'Réseaux::Ethernet',
    fields: { front, back },
    tags: ['ccna'],
    hints: [],
    media: [],
    cards: 1,
    ...extra,
  };
}

function parsed(notes: ParsedNote[], extra: Partial<ImportParseResult> = {}): ImportParseResult {
  return {
    format: 'json',
    decks: [],
    media: [],
    noteTypes: [],
    notes,
    report: {
      issues: [],
      counts: {
        notes: notes.length,
        valid: notes.length,
        invalid: 0,
        cards: notes.length,
        byType: {},
        errors: 0,
        warnings: 0,
        infos: 0,
      },
    },
    ...extra,
  };
}

const opts = { targetDeck: 'Import', fileName: 'cours.json' } as const;

describe('import service', () => {
  it('creates decks and notes, then skips duplicates by uid and by content', async () => {
    const { ctx } = await setup();
    const file = parsed([
      basic('FCS ?', 'Erreurs', { uid: 'eth-1' }),
      basic('MAC ?', 'Adresse', { deck: '' }),
    ]);
    const plan = await planImport(ctx, file, { mode: 'skip-duplicates', targetDeck: 'Import' });
    expect(plan.counts).toMatchObject({ create: 2, skip: 0 });
    expect(plan.decksToCreate).toEqual(['Import', 'Réseaux::Ethernet']);
    const batch = await applyImport(ctx, file, { ...opts, mode: 'skip-duplicates' });
    expect(batch.counts).toMatchObject({ created: 2, decksCreated: 2 });
    expect((await listDecks(ctx)).map((d) => d.name)).toContain('Réseaux::Ethernet');

    const again = parsed([
      basic('FCS ?', 'Autre réponse', { uid: 'eth-1' }),
      basic('  mac   ? ', 'x', { deck: '' }),
      basic('Nouvelle', 'y'),
    ]);
    const plan2 = await planImport(ctx, again, { mode: 'skip-duplicates', targetDeck: 'Import' });
    expect(plan2.items.map((i) => [i.action, i.matchedBy])).toEqual([
      ['skip', 'uid'],
      ['skip', 'content'],
      ['create', undefined],
    ]);
    expect(await ctx.repo.notes.count()).toBe(2);
  });

  it('updates in place keeping the schedule, and undo restores the previous state', async () => {
    const { ctx } = await setup();
    await applyImport(ctx, parsed([basic('Q', 'Ancienne', { uid: 'u1' })]), {
      ...opts,
      mode: 'update',
    });
    const [card] = await ctx.repo.cards.list();
    if (!card) throw new Error('no card');
    await ctx.repo.cards.put({ ...card, state: 'review', interval: 12, reps: 4 });

    const batch = await applyImport(
      ctx,
      parsed([basic('Q', 'Nouvelle', { uid: 'u1' }), basic('Q2', 'R2')]),
      {
        ...opts,
        mode: 'update',
      },
    );
    expect(batch.counts).toMatchObject({ updated: 1, created: 1 });
    const note = await ctx.repo.notes.findByUid('u1');
    expect(note?.fields.back).toBe('Nouvelle');
    expect((await ctx.repo.cards.byNote([note?.id ?? '']))[0]).toMatchObject({
      state: 'review',
      interval: 12,
    });

    await undoImport(ctx, batch.id);
    expect((await ctx.repo.notes.findByUid('u1'))?.fields.back).toBe('Ancienne');
    expect(await ctx.repo.notes.count()).toBe(1);
    expect((await ctx.repo.cards.list())[0]).toMatchObject({ state: 'review', interval: 12 });
    await expect(undoImport(ctx, batch.id)).rejects.toBeInstanceOf(ImportUndoError);
    expect((await listImportBatches(ctx)).find((b) => b.id === batch.id)?.undoneAt).toBeDefined();
  });

  it('add mode always creates, dropping colliding uids; excluded notes are ignored', async () => {
    const { ctx } = await setup();
    await applyImport(ctx, parsed([basic('Q', 'R', { uid: 'dup' })]), { ...opts, mode: 'add' });
    const second = parsed([basic('Q', 'R', { uid: 'dup' }), basic('Skip me', 'R')]);
    const excluded = new Set([second.notes[1]?.index ?? -1]);
    const batch = await applyImport(ctx, second, { ...opts, mode: 'add', excluded });
    expect(batch.counts).toMatchObject({ created: 1, excluded: 1 });
    const notes = await ctx.repo.notes.list();
    expect(notes).toHaveLength(2);
    expect(notes.filter((x) => x.uid === 'dup')).toHaveLength(1);
  });

  it('replace-deck deletes the deck content first and can be undone', async () => {
    const { ctx } = await setup();
    await applyImport(ctx, parsed([basic('A', '1'), basic('B', '2')]), { ...opts, mode: 'add' });
    const batch = await applyImport(ctx, parsed([basic('C', '3')]), {
      ...opts,
      mode: 'replace-deck',
    });
    expect(batch.counts.replaced).toBe(2);
    expect((await ctx.repo.notes.list()).map((x) => x.fields.front)).toEqual(['C']);
    await undoImport(ctx, batch.id);
    expect((await ctx.repo.notes.list()).map((x) => x.fields.front).sort()).toEqual(['A', 'B']);
    expect(await ctx.repo.cards.count()).toBe(2);
  });

  it('stores media once and rewrites references; creates custom note types and deck settings', async () => {
    const { ctx } = await setup();
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(decodeDataUri(png)?.bytes.byteLength).toBe(8);
    const file = parsed(
      [
        basic('Voir ![trame](media:fig-1)', 'R'),
        basic('Encore ![x](media:fig-1)', 'R2'),
        {
          index: n++,
          noteTypeId: 'custom:vocab',
          deck: 'Langues',
          fields: { mot: 'chat', traduction: 'cat' },
          tags: [],
          hints: [],
          media: [],
          cards: 1,
        },
      ],
      {
        media: [{ id: 'fig-1', data: png, alt: 'Trame' }],
        noteTypes: [
          {
            id: 'vocab',
            name: 'Vocabulaire',
            fields: ['Mot', 'Traduction'],
            templates: [{ name: 'Carte 1', front: '{{Mot}}', back: '{{Traduction}}' }],
          },
        ],
        decks: [{ path: 'Langues', description: 'Vocabulaire', preset: 'Langues' }],
      },
    );
    await applyImport(ctx, file, { ...opts, mode: 'add' });
    const media = await ctx.repo.media.list();
    expect(media).toHaveLength(1);
    const notes = await ctx.repo.notes.list();
    expect(notes.find((x) => x.fields.front?.startsWith('Voir'))?.fields.front).toContain(
      `media:${media[0]?.id ?? ''}`,
    );
    expect(await ctx.repo.noteTypes.get('custom:vocab')).toMatchObject({ renderer: 'template' });
    const deck = (await listDecks(ctx)).find((d) => d.name === 'Langues');
    expect(deck?.description).toBe('Vocabulaire');
    expect(deck?.presetId).toBeDefined();
    // Re-importing the same image reuses the stored media.
    await applyImport(ctx, parsed([], { media: [{ id: 'fig-1', data: png }] }), {
      ...opts,
      mode: 'add',
    });
    expect(await ctx.repo.media.count()).toBe(1);
  });
});
