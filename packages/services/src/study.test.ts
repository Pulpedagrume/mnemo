import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  MINUTE_MS,
  manualClock,
  nextCard,
  afterAnswer,
  seededRng,
} from '@mnemo/core';
import { createMemoryRepository } from '@mnemo/storage';
import {
  activityCsv,
  answer,
  buryCard,
  changePresetAlgorithm,
  createDeck,
  createNote,
  createServiceContext,
  deckTreeWithCounts,
  deletePreset,
  duplicatePreset,
  ensureCollection,
  getDefaultPreset,
  listDecks,
  listNoteTypes,
  listPresets,
  loadStudyItem,
  loadStudyQueue,
  previewAlgorithmChange,
  savePreset,
  setDefaultPreset,
  statsSummary,
  undoAnswer,
  updateDeck,
  PresetError,
} from './index';

const START = Date.UTC(2026, 9, 7, 8); // 10:00 in Paris

async function setup() {
  const repo = createMemoryRepository();
  const clock = manualClock(START);
  const ctx = createServiceContext({
    repo,
    clock,
    rng: seededRng(3),
    deviceTimeZone: 'Europe/Paris',
  });
  await ensureCollection(ctx, 'fr');
  const deck = (await listDecks(ctx))[0];
  if (!deck) throw new Error('no default deck');
  return { ctx, clock, deck };
}

async function addBasic(ctx: Awaited<ReturnType<typeof setup>>['ctx'], deckId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await createNote(ctx, {
      noteTypeId: 'basic',
      deckId,
      fields: { front: `Q${String(i)}`, back: `A${String(i)}` },
      tags: ['t'],
      hints: [],
    });
  }
}

describe('collection bootstrap', () => {
  it('seeds note types, presets, the default preset and a deck, idempotently', async () => {
    const { ctx } = await setup();
    await ensureCollection(ctx, 'fr');
    expect((await listNoteTypes(ctx)).length).toBe(9);
    const presets = await listPresets(ctx);
    expect(presets).toHaveLength(5);
    expect((await getDefaultPreset(ctx)).name).toBe('Standard');
    expect((await listDecks(ctx)).map((d) => d.name)).toEqual(['Par défaut']);
  });
});

