import { afterEach, beforeEach, describe } from 'vitest';
import type { Repository } from '../repository';
import { cardSuite } from './suites/cards';
import { entitySuite } from './suites/entities';
import { miscSuite } from './suites/misc';
import { noteSuite } from './suites/notes';
import { transactionSuite } from './suites/transactions';

/**
 * Registers the repository conformance suite. Every implementation (memory, Dexie, SQLite…) must
 * pass it. `factory` must return a fresh, empty repository on each call.
 */
export function describeRepositoryConformance(
  name: string,
  factory: () => Promise<Repository>,
): void {
  describe(`${name} repository conformance`, () => {
    let current: Repository | undefined;
    const repo = (): Repository => {
      if (current === undefined) throw new Error('Repository not initialised');
      return current;
    };

    beforeEach(async () => {
      current = await factory();
    });

    afterEach(async () => {
      await current?.close();
      current = undefined;
    });

    entitySuite(repo);
    noteSuite(repo);
    cardSuite(repo);
    miscSuite(repo);
    transactionSuite(repo);
  });
}
