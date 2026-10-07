import { describe, expect, it } from 'vitest';
import { manualClock } from '@mnemo/core';
import { createMemoryRepository } from '@mnemo/storage';
import { makeDeck, makeImportBatch, makeNote, makeReviewLog } from '@mnemo/storage/testing';
import { createHlcClock, encodeHlc, hlcFromMillis } from './hlc';
import { pathHlc } from './paths';
import { stampEntity, withSyncStamps } from './stamp';
import type { Json } from './util';

function setup() {
  const clock = manualClock(1_000);
  const hlc = createHlcClock(clock, 'dev');
  const raw = createMemoryRepository();
  return { clock, hlc, raw, repo: withSyncStamps(raw, hlc) };
}

const at = (wall: number, counter = 0) => encodeHlc({ wall, counter, node: 'dev' });

describe('stampEntity', () => {
  it('stamps new entities, changed fields, and keeps unchanged clocks', () => {
    let t = 0;
    const now = () => at(++t * 100);
    const clockOf = (e: object, p: string, maps: string[] = []) => pathHlc(e as Json, p, maps);
    const n0 = makeNote({ id: 'n', updatedAt: 5 });
    const s0 = stampEntity(undefined, n0, now);
    expect(s0.sync).toEqual({ hlc: at(100) });
    const s1 = stampEntity(s0, { ...s0, tags: ['x'] }, now);
    expect(s1.sync).toEqual({ hlc: at(200), fields: { '*': at(100), tags: at(200) } });
    expect(clockOf(s1, 'explanation')).toBe(at(100));
    const s2 = stampEntity(s1, { ...s1, sync: { hlc: 'ignored' } }, now);
    expect(s2.sync).toEqual(s1.sync);
    const s3 = stampEntity(s2, { ...s2, deletedAt: 9 }, now);
    expect(s3.sync?.hlc).toBe(at(300));
    expect(clockOf(s3, 'tags')).toBe(at(200));
    expect(clockOf(s3, 'fields')).toBe(at(100));
    const legacy = stampEntity(n0, { ...n0 }, now);
    expect(clockOf(legacy, 'fields')).toBe(hlcFromMillis(5));
    const m = stampEntity(s1, { ...s1, fields: { front: 'F', back: 'Answer' } }, now, ['fields']);
    expect(clockOf(m, 'fields.back', ['fields'])).toBe(at(100));
    expect(clockOf(m, 'fields.front', ['fields'])).toBe(m.sync?.hlc);
    expect(clockOf(m, 'tags')).toBe(at(200));
  });
});

describe('withSyncStamps', () => {
  it('stamps puts of entity stores, inside and outside transactions', async () => {
    const { repo, raw, clock } = setup();
    await repo.decks.put(makeDeck({ id: 'd' }));
    expect((await raw.decks.get('d'))?.sync?.hlc).toBe(at(1_000));
    clock.advance(10);
    await repo.transaction(async (tx) => {
      await tx.notes.putMany([makeNote({ id: 'n1' }), makeNote({ id: 'n2' })]);
      await tx.notes.put({ ...makeNote({ id: 'n1' }), tags: ['t'] });
    });
    const n1 = await raw.notes.get('n1');
    expect(n1?.sync?.hlc).toBe(at(1_010, 2));
    expect(pathHlc(n1 as Json, 'fields.front', ['fields'])).toBe(at(1_010, 0));
    expect(pathHlc(n1 as Json, 'tags', ['fields'])).toBe(at(1_010, 2));
    expect((await repo.notes.list()).map((n) => n.id)).toEqual(['n1', 'n2']);
    await repo.notes.putMany([]);
  });

  it('stamps review logs, import batches and settings (except reserved keys)', async () => {
    const { repo, raw } = setup();
    const log = makeReviewLog({ id: 'l' });
    await repo.reviewLogs.add(log);
    await repo.reviewLogs.addMany([makeReviewLog({ id: 'm' })]);
    await repo.reviewLogs.add({ ...log, deletedAt: 5 });
    const stored = await raw.reviewLogs.get('l');
    expect(stored?.deletedAt).toBe(5);
    expect(stored?.sync?.hlc).toBe(at(1_000, 2));
    expect((await raw.reviewLogs.get('m'))?.sync).toBeDefined();
    await repo.importBatches.put(makeImportBatch({ id: 'b' }));
    expect((await raw.importBatches.get('b'))?.sync).toBeDefined();
    await repo.settings.put({ key: 'theme', value: 'dark', updatedAt: 1 });
    await repo.settings.put({ key: 'sync.state', value: 1, updatedAt: 1 });
    expect((await raw.settings.get('theme'))?.hlc).toBeDefined();
    expect((await raw.settings.get('sync.state'))?.hlc).toBeUndefined();
    expect(await repo.reviewLogs.count()).toBe(1);
  });
});
