import { describe, expect, it } from 'vitest';
import { createMemoryRepository } from '@mnemo/storage';
import { makeDeck, makeMedia, makeNote } from '@mnemo/storage/testing';
import { getDefaultPreset, loadCalendar, answer, createNote, listDecks } from '@mnemo/services';
import { getScheduler } from '@mnemo/core';
import { splitBatches } from './client';
import type { Change } from './protocol';
import { rebuildCardFromLogs } from './rebuild';
import { createMemoryChangeLog, applyPush, createMemoryBatchRegistry } from './server';
import {
  createMemorySyncStateStore,
  createSettingsSyncStateStore,
  initialSyncState,
} from './state';
import { makeDevice, syncAll, twoDevices } from './test/harness';
import { createInProcessServer } from './inProcess';
import { manualClock } from '@mnemo/core';

const sha = (c: string) => c.repeat(64);

describe('media', () => {
  it('uploads each content once (dedup by sha256) and downloads missing ones', async () => {
    const { server, a, b } = await twoDevices();
    const ma = makeMedia({ id: 'ma', sha256: sha('a'), updatedAt: a.clock.now() });
    await a.repo.media.put(ma);
    await a.repo.media.putContent('ma', new Uint8Array([1, 2, 3]));
    const mb = makeMedia({ id: 'mb', sha256: sha('a'), updatedAt: b.clock.now() });
    await b.repo.media.put(mb);
    await b.repo.media.putContent('mb', new Uint8Array([1, 2, 3]));
    const noContent = makeMedia({ id: 'mc', sha256: sha('c'), updatedAt: a.clock.now() });
    await a.repo.media.put(noContent);

    a.clock.advance(1_000);
    const ra = await a.client.sync();
    expect(ra.mediaUploaded).toBe(1);
    b.clock.advance(1_000);
    const rb = await b.client.sync();
    expect(rb.mediaUploaded).toBe(0);
    expect(rb.mediaDownloaded).toBe(1);
    expect(await b.repo.media.getContent('ma')).toEqual(new Uint8Array([1, 2, 3]));
    expect(await server.blobs.has(sha('a'))).toBe(true);
    expect(await server.missingMedia([sha('a'), sha('c'), sha('c')])).toEqual([sha('c')]);
    expect(await b.repo.media.getContent('mc')).toBeUndefined();
  });
});

describe('client batching and state', () => {
  it('splits batches by serialized size', () => {
    const changes: Change[] = [1, 2, 3].map((i) => ({
      kind: 'note',
      data: makeNote({ id: `n${String(i)}`, explanation: 'x'.repeat(400) }),
    }));
    expect(splitBatches(changes, 1_000).map((b) => b.length)).toEqual([1, 1, 1]);
    expect(splitBatches(changes, 10_000).map((b) => b.length)).toEqual([3]);
    expect(splitBatches([], 10)).toEqual([]);
  });

  it('sends large pushes in several batches with distinct ids', async () => {
    const server = createInProcessServer({ repo: createMemoryRepository() });
    const d = makeDevice(server, 'D');
    await d.repo.decks.putMany(
      Array.from({ length: 5 }, (_, i) =>
        makeDeck({ id: `d${String(i)}`, description: 'y'.repeat(300) }),
      ),
    );
    const client = (await import('./client')).createSyncClient({
      repo: d.raw,
      transport: d.transport,
      hlc: d.hlc,
      deviceId: 'D',
      state: createMemorySyncStateStore(initialSyncState('D')),
      ids: (() => {
        let n = 0;
        return () => `batch-${String(++n)}`;
      })(),
      clock: d.clock,
      maxBatchBytes: 800,
    });
    const report = await client.sync();
    expect(report.pushed).toBe(5);
    expect(d.transport.calls.push).toBe(5);
    expect(await server.repo.decks.count()).toBe(5);
    expect(report.pulled).toBe(5);
    expect(report.conflicts).toBe(0);
    const again = await client.sync();
    expect(again.pulled).toBe(0);
  });

  it('persists the state in the settings table', async () => {
    const repo = createMemoryRepository();
    const store = createSettingsSyncStateStore(repo.settings, manualClock(5));
    expect(await store.load()).toBeUndefined();
    await store.save({ ...initialSyncState('dev'), cursor: 7 });
    expect((await store.load())?.cursor).toBe(7);
    const mem = createMemorySyncStateStore();
    expect(await mem.load()).toBeUndefined();
    await mem.save(initialSyncState('x'));
    expect(mem.current()?.deviceId).toBe('x');
  });
});

