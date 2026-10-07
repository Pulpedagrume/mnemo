import { describe, expect, it } from 'vitest';
import type { EntityStore, Repository } from '../../repository';
import type { Synced } from '../../query/match';
import { makeCard, makeDeck, makeMedia, makeNote, makeNoteType, makePreset, T0 } from '../fixtures';

export type RepoRef = () => Repository;

interface EntityCase<T extends Synced> {
  name: string;
  store: (repo: Repository) => EntityStore<T>;
  make: (overrides?: Partial<T>) => T;
}

function entityTests<T extends Synced>(repo: RepoRef, c: EntityCase<T>): void {
  const store = () => c.store(repo());
  const make = (id: string, updatedAt = T0, extra: Partial<T> = {}) =>
    c.make({ id, updatedAt, ...extra });

  describe(c.name, () => {
    it('round-trips an entity exactly and returns undefined for unknown ids', async () => {
      const e = make('e1');
      await store().put(e);
      expect(await store().get('e1')).toStrictEqual(e);
      expect(await store().get('missing')).toBeUndefined();
    });

    it('overwrites on put and isolates stored values from callers', async () => {
      const e = make('e1');
      await store().put(e);
      const updated = make('e1', T0 + 5);
      await store().put(updated);
      const copy = structuredClone(updated);
      (updated as { updatedAt: number }).updatedAt = 1;
      const read = await store().get('e1');
      expect(read).toStrictEqual(copy);
      if (read !== undefined) (read as { updatedAt: number }).updatedAt = 2;
      expect(await store().get('e1')).toStrictEqual(copy);
    });

    it('getMany keeps the order of ids, with undefined for missing and deleted', async () => {
      const a = make('a');
      const b = make('b');
      await store().putMany([a, b, make('d', T0, { deletedAt: T0 } as Partial<T>)]);
      expect(await store().getMany(['b', 'x', 'a', 'd', 'b'])).toStrictEqual([
        b,
        undefined,
        a,
        undefined,
        b,
      ]);
      expect(await store().getMany([])).toStrictEqual([]);
    });

    it('getRaw returns tombstones too, in the order of ids', async () => {
      const a = make('a');
      const d = make('d', T0, { deletedAt: T0 + 1 } as Partial<T>);
      await store().putMany([a, d]);
      expect(await store().getRaw(['d', 'x', 'a'])).toStrictEqual([d, undefined, a]);
      expect(await store().getRaw([])).toStrictEqual([]);
    });

    it('lists and counts live entities ordered by id', async () => {
      expect(await store().list()).toStrictEqual([]);
      expect(await store().count()).toBe(0);
      const [c1, a1, b1] = [make('c'), make('a'), make('b')];
      await store().putMany([c1, a1, b1]);
      expect(await store().list()).toStrictEqual([a1, b1, c1]);
      expect(await store().count()).toBe(3);
    });

    it('hides tombstones from reads but returns them from changedSince', async () => {
      const live = make('live', T0 + 1);
      const dead = make('dead', T0 + 2, { deletedAt: T0 + 2 } as Partial<T>);
      await store().putMany([live, dead]);
      expect(await store().get('dead')).toBeUndefined();
      expect(await store().list()).toStrictEqual([live]);
      expect(await store().count()).toBe(1);
      expect(await store().changedSince(0)).toStrictEqual([live, dead]);
    });

    it('changedSince is strict, ordered by updatedAt then id, and honours limit', async () => {
      const rows = [make('z', 30), make('y', 10), make('b', 20), make('a', 20), make('old', 5)];
      await store().putMany(rows);
      const ids = async (since: number, limit?: number) =>
        (await store().changedSince(since, limit)).map((e) => e.id);
      expect(await ids(5)).toEqual(['y', 'a', 'b', 'z']);
      expect(await ids(5, 2)).toEqual(['y', 'a']);
      expect(await ids(5, 0)).toEqual([]);
      expect(await ids(20)).toEqual(['z']);
      expect(await ids(30)).toEqual([]);
    });

    it('purge removes entities physically, tombstones included', async () => {
      await store().putMany([make('a'), make('b', T0, { deletedAt: T0 } as Partial<T>), make('c')]);
      await store().purge(['a', 'b', 'unknown']);
      expect((await store().changedSince(0)).map((e) => e.id)).toEqual(['c']);
      await store().purge([]);
      expect(await store().count()).toBe(1);
    });
  });
}

export function entitySuite(repo: RepoRef): void {
  describe('entity stores', () => {
    entityTests(repo, { name: 'decks', store: (r) => r.decks, make: makeDeck });
    entityTests(repo, { name: 'presets', store: (r) => r.presets, make: makePreset });
    entityTests(repo, { name: 'noteTypes', store: (r) => r.noteTypes, make: makeNoteType });
    entityTests(repo, { name: 'notes', store: (r) => r.notes, make: makeNote });
    entityTests(repo, { name: 'cards', store: (r) => r.cards, make: makeCard });
    entityTests(repo, { name: 'media', store: (r) => r.media, make: makeMedia });
  });

  describe('exact round trips', () => {
    it('keeps every optional note field, and absent ones absent', async () => {
      const full = makeNote({
        id: 'full',
        uid: 'eth-4-003',
        data: {
          kind: 'mcq',
          shuffle: true,
          choices: [
            { text: 'A', correct: true },
            { text: 'B', correct: false, explanation: 'no' },
          ],
        },
        explanation: 'Because.',
        source: { doc: 'Cours', page: 12 },
        difficulty: 3,
        needsReview: false,
        importBatchId: 'batch-1',
        hints: ['h1', 'h2'],
        tags: ['a', 'b::c'],
      });
      const bare = makeNote({ id: 'bare' });
      await repo().notes.putMany([full, bare]);
      expect(await repo().notes.get('full')).toStrictEqual(full);
      const readBare = await repo().notes.get('bare');
      expect(readBare).toStrictEqual(bare);
      expect(readBare !== undefined && 'uid' in readBare).toBe(false);
    });

    it('keeps optional card fields and nested scheduler data', async () => {
      const card = makeCard({
        id: 'c',
        newPosition: 4,
        buriedUntil: T0 + 1,
        lastReview: T0 - 1,
        schedulerData: { nested: { list: [1, 2.5, 'x'], flag: true } },
      });
      await repo().cards.put(card);
      expect(await repo().cards.get('c')).toStrictEqual(card);
    });
  });
}
