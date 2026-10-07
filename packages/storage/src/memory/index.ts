import type { Repository } from '../repository';
import { clearMemoryState, createMemoryState } from './state';
import { createMemoryStores } from './stores';
import { Journal } from './table';

/**
 * In-memory repository (tests, CLI dry runs). Values are deep-copied on write and on read.
 *
 * Transactions use an undo log: writes apply immediately and are reverted if `fn` throws. There is
 * no isolation from concurrent writes made outside the transaction (a rollback restores the values
 * the transaction overwrote). Stores handed to `fn` reject writes once the transaction has ended.
 */
export function createMemoryRepository(): Repository {
  const state = createMemoryState();
  return {
    ...createMemoryStores(state),
    async transaction(fn) {
      const journal = new Journal();
      try {
        const result = await fn(createMemoryStores(state, journal));
        journal.commit();
        return result;
      } catch (error) {
        journal.rollback();
        throw error;
      }
    },
    clear: () =>
      new Promise<void>((resolve) => {
        clearMemoryState(state);
        resolve();
      }),
    close: () => Promise.resolve(),
  };
}