describe('server', () => {
  it('is idempotent per batch id and skips no-op changes', async () => {
    const repo = createMemoryRepository();
    const log = createMemoryChangeLog();
    const batches = createMemoryBatchRegistry();
    const deck = makeDeck({ id: 'd' });
    const req = { batchId: 'b1', deviceId: 'x', changes: [{ kind: 'deck' as const, data: deck }] };
    const first = await applyPush(repo, log, batches, req);
    expect(first).toEqual({ applied: 1, cursor: 1 });
    expect(await applyPush(repo, log, batches, req)).toEqual(first);
    const echo = await applyPush(repo, log, batches, { ...req, batchId: 'b2' });
    expect(echo).toEqual({ applied: 0, cursor: 1 });
    await applyPush(repo, log, batches, {
      ...req,
      batchId: 'b3',
      changes: [{ kind: 'deck', data: { ...deck, name: 'New', updatedAt: deck.updatedAt + 1 } }],
    });
    // The newer entry superseded the older one in the log.
    expect(log.size()).toBe(1);
    expect(await log.since(0, 10)).toMatchObject({ cursor: 2, hasMore: false });
    expect(await log.since(2, 10)).toEqual({ changes: [], cursor: 2, hasMore: false });
    await expect(applyPush(repo, log, batches, { ...req, batchId: '' })).rejects.toThrow();
  });
});

describe('rebuildCardFromLogs', () => {
  it('replays the logs to the same scheduling state, skipping tombstones and cram', async () => {
    const server = createInProcessServer({ repo: createMemoryRepository() });
    const d = makeDevice(server, 'R');
    const { ensureCollection } = await import('@mnemo/services');
    await ensureCollection(d.ctx, 'fr');
    const deck = (await listDecks(d.ctx))[0];
    if (!deck) throw new Error('no deck');
    const { cards } = await createNote(d.ctx, {
      noteTypeId: 'basic',
      deckId: deck.id,
      fields: { front: 'q', back: 'a' },
      tags: [],
      hints: [],
    });
    const cardId = cards[0]?.id ?? '';
    const logs = [];
    for (const [i, rating] of ([3, 3, 1, 4] as const).entries()) {
      d.clock.advance((i + 1) * 86_400_000);
      logs.push(
        (await answer(d.ctx, { cardId, rating, hintsUsed: 0, durationMs: 1, cram: false })).log,
      );
    }
    const card = await d.repo.cards.get(cardId);
    if (!card) throw new Error('no card');
    const preset = await getDefaultPreset(d.ctx);
    const calendar = await loadCalendar(d.ctx);
    const scheduler = getScheduler(preset.algorithm);
    const extra = [
      { ...logs[0]!, id: 'zz-cram', cram: true },
      { ...logs[0]!, id: 'zz-undone', deletedAt: 1 },
      { ...logs[0]!, id: 'zz-other', cardId: 'other' },
    ];
    const rebuilt = rebuildCardFromLogs(
      card,
      [...logs].reverse().concat(extra),
      scheduler,
      preset.params,
      calendar,
    );
    expect(rebuilt).toEqual(card);
    const blank = rebuildCardFromLogs(card, [], scheduler, preset.params, calendar);
    expect(blank.state).toBe('new');
    expect(blank.lastReview).toBeUndefined();
    await syncAll(d);
  });
});
