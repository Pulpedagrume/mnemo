import { describe, expect, it } from 'vitest';
import { manualClock, seededRng } from '@mnemo/core';
import { createMemoryRepository } from '@mnemo/storage';
import {
  bulkUpdateNotes,
  createBackupZip,
  createDeck,
  createNote,
  createServiceContext,
  deleteDeck,
  deleteNotes,
  getNoteWithCards,
  getSettings,
  listDecks,
  loadCalendar,
  readBackupZip,
  renameDeck,
  restoreBackupZip,
  setNotesSuspended,
  updateDeck,
  updateNote,
  updateSettings,
  BackupError,
  DeckError,
  NoteError,
} from './index';

function setup() {
  const repo = createMemoryRepository();
  const clock = manualClock(Date.UTC(2026, 9, 7, 10));
  return createServiceContext({ repo, clock, rng: seededRng(1), deviceTimeZone: 'Europe/Paris' });
}

describe('settings', () => {
  it('stores validated settings and derives the calendar', async () => {
    const ctx = setup();
    expect((await getSettings(ctx)).theme).toBe('system');
    await updateSettings(ctx, { theme: 'dark', rolloverHour: 5 });
    expect(await getSettings(ctx)).toMatchObject({ theme: 'dark', rolloverHour: 5 });
    await expect(updateSettings(ctx, { rolloverHour: 30 })).rejects.toThrow();
    const cal = await loadCalendar(ctx);
    expect(cal).toMatchObject({ timeZone: 'Europe/Paris', rolloverHour: 5 });
    await updateSettings(ctx, { timeZone: 'Invalid/Zone' });
    expect((await loadCalendar(ctx)).timeZone).toBe('Europe/Paris');
  });
});

describe('decks', () => {
  it('creates paths with ancestors, renames subtrees and deletes them', async () => {
    const ctx = setup();
    const eth = await createDeck(ctx, 'Réseaux :: Ethernet');
    expect(eth.name).toBe('Réseaux::Ethernet');
    const decks = await listDecks(ctx);
    expect(decks.map((d) => d.name).sort()).toEqual(['Réseaux', 'Réseaux::Ethernet']);
    expect(eth.parentId).toBe(decks.find((d) => d.name === 'Réseaux')?.id);
    expect((await createDeck(ctx, 'Réseaux::Ethernet')).id).toBe(eth.id);

    const root = decks.find((d) => d.name === 'Réseaux');
    if (!root) throw new Error('missing root');
    await renameDeck(ctx, root.id, 'Info::Réseaux');
    expect((await listDecks(ctx)).map((d) => d.name).sort()).toEqual([
      'Info',
      'Info::Réseaux',
      'Info::Réseaux::Ethernet',
    ]);
    await expect(renameDeck(ctx, root.id, 'Info::Réseaux::Ethernet::X')).rejects.toBeInstanceOf(
      DeckError,
    );
    await expect(renameDeck(ctx, root.id, 'Info')).rejects.toBeInstanceOf(DeckError);
    await expect(createDeck(ctx, ' :: ')).rejects.toBeInstanceOf(DeckError);

    const withPreset = await updateDeck(ctx, eth.id, { presetId: 'p1', description: 'd' });
    expect(withPreset.presetId).toBe('p1');
    expect((await updateDeck(ctx, eth.id, { presetId: null })).presetId).toBeUndefined();

    await createNote(ctx, {
      noteTypeId: 'basic',
      deckId: eth.id,
      fields: { front: 'Q', back: 'A' },
      tags: [],
      hints: [],
    });
    expect(await deleteDeck(ctx, root.id)).toEqual({ notes: 1 });
    expect((await listDecks(ctx)).map((d) => d.name)).toEqual(['Info']);
    expect(await ctx.repo.cards.count()).toBe(0);
  });
});

