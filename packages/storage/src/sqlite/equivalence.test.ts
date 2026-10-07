import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CardState } from '@mnemo/core';
import type { Repository, Stores } from '../repository';
import { createMemoryRepository } from '../memory';
import { makeCard, makeDeck, makeNote, makeReviewLog } from '../testing';
import { createSqliteRepository } from '.';

type Op =
  | { kind: 'deck'; id: string; name: string; updatedAt: number; deleted: boolean }
  | {
      kind: 'note';
      id: string;
      deckId: string;
      noteTypeId: string;
      tags: string[];
      text: string;
      needsReview: boolean | undefined;
      createdAt: number;
      updatedAt: number;
      deleted: boolean;
    }
  | {
      kind: 'card';
      id: string;
      noteId: string;
      deckId: string;
      state: CardState;
      due: number;
      newPosition: number | undefined;
      suspended: boolean;
      leech: boolean;
      updatedAt: number;
      deleted: boolean;
    }
  | { kind: 'log'; id: string; cardId: string; ts: number; deletedAt: number | undefined }
  | { kind: 'removeLog'; id: string }
  | { kind: 'purge'; table: 'decks' | 'notes' | 'cards'; ids: string[] };

type Step = { kind: 'op'; op: Op } | { kind: 'tx'; ops: Op[]; fail: boolean };

const ts = fc.integer({ min: 0, max: 20 });
const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant('deck' as const),
    id: fc.constantFrom('a', 'b', 'c', 'd'),
    name: fc.string({ minLength: 1, maxLength: 5 }),
    updatedAt: ts,
    deleted: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('note' as const),
    id: fc.constantFrom('n1', 'n2', 'n3', 'n4', 'n5'),
    deckId: fc.constantFrom('a', 'b'),
    noteTypeId: fc.constantFrom('basic', 'mcq'),
    tags: fc.subarray(['x', 'X::sub', 'y', 'é', 'xy']),
    text: fc.constantFrom('Réseau', 'reseau', 'Ethernet', 'trame', 'ÉCOLE'),
    needsReview: fc.constantFrom(true, false, undefined),
    createdAt: ts,
    updatedAt: ts,
    deleted: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('card' as const),
    id: fc.constantFrom('c1', 'c2', 'c3', 'c4', 'c5', 'c6'),
    noteId: fc.constantFrom('n1', 'n2', 'n3'),
    deckId: fc.constantFrom('a', 'b'),
    state: fc.constantFrom<CardState>('new', 'learning', 'review', 'relearning'),
    due: ts,
    newPosition: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
    suspended: fc.boolean(),
    leech: fc.boolean(),
    updatedAt: ts,
    deleted: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('log' as const),
    id: fc.constantFrom('l1', 'l2', 'l3', 'l4'),
    cardId: fc.constantFrom('c1', 'c2'),
    ts,
    deletedAt: fc.option(ts, { nil: undefined }),
  }),
  fc.record({ kind: fc.constant('removeLog' as const), id: fc.constantFrom('l1', 'l2') }),
  fc.record({
    kind: fc.constant('purge' as const),
    table: fc.constantFrom('decks' as const, 'notes' as const, 'cards' as const),
    ids: fc.subarray(['a', 'b', 'n1', 'n2', 'n3', 'c1', 'c2']),
  }),
);
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: opArb.map((op) => ({ kind: 'op' as const, op })) },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('tx' as const),
      ops: fc.array(opArb, { maxLength: 4 }),
      fail: fc.boolean(),
    }),
  },
);

/** Spreads `deletedAt` only when set: an explicit `undefined` key does not survive JSON. */
const tombstone = (deleted: boolean, at: number) => (deleted ? { deletedAt: at } : {});