describe('studying', () => {
  it('counts, studies, logs, re-queues learning cards and undoes', async () => {
    const { ctx, clock, deck } = await setup();
    await addBasic(ctx, deck.id, 25);
    const tree = await deckTreeWithCounts(ctx);
    expect(tree[0]?.counts).toEqual({ new: 20, learning: 0, review: 0 });

    const loaded = await loadStudyQueue(ctx, deck.id);
    const { endOfDay, cram } = loaded;
    let queue = loaded.queue;
    expect(cram).toBe(false);
    const next = nextCard(queue, clock.now(), 20);
    if (next.kind !== 'card') throw new Error('expected a card');
    const item = await loadStudyItem(ctx, next.card.id, 'fr');
    expect(item?.labels[1]).toMatch(/min/);
    expect(item?.noteType.id).toBe('basic');

    const res = await answer(ctx, {
      cardId: next.card.id,
      rating: 1,
      hintsUsed: 1,
      durationMs: 4000,
      cram: false,
    });
    expect(res.log).toMatchObject({
      rating: 1,
      hintUsed: 1,
      stateBefore: 'new',
      algorithm: 'fsrs',
    });
    queue = afterAnswer(queue, res.card, endOfDay);
    expect(queue.counts).toEqual({ new: 19, learning: 1, review: 0 });
    expect((await deckTreeWithCounts(ctx))[0]?.counts).toEqual({ new: 19, learning: 1, review: 0 });

    await undoAnswer(ctx, res.undo);
    expect((await ctx.repo.cards.get(next.card.id))?.state).toBe('new');
    expect(await ctx.repo.reviewLogs.count()).toBe(0);
    ({ queue } = await loadStudyQueue(ctx, deck.id));
    expect(queue.counts.new).toBe(20);
    expect(await ctx.repo.reviewLogs.get(res.log.id)).toBeUndefined();
  });

  it('undoes an already synced review with a log tombstone ignored by stats', async () => {
    const { ctx, clock, deck } = await setup();
    await addBasic(ctx, deck.id, 1);
    const { queue } = await loadStudyQueue(ctx, deck.id);
    const next = nextCard(queue, clock.now(), 20);
    if (next.kind !== 'card') throw new Error('expected a card');
    const res = await answer(ctx, {
      cardId: next.card.id,
      rating: 3,
      hintsUsed: 0,
      durationMs: 1000,
      cram: false,
    });
    // Sync metadata means the log may have left the device.
    await ctx.repo.reviewLogs.add({ ...res.log, sync: { hlc: 'h' } });
    clock.advance(1000);
    await undoAnswer(ctx, res.undo);
    await undoAnswer(ctx, res.undo);
    expect(await ctx.repo.reviewLogs.get(res.log.id)).toMatchObject({ deletedAt: START + 1000 });
    expect(await ctx.repo.reviewLogs.count()).toBe(0);
    expect(await ctx.repo.reviewLogs.byCard(next.card.id)).toEqual([]);
    expect((await statsSummary(ctx)).activity.reduce((n, d) => n + d.reviews, 0)).toBe(0);
  });

  it.each(['fsrs', 'sm2', 'anki', 'leitner', 'ladder'])(
    'studies a card with %s',
    async (algorithm) => {
      const { ctx, clock, deck } = await setup();
      await addBasic(ctx, deck.id, 1);
      const preset = await getDefaultPreset(ctx);
      await changePresetAlgorithm(ctx, preset.id, algorithm);
      const { queue } = await loadStudyQueue(ctx, deck.id);
      const card = queue.main[0];
      if (!card) throw new Error('no card');
      const first = await answer(ctx, {
        cardId: card.id,
        rating: 3,
        hintsUsed: 0,
        durationMs: 1000,
        cram: false,
      });
      expect(first.log.algorithm).toBe(algorithm);
      expect(first.card.due).toBeGreaterThan(clock.now());
      clock.advance(40 * DAY_MS);
      const second = await answer(ctx, {
        cardId: card.id,
        rating: 3,
        hintsUsed: 0,
        durationMs: 1000,
        cram: false,
      });
      expect(second.card.state).not.toBe('new');
      expect(Number.isFinite(second.card.interval)).toBe(true);
    },
  );

  it('tags leeches and supports burying', async () => {
    const { ctx, deck } = await setup();
    await addBasic(ctx, deck.id, 2);
    const preset = await getDefaultPreset(ctx);
    await savePreset(ctx, { ...preset, behavior: { ...preset.behavior, leechThreshold: 1 } });
    const cards = await ctx.repo.cards.list();
    const c = cards[0];
    if (!c) throw new Error('no card');
    await ctx.repo.cards.put({
      ...c,
      state: 'review',
      interval: 5,
      due: START - DAY_MS,
      stability: 5,
      difficulty: 5,
      reps: 3,
      lastReview: START - 6 * DAY_MS,
    });
    const res = await answer(ctx, {
      cardId: c.id,
      rating: 1,
      hintsUsed: 0,
      durationMs: 1000,
      cram: false,
    });
    expect(res.becameLeech).toBe(true);
    expect((await ctx.repo.notes.get(c.noteId))?.tags).toContain('leech');
    await undoAnswer(ctx, res.undo);
    expect((await ctx.repo.notes.get(c.noteId))?.tags).not.toContain('leech');

    const other = cards[1];
    if (!other) throw new Error('no card');
    await buryCard(ctx, other.id);
    const { queue } = await loadStudyQueue(ctx, deck.id);
    expect(queue.main.map((x) => x.id)).not.toContain(other.id);
  });

  it('supports custom study modes', async () => {
    const { ctx, clock, deck } = await setup();
    await addBasic(ctx, deck.id, 3);
    const [a, b] = await ctx.repo.cards.list();
    if (!a || !b) throw new Error('cards');
    await ctx.repo.cards.put({ ...a, state: 'review', interval: 3, due: START + 2 * DAY_MS });
    const ahead = await loadStudyQueue(ctx, deck.id, { kind: 'ahead', days: 3 });
    expect(ahead.cram).toBe(false);
    expect(ahead.queue.main.map((c) => c.id)).toEqual([a.id]);
    const cram = await loadStudyQueue(ctx, deck.id, { kind: 'cram' });
    expect(cram.cram).toBe(true);
    expect(cram.queue.main).toHaveLength(1);
    const tag = await loadStudyQueue(ctx, deck.id, { kind: 'tag', tag: 't' });
    expect(tag.queue.main).toHaveLength(3);
    const sel = await loadStudyQueue(ctx, deck.id, { kind: 'selection', cardIds: [b.id] });
    expect(sel.queue.main.map((c) => c.id)).toEqual([b.id]);
    await answer(ctx, { cardId: b.id, rating: 1, hintsUsed: 0, durationMs: 1, cram: false });
    clock.advance(HOUR_MS);
    const mistakes = await loadStudyQueue(ctx, deck.id, { kind: 'mistakes', days: 7 });
    expect(mistakes.queue.main.map((c) => c.id)).toEqual([b.id]);
    const cramAnswer = await answer(ctx, {
      cardId: a.id,
      rating: 1,
      hintsUsed: 0,
      durationMs: 1,
      cram: true,
    });
    expect(cramAnswer.card.due).toBe(START + 2 * DAY_MS);
    expect(cramAnswer.log.cram).toBe(true);
  });
});

