import type { Card, Rating } from '../model/card';
import { cardMemory } from '../model/card';
import type { Preset } from '../model/preset';
import type { ReviewLog } from '../model/reviewLog';
import type { Rng } from '../rng';
import type { AnyScheduler, SchedulerContext } from '../scheduling/types';
import type { StudyCalendar } from '../time';
import { SECOND_MS } from '../time';
import { paramsHash } from '../util/hash';
import { applyHintPolicy } from './hints';

export function schedulerContext<P>(
  params: P,
  now: number,
  rng: Rng,
  calendar: StudyCalendar,
): SchedulerContext<P> {
  const today = calendar.today(now);
  return {
    now,
    params,
    rng,
    dayStart: calendar.startOf(today),
    startOfDay: (offset) => calendar.startOf(today + offset),
  };
}

export interface AnswerInput {
  card: Card;
  /** Rating chosen by the user (before the hint policy). */
  rating: Rating;
  hintsUsed: number;
  durationMs: number;
  answer?: string;
  /** Cram mode: log the review without changing the schedule. */
  cram: boolean;
  preset: Preset;
  scheduler: AnyScheduler;
  now: number;
  rng: Rng;
  calendar: StudyCalendar;
  logId: string;
}

export interface AnswerResult {
  card: Card;
  log: ReviewLog;
  /** The card just crossed the leech threshold (the caller tags the note when action = tag). */
  becameLeech: boolean;
}

/** Applies one answer: hint policy, scheduling, leech detection, and the review log. Pure. */
export function answerCard(input: AnswerInput): AnswerResult {
  const { card, preset, scheduler, now } = input;
  const rating = applyHintPolicy(input.rating, input.hintsUsed, preset.behavior.hintPolicy);
  const durationMs = Math.min(
    Math.max(0, Math.round(input.durationMs)),
    preset.behavior.maxAnswerSeconds * SECOND_MS,
  );
  const params: unknown = scheduler.validate(preset.params);

  let updated: Card = card;
  let becameLeech = false;
  if (!input.cram) {
    const ctx = schedulerContext(params, now, input.rng, input.calendar);
    const { card: memory } = scheduler.schedule(cardMemory(card), rating, ctx);
    updated = { ...card, ...memory, updatedAt: now };
    if (memory.lastReview === undefined) delete updated.lastReview;
    if (memory.schedulerData === undefined) delete updated.schedulerData;
    const threshold = preset.behavior.leechThreshold;
    if (
      threshold > 0 &&
      !card.leech &&
      updated.lapses >= threshold &&
      updated.lapses > card.lapses
    ) {
      becameLeech = true;
      updated.leech = true;
      if (preset.behavior.leechAction === 'suspend') updated.suspended = true;
    }
  }

  const log: ReviewLog = {
    id: input.logId,
    cardId: card.id,
    ts: now,
    rating,
    durationMs,
    stateBefore: card.state,
    stateAfter: updated.state,
    intervalBefore: card.interval,
    intervalAfter: updated.interval,
    dueBefore: card.due,
    dueAfter: updated.due,
    algorithm: scheduler.id,
    presetId: preset.id,
    paramsHash: paramsHash(params),
    cram: input.cram,
    hintUsed: Math.max(0, Math.floor(input.hintsUsed)),
  };
  if (input.answer !== undefined) log.answer = input.answer.slice(0, 5_000);
  return { card: updated, log, becameLeech };
}
