import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from '@mnemo/core';
import {
  answer,
  createNote,
  deleteNotes,
  getSettings,
  listDecks,
  undoAnswer,
  updateNote,
  updateSettings,
} from '@mnemo/services';
import { syncAll, twoDevices, type Device } from './test/harness';

async function addNote(d: Device, front = 'Q', back = 'A') {
  const deck = (await listDecks(d.ctx))[0];
  if (!deck) throw new Error('no deck');
  const { note, cards } = await createNote(d.ctx, {
    noteTypeId: 'basic',
    deckId: deck.id,
    fields: { front, back },
    tags: [],
    hints: [],
  });
  const card = cards[0];
  if (!card) throw new Error('no card');
  return { note, card };
}

async function review(d: Device, cardId: string, rating: 1 | 2 | 3 | 4) {
  return answer(d.ctx, { cardId, rating, hintsUsed: 0, durationMs: 3_000, cram: false });
}

describe('bootstrap', () => {
  it('shares one collection between devices', async () => {
    const { a, b } = await twoDevices();
    expect((await listDecks(b.ctx)).map((d) => d.id)).toEqual(
      (await listDecks(a.ctx)).map((d) => d.id),
    );
    expect(await b.repo.presets.count()).toBe(await a.repo.presets.count());
    expect((await getSettings(b.ctx)).defaultPresetId).toBe(
      (await getSettings(a.ctx)).defaultPresetId,
    );
  });
});

