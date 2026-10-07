/// <reference types="node" />
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { blankMemory, manualClock, seededRng } from '@mnemo/core';
import { readApkg, type ApkgScheduleEntry, type SqlEngine } from '@mnemo/importers';
import { createMemoryRepository } from '@mnemo/storage';
import {
  applyApkgScheduling,
  applyImport,
  createDeck,
  createNote,
  createServiceContext,
  ensureCollection,
  exportNotes,
  type MediaPayload,
} from './index';

const engine: SqlEngine = {
  open(bytes) {
    const dir = mkdtempSync(join(tmpdir(), 'mnemo-apkg-'));
    const file = join(dir, 'c.db');
    if (bytes) writeFileSync(file, bytes);
    const db = new DatabaseSync(file);
    return Promise.resolve({
      all: (sql, params = []) =>
        db.prepare(sql).all(...(params as SQLInputValue[])) as Record<string, unknown>[],
      run: (sql, params) => {
        if (params) db.prepare(sql).run(...(params as SQLInputValue[]));
        else db.exec(sql);
      },
      export: () => new Uint8Array(readFileSync(file)),
      close: () => {
        db.close();
        rmSync(dir, { recursive: true, force: true });
      },
    });
  },
};

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const NOW = Date.UTC(2026, 9, 7);

async function context() {
  const ctx = createServiceContext({
    repo: createMemoryRepository(),
    clock: manualClock(NOW),
    rng: seededRng(4),
    deviceTimeZone: 'UTC',
  });
  await ensureCollection(ctx, 'fr');
  return ctx;
}

describe('apkg export and scheduling', () => {
  it('exports a deck to .apkg and imports it back with its media', async () => {
    const source = await context();
    const deck = await createDeck(source, 'Géo::Europe');
    await source.repo.media.put({
      id: 'img1',
      sha256: 'f'.repeat(64),
      mime: 'image/png',
      size: PNG.byteLength,
      name: 'carte.png',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await source.repo.media.putContent('img1', PNG);
    const common = { deckId: deck.id, tags: ['geo'], hints: [] };
    await createNote(source, {
      ...common,
      uid: 'q1',
      noteTypeId: 'basic',
      fields: { front: 'Capitale ?', back: 'Paris ![](media:img1)' },
    });
    await createNote(source, {
      ...common,
      uid: 'q2',
      noteTypeId: 'cloze',
      fields: { text: 'La {{c1::Seine}}' },
    });
    await expect(exportNotes(source, { deckId: deck.id, format: 'apkg' })).rejects.toThrow();
    const res = await exportNotes(source, { deckId: deck.id, format: 'apkg', sqlEngine: engine });
    expect(res).toMatchObject({ fileName: 'geo-europe.apkg', notes: 2, warnings: [] });
    if (typeof res.content === 'string') throw new Error('binary expected');

    const parsed = await readApkg(res.content, engine, { withScheduling: true });
    expect(parsed.report.counts).toMatchObject({ valid: 2, errors: 0 });
    const target = await context();
    const media = new Map<string, MediaPayload>([...parsed.mediaFiles]);
    const batch = await applyImport(target, parsed, {
      mode: 'skip-duplicates',
      targetDeck: 'Import',
      fileName: res.fileName,
      media,
    });
    expect(batch.counts.created).toBe(2);
    const notes = await target.repo.notes.byDeck((await target.repo.decks.list()).map((d) => d.id));
    const q1 = notes.find((n) => n.uid === 'q1');
    expect(q1?.fields.back).toMatch(/^Paris !\[\]\(media:[\w-]+\)$/);
    const mediaId = /media:([\w-]+)/.exec(q1?.fields.back ?? '')?.[1] ?? '';
    expect(await target.repo.media.getContent(mediaId)).toEqual(PNG);
    // Exported cards are new: no scheduling to apply.
    expect(await applyApkgScheduling(target, batch, parsed.scheduling)).toBe(0);
  });

  it('applies Anki scheduling to created notes only', async () => {
    const ctx = await context();
    const deck = await createDeck(ctx, 'A');
    const { note } = await createNote(ctx, {
      uid: 'anki-x1',
      noteTypeId: 'basic_reversed',
      deckId: deck.id,
      fields: { front: 'a', back: 'b' },
      tags: [],
      hints: [],
    });
    const due = NOW + 3 * 86_400_000;
    const entry: ApkgScheduleEntry = {
      ord: 1,
      suspended: true,
      memory: { ...blankMemory(NOW), state: 'review', due, interval: 5, ease: 2.3, reps: 3 },
    };
    const scheduling = new Map([['anki-x1', [entry]]]);
    expect(
      await applyApkgScheduling(ctx, { noteIds: [note.id], previousVersions: [note] }, scheduling),
    ).toBe(0);
    expect(
      await applyApkgScheduling(ctx, { noteIds: [note.id], previousVersions: [] }, scheduling),
    ).toBe(1);
    const cards = await ctx.repo.cards.byNote([note.id]);
    expect(cards.find((c) => c.ord === 0)).toMatchObject({ state: 'new', suspended: false });
    expect(cards.find((c) => c.ord === 1)).toMatchObject({
      state: 'review',
      due,
      interval: 5,
      ease: 2.3,
      reps: 3,
      suspended: true,
      updatedAt: NOW,
    });
  });
});
