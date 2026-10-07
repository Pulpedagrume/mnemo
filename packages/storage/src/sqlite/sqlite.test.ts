/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, describe, expect, it } from 'vitest';
import { describeRepositoryConformance, makeCard, makeDeck, makeNote } from '../testing';
import { MIGRATIONS, createSqliteRepository, migrate } from '.';

describeRepositoryConformance('sqlite', () =>
  Promise.resolve(createSqliteRepository({ path: ':memory:' })),
);

const dir = mkdtempSync(join(tmpdir(), 'mnemo-sqlite-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('sqlite repository specifics', () => {
  it('persists data in a file across connections, and reopening keeps the schema', async () => {
    const path = join(dir, 'reopen.db');
    const first = createSqliteRepository({ path });
    const deck = makeDeck({ id: 'd' });
    const note = makeNote({ id: 'n', tags: ['a::b'], deckId: 'd' });
    await first.decks.put(deck);
    await first.notes.put(note);
    await first.media.putContent('m', new Uint8Array([1, 2, 3]));
    await first.close();

    const second = createSqliteRepository({ path });
    expect(await second.decks.get('d')).toStrictEqual(deck);
    expect(await second.notes.tagCounts()).toEqual([{ tag: 'a::b', count: 1 }]);
    expect(Array.from((await second.media.getContent('m')) ?? [])).toEqual([1, 2, 3]);
    await second.close();

    const raw = new DatabaseSync(path);
    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: MIGRATIONS.length,
      });
      expect(raw.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    } finally {
      raw.close();
    }
  });

  it('runs migrations once, in order, and refuses a newer schema', () => {
    const raw = new DatabaseSync(':memory:');
    const target = {
      exec: (sql: string) => {
        raw.exec(sql);
      },
      get: (sql: string) => raw.prepare(sql).get() as Record<string, unknown> | undefined,
    };
    const calls: number[] = [];
    const steps = [
      () => {
        calls.push(1);
        raw.exec('CREATE TABLE t (x)');
      },
      () => {
        calls.push(2);
        raw.exec('ALTER TABLE t ADD COLUMN y');
      },
    ];
    migrate(target, steps.slice(0, 1));
    migrate(target, steps);
    migrate(target, steps);
    expect(calls).toEqual([1, 2]);
    expect(() => {
      migrate(target, steps.slice(0, 1));
    }).toThrow(/newer/);
    // A failing migration is rolled back entirely, version included.
    const failing = [
      ...steps,
      () => {
        raw.exec('CREATE TABLE u (x)');
        throw new Error('boom');
      },
    ];
    expect(() => {
      migrate(target, failing);
    }).toThrow('boom');
    expect(target.get('PRAGMA user_version')).toEqual({ user_version: 2 });
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'u'").get()).toBeUndefined();
    raw.close();
  });

  it('serialises concurrent transactions and queues plain calls behind them', async () => {
    const repo = createSqliteRepository({ path: ':memory:' });
    const events: string[] = [];
    const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
    const first = repo.transaction(async (tx) => {
      events.push('first:start');
      await tx.decks.put(makeDeck({ id: 'a' }));
      await tick();
      events.push('first:end');
      return 1;
    });
    const second = repo.transaction(async (tx) => {
      events.push('second:start');
      // Sees the committed write of the first transaction.
      expect(await tx.decks.get('a')).toBeDefined();
      await tx.decks.put(makeDeck({ id: 'b' }));
      await tick();
      events.push('second:end');
      throw new Error('rollback second');
    });
    const plain = repo.decks.list().then((decks) => {
      events.push(`plain:${decks.map((d) => d.id).join(',')}`);
    });
    await expect(first).resolves.toBe(1);
    await expect(second).rejects.toThrow('rollback second');
    await plain;
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end', 'plain:a']);
    await repo.close();
  });

  it('applies putMany atomically outside transactions', async () => {
    const repo = createSqliteRepository({ path: ':memory:' });
    const bad = { ...makeCard({ id: 'bad' }), due: undefined } as unknown as ReturnType<
      typeof makeCard
    >;
    await expect(repo.cards.putMany([makeCard({ id: 'ok' }), bad])).rejects.toThrow();
    expect(await repo.cards.count()).toBe(0);
    await repo.close();
  });
});