describe('presets', () => {
  it('inherits presets from parent decks and applies limits', async () => {
    const { ctx } = await setup();
    const child = await createDeck(ctx, 'Langues::Anglais');
    const parent = (await listDecks(ctx)).find((d) => d.name === 'Langues');
    if (!parent) throw new Error('parent');
    const presets = await listPresets(ctx);
    const small = await duplicatePreset(ctx, presets[0]?.id ?? '', 'Petit');
    await savePreset(ctx, { ...small, limits: { ...small.limits, newPerDay: 2 } });
    await updateDeck(ctx, parent.id, { presetId: small.id });
    await addBasic(ctx, child.id, 5);
    const { queue } = await loadStudyQueue(ctx, child.id);
    expect(queue.counts.new).toBe(2);
    await expect(deletePreset(ctx, (await getDefaultPreset(ctx)).id)).rejects.toBeInstanceOf(
      PresetError,
    );
    await deletePreset(ctx, small.id);
    expect((await ctx.repo.decks.get(parent.id))?.presetId).toBeUndefined();
    await setDefaultPreset(ctx, presets[1]?.id ?? '');
    expect((await getDefaultPreset(ctx)).id).toBe(presets[1]?.id);
    await expect(
      savePreset(ctx, { ...small, algorithm: 'no-such-algorithm' }),
    ).rejects.toBeInstanceOf(PresetError);
  });

  it('previews and applies an algorithm change without invalid states', async () => {
    const { ctx, deck } = await setup();
    await addBasic(ctx, deck.id, 4);
    const preset = await getDefaultPreset(ctx);
    await changePresetAlgorithm(ctx, preset.id, 'anki');
    for (const c of await ctx.repo.cards.list()) {
      await ctx.repo.cards.put({
        ...c,
        state: 'review',
        interval: 10,
        ease: 2.5,
        reps: 3,
        due: START + DAY_MS,
        lastReview: START - 9 * DAY_MS,
      });
    }
    const preview = await previewAlgorithmChange(ctx, preset.id, 'fsrs');
    expect(preview.cards).toBe(4);
    expect(preview.before.tomorrow).toBe(4);
    const updated = await changePresetAlgorithm(ctx, preset.id, 'fsrs');
    expect(updated.algorithm).toBe('fsrs');
    for (const c of await ctx.repo.cards.list()) {
      expect(Number.isNaN(c.interval)).toBe(false);
      expect(c.interval).toBeGreaterThanOrEqual(0);
      expect(c.stability).toBeGreaterThan(0);
    }
  });
});

describe('stats', () => {
  it('summarizes activity, retention, forecast and exports CSV', async () => {
    const { ctx, clock, deck } = await setup();
    await addBasic(ctx, deck.id, 3);
    for (const c of await ctx.repo.cards.list()) {
      await answer(ctx, {
        cardId: c.id,
        rating: 3,
        hintsUsed: 0,
        durationMs: 2 * MINUTE_MS,
        cram: false,
      });
    }
    const s = await statsSummary(ctx);
    expect(s.activity).toHaveLength(1);
    expect(s.activity[0]?.reviews).toBe(3);
    expect(s.streak).toBe(1);
    expect(s.totalCards).toBe(3);
    expect(s.time.todayMs).toBe(3 * 60_000);
    expect(s.forecast.reduce((a, b) => a + b, 0)).toBe(3);
    expect(activityCsv(s)).toMatch(/^date,reviews,minutes\n2026-10-07,3,3\n$/);
    const scoped = await statsSummary(ctx, deck.id);
    expect(scoped.totalCards).toBe(3);
    clock.advance(DAY_MS);
    expect((await statsSummary(ctx)).streak).toBe(1);
  });
});
