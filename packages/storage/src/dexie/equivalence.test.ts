import fc from 'fast-check';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Repository, Stores } from '../repository';
import { createMemoryRepository } from '../memory';
import { makeDeck, makeNote } from '../testing';
import { createDexieRepository } from '.';

type Op =
  | { kind: 'deck'; id: string; name: string; updatedAt: number; deleted: boolean }
  | {
      kind: 'note';
      id: string;
      deckId: string;
      tags: string[];
      text: string;
      createdAt: number;
      updatedAt: number;
      deleted: boolean;
    }
  | { kind: 'purge'; table: 'decks' | 'notes'; ids: string[] };

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
    tags: fc.subarray(['x', 'X::sub', 'y', 'é']),
    text: fc.constantFrom('Réseau', 'reseau', 'Ethernet', 'trame'),
    createdAt: ts,
    updatedAt: ts,
    deleted: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('purge' as const),
    table: fc.constantFrom('decks' as const, 'notes' as const),
    ids: fc.subarray(['a', 'b', 'n1', 'n2', 'n3']),
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

async function apply(stores: Stores, op: Op): Promise<void> {
  if (op.kind === 'purge') return stores[op.table].purge(op.ids);
  const deletedAt = op.deleted ? op.updatedAt : undefined;
  if (op.kind === 'deck') {
    const deck = makeDeck({ id: op.id, name: op.name, updatedAt: op.updatedAt });
    return stores.decks.put(deletedAt === undefined ? deck : { ...deck, deletedAt });
  }
  const note = makeNote({
    id: op.id,
    deckId: op.deckId,
    tags: op.tags,
    fields: { front: op.text },
    createdAt: op.createdAt,
    updatedAt: op.updatedAt,
  });
  return stores.notes.put(deletedAt === undefined ? note : { ...note, deletedAt });
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
    notes: await repo.notes.list(),
    changedDecks: await repo.decks.changedSince(-1),
    changedNotes: await repo.notes.changedSince(3, 4),
    count: await repo.notes.count(),
    tags: await repo.notes.tagCounts(),
    search: await repo.notes.search({ tags: ['x'], text: 'RESEAU', sort: 'updated' }),
    byDeck: await repo.notes.byDeck(['a']),
  };
}

let counter = 0;

describe('memory and Dexie repositories', () => {
  it('give the same observable results for random operation sequences', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(stepArb, { maxLength: 25 }), async (steps) => {
        const memory = createMemoryRepository();
        counter += 1;
        const dexie = createDexieRepository({
          name: `mnemo-equivalence-${counter}`,
          indexedDB,
          IDBKeyRange,
        });
        try {
          await run(memory, steps);
          await run(dexie, steps);
          expect(await observe(dexie)).toStrictEqual(await observe(memory));
        } finally {
          await dexie.close();
        }
      }),
      { numRuns: 60 },
    );
  });
});