describe('conflict scenarios (docs/SYNC.md)', () => {
  it('1. offline edits of the same note: different fields merge, same field latest wins', async () => {
    const { a, b } = await twoDevices();
    const { note } = await addNote(a);
    await syncAll(a, b);

    a.clock.advance(MINUTE_MS);
    await updateNote(a.ctx, note.id, { fields: { front: 'Q (A)', back: 'A' }, tags: ['from-a'] });
    b.clock.advance(2 * MINUTE_MS);
    await updateNote(b.ctx, note.id, { fields: { front: 'Q', back: 'A (B)' } });
    await syncAll(a, b, a);
    for (const d of [a, b]) {
      const n = await d.repo.notes.get(note.id);
      expect(n?.fields).toEqual({ front: 'Q (A)', back: 'A (B)' });
      expect(n?.tags).toEqual(['from-a']);
    }

    a.clock.advance(MINUTE_MS);
    await updateNote(a.ctx, note.id, { fields: { front: 'first', back: 'A (B)' } });
    b.clock.advance(5 * MINUTE_MS);
    await updateNote(b.ctx, note.id, { fields: { front: 'latest', back: 'A (B)' } });
    await syncAll(b, a, b);
    expect((await a.repo.notes.get(note.id))?.fields['front']).toBe('latest');
    expect(await a.raw.notes.get(note.id)).toEqual(await b.raw.notes.get(note.id));
  });

  it('2. both devices review the same card offline: logs kept, latest review wins', async () => {
    const { a, b } = await twoDevices();
    const { card } = await addNote(a);
    await syncAll(a, b);

    a.clock.advance(HOUR_MS);
    const ra = await review(a, card.id, 3);
    b.clock.advance(2 * HOUR_MS);
    const rb = await review(b, card.id, 1);
    await syncAll(a, b, a);
    for (const d of [a, b]) {
      const logs = await d.repo.reviewLogs.byCard(card.id);
      expect(logs.map((l) => l.id).sort()).toEqual([ra.log.id, rb.log.id].sort());
      const c = await d.repo.cards.get(card.id);
      expect(c?.lastReview).toBe(rb.card.lastReview);
      expect(c?.state).toBe(rb.card.state);
      expect(c?.due).toBe(rb.card.due);
    }
  });

  it('3. delete vs modify: the deletion wins', async () => {
    const { a, b } = await twoDevices();
    const { note, card } = await addNote(a);
    await syncAll(a, b);

    a.clock.advance(MINUTE_MS);
    await deleteNotes(a.ctx, [note.id]);
    b.clock.advance(10 * MINUTE_MS);
    await updateNote(b.ctx, note.id, { tags: ['edited-later'] });
    await syncAll(b, a, b);
    for (const d of [a, b]) {
      expect(await d.repo.notes.get(note.id)).toBeUndefined();
      expect(await d.repo.cards.get(card.id)).toBeUndefined();
      const [raw] = await d.raw.notes.getRaw([note.id]);
      expect(raw?.deletedAt).toBeDefined();
      expect(raw?.tags).toEqual(['edited-later']);
    }
  });

  it('4. network failure during push, then retry: no duplicate', async () => {
    const { server, a, b } = await twoDevices();
    await addNote(a, 'once');
    const before = await server.log.lastSeq();

    a.transport.failNext('push', 'after');
    await expect(a.client.sync()).rejects.toThrow(/after push/);
    const sent = await server.log.lastSeq();
    expect(sent).toBeGreaterThan(before);

    a.transport.failNext('push', 'before');
    await expect(a.client.sync()).rejects.toThrow(/before push/);
    await a.client.sync();
    expect(await server.log.lastSeq()).toBe(sent);

    await syncAll(b);
    const notes = await b.repo.notes.search({ text: 'once' });
    expect(notes.total).toBe(1);
    expect(await server.repo.notes.count()).toBe(await a.repo.notes.count());
  });

  it('5. clocks skewed by hours: the HLC keeps the causal order', async () => {
    const { a, b } = await twoDevices({ skewB: -3 * HOUR_MS });
    const { note } = await addNote(a);
    await syncAll(a, b);

    a.clock.advance(MINUTE_MS);
    await updateNote(a.ctx, note.id, { tags: ['a'] });
    await syncAll(a, b);
    // B's wall clock is hours behind, but it saw A's edit: its later edit must win.
    b.clock.advance(MINUTE_MS);
    await updateNote(b.ctx, note.id, { tags: ['b-after-a'] });
    expect((await b.repo.notes.get(note.id))?.updatedAt).toBeLessThan(
      (await a.repo.notes.get(note.id))?.updatedAt ?? 0,
    );
    await syncAll(b, a);
    expect((await a.repo.notes.get(note.id))?.tags).toEqual(['b-after-a']);
    expect((await b.repo.notes.get(note.id))?.tags).toEqual(['b-after-a']);
  });

  it('6. failure during pull: resumes from the cursor without loss', async () => {
    const { server, a, b } = await twoDevices({ pullLimit: 3 });
    for (let i = 0; i < 4; i++) await addNote(a, `note ${String(i)}`);
    await syncAll(a);

    b.transport.failNext('pull', 'after', 1);
    await expect(b.client.sync()).rejects.toThrow(/after pull/);
    const partial = (await b.state.load())?.cursor ?? 0;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(await server.log.lastSeq());

    await b.client.sync();
    expect((await b.state.load())?.cursor).toBe(await server.log.lastSeq());
    expect(await b.repo.notes.count()).toBe(4);
    expect(await b.repo.cards.count()).toBe(await a.repo.cards.count());
  });
});

describe('other propagation rules', () => {
  it('propagates the undo of a synced review as a log tombstone', async () => {
    const { a, b } = await twoDevices();
    const { card } = await addNote(a);
    const res = await review(a, card.id, 3);
    await syncAll(a, b);
    expect(await b.repo.reviewLogs.count()).toBe(1);

    a.clock.advance(1_000);
    await undoAnswer(a.ctx, res.undo);
    await syncAll(a, b);
    for (const d of [a, b]) {
      expect(await d.repo.reviewLogs.count()).toBe(0);
      expect((await d.repo.reviewLogs.get(res.log.id))?.deletedAt).toBeDefined();
    }
  });

  it('settings: last writer wins per key', async () => {
    const { a, b } = await twoDevices();
    a.clock.advance(MINUTE_MS);
    await updateSettings(a.ctx, { theme: 'dark', textScale: 1.5 });
    b.clock.advance(2 * MINUTE_MS);
    await updateSettings(b.ctx, { theme: 'light' });
    await syncAll(a, b, a);
    for (const d of [a, b]) {
      expect(await getSettings(d.ctx)).toMatchObject({ theme: 'light', textScale: 1.5 });
    }
    // The sync state row is local only.
    expect(await b.raw.settings.get('sync.state')).toBeUndefined();
    expect(await a.raw.settings.get('sync.state')).toBeDefined();
  });
});
