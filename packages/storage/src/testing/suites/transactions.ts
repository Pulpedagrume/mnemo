import { describe, expect, it } from 'vitest';
import type { Repository, Stores } from '../../repository';
import {
  makeCard,
  makeDeck,
  makeImportBatch,
  makeMedia,
  makeNote,
  makeReviewLog,
  makeSetting,
} from '../fixtures';
import type { RepoRef } from './entities';

class Boom extends Error {}

async function snapshot(repo: Repository) {
  return {
    decks: await repo.decks.changedSince(-1),
    notes: await repo.notes.changedSince(-1),
    cards: await repo.cards.changedSince(-1),
    logs: await repo.reviewLogs.between(0, Number.MAX_SAFE_INTEGER),
    media: await repo.media.changedSince(-1),
    content: await repo.media.getContent('m'),
    settings: await repo.settings.all(),
    batches: await repo.importBatches.list(),
  };
}

export function transactionSuite(repo: RepoRef): void {
  describe('transactions', () => {
    it('commits every write and returns the callback result', async () => {
      const result = await repo().transaction(async (tx) => {
        await tx.decks.put(makeDeck({ id: 'd' }));
        await tx.notes.put(makeNote({ id: 'n', deckId: 'd' }));
        await tx.cards.put(makeCard({ id: 'c', noteId: 'n', deckId: 'd' }));
        // Reads inside the transaction see its own writes.
        expect((await tx.cards.byNote(['n'])).map((c) => c.id)).toEqual(['c']);
        return 42;
      });
      expect(result).toBe(42);
      expect(await repo().decks.get('d')).toBeDefined();
      expect(await repo().notes.get('n')).toBeDefined();
      expect(await repo().cards.get('c')).toBeDefined();
    });

    it('rolls back every store when the callback throws', async () => {
      await repo().decks.put(makeDeck({ id: 'd', name: 'Before' }));
      await repo().notes.put(makeNote({ id: 'kept' }));
      await repo().settings.put(makeSetting('theme', 'dark'));
      await repo().media.put(makeMedia({ id: 'm' }));
      await repo().media.putContent('m', new Uint8Array([1, 2]));
      const before = await snapshot(repo());

      const failing = repo().transaction(async (tx) => {
        await tx.decks.put(makeDeck({ id: 'd', name: 'After', updatedAt: 99 }));
        await tx.decks.put(makeDeck({ id: 'd2' }));
        await tx.notes.purge(['kept']);
        await tx.notes.putMany([makeNote({ id: 'n1' }), makeNote({ id: 'n2' })]);
        await tx.cards.put(makeCard({ id: 'c' }));
        await tx.reviewLogs.add(makeReviewLog({ id: 'l' }));
        await tx.media.putContent('m', new Uint8Array([9]));
        await tx.media.put(makeMedia({ id: 'm2' }));
        await tx.settings.put(makeSetting('theme', 'light'));
        await tx.settings.put(makeSetting('locale', 'en'));
        await tx.importBatches.put(makeImportBatch({ id: 'b' }));
        throw new Boom('stop');
      });
      await expect(failing).rejects.toBeInstanceOf(Boom);
      expect(await snapshot(repo())).toStrictEqual(before);
    });

    it('rolls back writes made through intermediate async helpers', async () => {
      // Returning (not awaiting) a storage promise from an async helper adds microtask hops.
      const putDeck = async (tx: Stores, id: string) => tx.decks.put(makeDeck({ id }));
      const failing = repo().transaction(async (tx) => {
        await putDeck(tx, 'a');
        await putDeck(tx, 'b');
        await Promise.all([putDeck(tx, 'c'), tx.notes.put(makeNote({ id: 'n' }))]);
        throw new Boom('stop');
      });
      await expect(failing).rejects.toBeInstanceOf(Boom);
      expect(await repo().decks.count()).toBe(0);
      expect(await repo().notes.count()).toBe(0);
    });

    it('rejects writes through transaction stores once the transaction has ended', async () => {
      const leaked = await repo().transaction((tx) => Promise.resolve(tx));
      await expect(leaked.decks.put(makeDeck({ id: 'late' }))).rejects.toThrow();
      expect(await repo().decks.count()).toBe(0);
    });

    it('keeps working after a rollback', async () => {
      await expect(
        repo().transaction(async (tx) => {
          await tx.decks.put(makeDeck({ id: 'x' }));
          throw new Boom('stop');
        }),
      ).rejects.toBeInstanceOf(Boom);
      await repo().transaction(async (tx) => {
        await tx.decks.put(makeDeck({ id: 'y' }));
      });
      expect((await repo().decks.list()).map((d) => d.id)).toEqual(['y']);
    });
  });

  describe('clear', () => {
    it('deletes every record of every store', async () => {
      await repo().decks.put(makeDeck({ id: 'd', deletedAt: 1 }));
      await repo().notes.put(makeNote({ id: 'n' }));
      await repo().cards.put(makeCard({ id: 'c' }));
      await repo().reviewLogs.add(makeReviewLog({ id: 'l' }));
      await repo().media.put(makeMedia({ id: 'm' }));
      await repo().media.putContent('m', new Uint8Array([1]));
      await repo().settings.put(makeSetting('theme', 'dark'));
      await repo().importBatches.put(makeImportBatch({ id: 'b' }));
      await repo().clear();
      expect(await snapshot(repo())).toStrictEqual({
        decks: [],
        notes: [],
        cards: [],
        logs: [],
        media: [],
        content: undefined,
        settings: [],
        batches: [],
      });
      expect(await repo().reviewLogs.count()).toBe(0);
    });
  });
}
