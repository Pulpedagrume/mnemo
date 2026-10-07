import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { describeRepositoryConformance, makeDeck } from '../testing';
import { createDexieRepository } from '.';

let counter = 0;

/** A Dexie repository over fake-indexeddb, with a unique database name. */
function createTestDexieRepository() {
  counter += 1;
  return createDexieRepository({ name: `mnemo-test-${counter}`, indexedDB, IDBKeyRange });
}

describeRepositoryConformance('dexie', () => Promise.resolve(createTestDexieRepository()));

describe('dexie repository specifics', () => {
  it('persists data across connections to the same database', async () => {
    const name = `mnemo-reopen-${counter++}`;
    const first = createDexieRepository({ name, indexedDB, IDBKeyRange });
    const deck = makeDeck({ id: 'd' });
    await first.decks.put(deck);
    await first.close();
    const second = createDexieRepository({ name, indexedDB, IDBKeyRange });
    expect(await second.decks.get('d')).toStrictEqual(deck);
    await second.close();
  });
});
