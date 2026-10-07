import { describe, expect, it } from 'vitest';
import { makeImportBatch, makeMedia, makeNote, makeReviewLog, makeSetting } from '../fixtures';
import type { RepoRef } from './entities';

export function miscSuite(repo: RepoRef): void {
  describe('reviewLogs', () => {
    const idsOf = (logs: { id: string }[]) => logs.map((l) => l.id);

    it('adds, gets, counts and removes logs', async () => {
      const log = makeReviewLog({ id: 'l1', answer: 'typed' });
      await repo().reviewLogs.add(log);
      await repo().reviewLogs.addMany([makeReviewLog({ id: 'l2' }), makeReviewLog({ id: 'l3' })]);
      expect(await repo().reviewLogs.get('l1')).toStrictEqual(log);
      expect(await repo().reviewLogs.get('nope')).toBeUndefined();
      expect(await repo().reviewLogs.count()).toBe(3);
      await repo().reviewLogs.remove('l2');
      await repo().reviewLogs.remove('nope');
      expect(await repo().reviewLogs.get('l2')).toBeUndefined();
      expect(await repo().reviewLogs.count()).toBe(2);
    });

    it('byCard and between are sorted by ts (between is [from, to))', async () => {
      await repo().reviewLogs.addMany([
        makeReviewLog({ id: 'c', cardId: 'k1', ts: 30 }),
        makeReviewLog({ id: 'a', cardId: 'k1', ts: 10 }),
        makeReviewLog({ id: 'b', cardId: 'k2', ts: 20 }),
        makeReviewLog({ id: 'd', cardId: 'k1', ts: 20 }),
        makeReviewLog({ id: 'e', cardId: 'k2', ts: 40 }),
      ]);
      expect(idsOf(await repo().reviewLogs.byCard('k1'))).toEqual(['a', 'd', 'c']);
      expect(await repo().reviewLogs.byCard('none')).toEqual([]);
      expect(idsOf(await repo().reviewLogs.between(10, 40))).toEqual(['a', 'b', 'd', 'c']);
      expect(idsOf(await repo().reviewLogs.between(20, 21))).toEqual(['b', 'd']);
      expect(await repo().reviewLogs.between(40, 40)).toEqual([]);
      expect(await repo().reviewLogs.between(50, 10)).toEqual([]);
    });

    it('skips tombstones in byCard, between and count; get still returns them', async () => {
      const dead = makeReviewLog({ id: 'x', cardId: 'k', ts: 10, deletedAt: 50 });
      await repo().reviewLogs.addMany([makeReviewLog({ id: 'y', cardId: 'k', ts: 20 }), dead]);
      expect(idsOf(await repo().reviewLogs.byCard('k'))).toEqual(['y']);
      expect(idsOf(await repo().reviewLogs.between(0, 100))).toEqual(['y']);
      expect(await repo().reviewLogs.count()).toBe(1);
      expect(await repo().reviewLogs.get('x')).toStrictEqual(dead);
    });

    it('changedSince orders logs by max(ts, deletedAt) then id, tombstones included', async () => {
      await repo().reviewLogs.addMany([
        makeReviewLog({ id: 'a', ts: 10 }),
        makeReviewLog({ id: 'b', ts: 30 }),
        makeReviewLog({ id: 'c', ts: 5, deletedAt: 40 }),
        makeReviewLog({ id: 'd', ts: 30 }),
        makeReviewLog({ id: 'e', ts: 1, deletedAt: 2 }),
      ]);
      expect(idsOf(await repo().reviewLogs.changedSince(0))).toEqual(['e', 'a', 'b', 'd', 'c']);
      expect(idsOf(await repo().reviewLogs.changedSince(10))).toEqual(['b', 'd', 'c']);
      expect(idsOf(await repo().reviewLogs.changedSince(10, 2))).toEqual(['b', 'd']);
      expect(await repo().reviewLogs.changedSince(10, 0)).toEqual([]);
      expect(await repo().reviewLogs.changedSince(40)).toEqual([]);
      const [c] = await repo().reviewLogs.changedSince(30);
      expect(c?.deletedAt).toBe(40);
    });
  });

  describe('media', () => {
    it('finds live media by sha256', async () => {
      const dead = makeMedia({ id: 'm1', deletedAt: 1 });
      const live = makeMedia({ id: 'm2', sha256: dead.sha256 });
      await repo().media.putMany([dead, live]);
      expect(await repo().media.getBySha(dead.sha256)).toStrictEqual(live);
      expect(await repo().media.getBySha('f'.repeat(64))).toBeUndefined();
    });

    it('round-trips binary content, returns copies and purges it with the metadata', async () => {
      const media = makeMedia({ id: 'm' });
      await repo().media.put(media);
      const bytes = new Uint8Array([0, 1, 2, 254, 255]);
      await repo().media.putContent('m', bytes);
      bytes[0] = 9;
      const read = await repo().media.getContent('m');
      expect(read).toBeInstanceOf(Uint8Array);
      expect(Array.from(read ?? [])).toEqual([0, 1, 2, 254, 255]);
      if (read !== undefined) read[1] = 9;
      expect(Array.from((await repo().media.getContent('m')) ?? [])).toEqual([0, 1, 2, 254, 255]);
      expect(await repo().media.getContent('missing')).toBeUndefined();
      await repo().media.purge(['m']);
      expect(await repo().media.getContent('m')).toBeUndefined();
      expect(await repo().media.changedSince(0)).toEqual([]);
    });
  });

  describe('settings', () => {
    it('puts, overwrites and lists rows sorted by key', async () => {
      expect(await repo().settings.all()).toEqual([]);
      await repo().settings.put(makeSetting('theme', 'dark'));
      await repo().settings.put(makeSetting('locale', 'en'));
      await repo().settings.put(makeSetting('extra', { list: [1, 'two'], nested: { ok: true } }));
      await repo().settings.put(makeSetting('theme', 'light', 5));
      expect(await repo().settings.get('theme')).toStrictEqual(makeSetting('theme', 'light', 5));
      expect(await repo().settings.get('missing')).toBeUndefined();
      expect((await repo().settings.all()).map((r) => r.key)).toEqual(['extra', 'locale', 'theme']);
      expect((await repo().settings.get('extra'))?.value).toStrictEqual({
        list: [1, 'two'],
        nested: { ok: true },
      });
    });
  });

  describe('importBatches', () => {
    it('round-trips batches and lists the most recent first', async () => {
      const batch = makeImportBatch({
        id: 'b1',
        createdAt: 10,
        noteIds: ['n1'],
        previousVersions: [makeNote({ id: 'n1', uid: 'u-1' })],
        undoneAt: 20,
      });
      await repo().importBatches.put(batch);
      await repo().importBatches.put(makeImportBatch({ id: 'b3', createdAt: 30 }));
      await repo().importBatches.put(makeImportBatch({ id: 'b2', createdAt: 20 }));
      await repo().importBatches.put(makeImportBatch({ id: 'b0', createdAt: 20 }));
      expect(await repo().importBatches.get('b1')).toStrictEqual(batch);
      expect(await repo().importBatches.get('nope')).toBeUndefined();
      const ids = async (limit?: number) =>
        (await repo().importBatches.list(limit)).map((b) => b.id);
      expect(await ids()).toEqual(['b3', 'b2', 'b0', 'b1']);
      expect(await ids(2)).toEqual(['b3', 'b2']);
      expect(await ids(0)).toEqual([]);
    });
  });
}
