import {
  rngForReview,
  schedulerContext,
  type AnyScheduler,
  type Card,
  type CardMemory,
  type ReviewLog,
  type StudyCalendar,
} from '@mnemo/core';

/**
 * Maintenance (docs/SYNC.md): recomputes a card's scheduling memory by replaying its review logs
 * in time order (ts, then id) from a blank memory. Cram reviews and undone reviews (tombstones)
 * are skipped, as are logs of other cards. Other card fields are kept; pure.
 */
export function rebuildCardFromLogs(
  card: Card,
  logs: readonly ReviewLog[],
  scheduler: AnyScheduler,
  params: unknown,
  calendar: StudyCalendar,
): Card {
  const replay = logs
    .filter((l) => l.cardId === card.id && !l.cram && l.deletedAt === undefined)
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const validated: unknown = scheduler.validate(params);
  let memory: CardMemory = scheduler.initCard({ now: replay[0]?.ts ?? card.createdAt });
  for (const log of replay) {
    const ctx = schedulerContext(validated, log.ts, rngForReview(card.id, memory.reps), calendar);
    memory = scheduler.schedule(memory, log.rating, ctx).card;
  }
  const out: Card = { ...card, ...memory };
  if (memory.lastReview === undefined) delete out.lastReview;
  if (memory.schedulerData === undefined) delete out.schedulerData;
  return out;
}