describe('notes', () => {
  it('creates notes with one card per generated ord and positions them', async () => {
    const ctx = setup();
    const deck = await createDeck(ctx, 'D');
    const { note, cards } = await createNote(ctx, {
      noteTypeId: 'cloze',
      deckId: deck.id,
      fields: { text: '{{c1::Paris}} est la capitale de la {{c2::France}}.' },
      tags: [' geo ', 'geo', 'europe'],
      hints: [],
    });
    expect(note.tags).toEqual(['geo', 'europe']);
    expect(cards.map((c) => [c.ord, c.newPosition, c.state])).toEqual([
      [0, 0, 'new'],
      [1, 1, 'new'],
    ]);
  });

  it('rejects notes that produce no card or have invalid cloze', async () => {
    const ctx = setup();
    const deck = await createDeck(ctx, 'D');
    const base = { deckId: deck.id, tags: [], hints: [] };
    await expect(
      createNote(ctx, { ...base, noteTypeId: 'cloze', fields: { text: 'pas de trou' } }),
    ).rejects.toMatchObject({ code: 'invalid-cloze' });
    await expect(
      createNote(ctx, { ...base, noteTypeId: 'basic', fields: { front: '', back: 'x' } }),
    ).rejects.toMatchObject({ code: 'no-cards' });
    await expect(
      createNote(ctx, { ...base, noteTypeId: 'nope', fields: {} }),
    ).rejects.toBeInstanceOf(NoteError);
  });

  it('updates notes keeping scheduling, adding and removing cards, following the deck', async () => {
    const ctx = setup();
    const a = await createDeck(ctx, 'A');
    const b = await createDeck(ctx, 'B');
    const { note, cards } = await createNote(ctx, {
      noteTypeId: 'cloze',
      deckId: a.id,
      fields: { text: '{{c1::x}} {{c2::y}}' },
      tags: [],
      hints: [],
    });
    const first = cards[0];
    if (!first) throw new Error('no card');
    await ctx.repo.cards.put({ ...first, state: 'review', interval: 10 });
    const res = await updateNote(ctx, note.id, {
      fields: { text: '{{c1::x}} {{c3::z}}' },
      deckId: b.id,
    });
    expect(res.created.map((c) => c.ord)).toEqual([2]);
    expect(res.deleted.map((c) => c.ord)).toEqual([1]);
    const loaded = await getNoteWithCards(ctx, note.id);
    expect(loaded?.cards.map((c) => [c.ord, c.deckId, c.state])).toEqual([
      [0, b.id, 'review'],
      [2, b.id, 'new'],
    ]);
    expect(loaded?.noteType.renderer).toBe('cloze');
    await expect(updateNote(ctx, 'missing', {})).rejects.toMatchObject({ code: 'not-found' });
  });

  it('bulk edits, suspends and deletes', async () => {
    const ctx = setup();
    const a = await createDeck(ctx, 'A');
    const b = await createDeck(ctx, 'B');
    const mk = (front: string) =>
      createNote(ctx, {
        noteTypeId: 'basic',
        deckId: a.id,
        fields: { front, back: 'r' },
        tags: ['old'],
        hints: [],
      });
    const n1 = (await mk('1')).note;
    const n2 = (await mk('2')).note;
    await bulkUpdateNotes(ctx, [n1.id, n2.id], { kind: 'addTags', tags: ['new'] });
    await bulkUpdateNotes(ctx, [n1.id], { kind: 'removeTags', tags: ['OLD'] });
    await bulkUpdateNotes(ctx, [n2.id], { kind: 'move', deckId: b.id });
    expect((await ctx.repo.notes.get(n1.id))?.tags).toEqual(['new']);
    expect((await ctx.repo.cards.byNote([n2.id]))[0]?.deckId).toBe(b.id);
    await setNotesSuspended(ctx, [n1.id], true);
    expect((await ctx.repo.cards.byNote([n1.id]))[0]?.suspended).toBe(true);
    await deleteNotes(ctx, [n1.id]);
    expect(await getNoteWithCards(ctx, n1.id)).toBeUndefined();
    expect(await ctx.repo.cards.count()).toBe(1);
  });
});

describe('backup', () => {
  it('round-trips the whole collection, media included', async () => {
    const ctx = setup();
    const deck = await createDeck(ctx, 'D');
    await createNote(ctx, {
      noteTypeId: 'basic',
      deckId: deck.id,
      fields: { front: 'Q', back: 'A' },
      tags: ['t'],
      hints: ['h'],
    });
    await ctx.repo.media.put({
      id: 'm1',
      sha256: 'a'.repeat(64),
      mime: 'image/png',
      size: 3,
      name: 'x.png',
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.repo.media.putContent('m1', new Uint8Array([1, 2, 3]));
    await updateSettings(ctx, { theme: 'dark' });
    const zip = await createBackupZip(ctx);
    expect((await getSettings(ctx)).lastBackupAt).toBe(ctx.clock.now());

    const other = setup();
    await createDeck(other, 'To be replaced');
    const data = await restoreBackupZip(other, zip);
    expect(data.notes).toHaveLength(1);
    expect((await listDecks(other)).map((d) => d.name)).toEqual(['D']);
    expect(await other.repo.media.getContent('m1')).toEqual(new Uint8Array([1, 2, 3]));
    expect((await getSettings(other)).theme).toBe('dark');
  });

  it('rejects invalid archives', async () => {
    await expect(readBackupZip(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(BackupError);
  });
});