async function apply(stores: Stores, op: Op): Promise<void> {
  switch (op.kind) {
    case 'purge':
      return stores[op.table].purge(op.ids);
    case 'deck':
      return stores.decks.put(
        makeDeck({
          id: op.id,
          name: op.name,
          updatedAt: op.updatedAt,
          ...tombstone(op.deleted, op.updatedAt),
        }),
      );
    case 'note':
      return stores.notes.put(
        makeNote({
          id: op.id,
          deckId: op.deckId,
          noteTypeId: op.noteTypeId,
          tags: op.tags,
          fields: { front: op.text },
          createdAt: op.createdAt,
          updatedAt: op.updatedAt,
          ...(op.needsReview === undefined ? {} : { needsReview: op.needsReview }),
          ...tombstone(op.deleted, op.updatedAt),
        }),
      );
    case 'card':
      return stores.cards.put(
        makeCard({
          id: op.id,
          noteId: op.noteId,
          deckId: op.deckId,
          state: op.state,
          due: op.due,
          suspended: op.suspended,
          leech: op.leech,
          updatedAt: op.updatedAt,
          ...(op.newPosition === undefined ? {} : { newPosition: op.newPosition }),
          ...tombstone(op.deleted, op.updatedAt),
        }),
      );
    case 'log':
      return stores.reviewLogs.add(
        makeReviewLog({
          id: op.id,
          cardId: op.cardId,
          ts: op.ts,
          ...(op.deletedAt === undefined ? {} : { deletedAt: op.deletedAt }),
        }),
      );
    case 'removeLog':
      return stores.reviewLogs.remove(op.id);
  }
}

async function run(repo: Repository, steps: readonly Step[]): Promise<void> {
  for (const step of steps) {
    if (step.kind === 'op') {
      await apply(repo, step.op);
      continue;
    }
    await repo
      .transaction(async (tx) => {
        for (const op of step.ops) await apply(tx, op);
        if (step.fail) throw new Error('rollback');
      })
      .catch(() => undefined);
  }
}

async function observe(repo: Repository) {
  return {
    decks: await repo.decks.list(),
    rawDecks: await repo.decks.getRaw(['a', 'b', 'z']),
    notes: await repo.notes.list(),
    changedDecks: await repo.decks.changedSince(-1),
    changedNotes: await repo.notes.changedSince(3, 4),
    count: await repo.notes.count(),
    tags: await repo.notes.tagCounts(),
    search: await repo.notes.search({ tags: ['x'], text: 'RESEAU', sort: 'updated' }),
    searchCards: await repo.notes.search({ cardState: 'new', suspended: false, limit: 2 }),
    searchMixed: await repo.notes.search({
      deckIds: ['a'],
      noteTypeIds: ['mcq', 'basic'],
      needsReview: false,
      leech: true,
      descending: true,
      offset: 1,
    }),
    searchText: await repo.notes.search({ text: 'ecole', sort: 'created', descending: true }),
    byDeck: await repo.notes.byDeck(['a']),
    cardsByNote: await repo.cards.byNote(['n1', 'n2']),
    cardsByDeck: await repo.cards.byDeck(['b']),
    due: await repo.cards.dueBefore(['a', 'b'], 12),
    newCards: await repo.cards.newCards(['a', 'b'], 3),
    maxNewPosition: await repo.cards.maxNewPosition(),
    changedCards: await repo.cards.changedSince(5),
    logsByCard: await repo.reviewLogs.byCard('c1'),
    logsBetween: await repo.reviewLogs.between(2, 15),
    logCount: await repo.reviewLogs.count(),
    changedLogs: await repo.reviewLogs.changedSince(4, 3),
  };
}

describe('memory and SQLite repositories', () => {
  it('give the same observable results for random operation sequences', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { maxLength: 30 }), async (steps) => {
        const memory = createMemoryRepository();
        const sqlite = createSqliteRepository({ path: ':memory:' });
        try {
          await run(memory, steps);
          await run(sqlite, steps);
          expect(await observe(sqlite)).toStrictEqual(await observe(memory));
        } finally {
          await sqlite.close();
        }
      }),
      { numRuns: 150 },
    );
  });
});
