import { blankMemory } from '../../model/card';
import type { CardMemory, Rating } from '../../model/card';
import { DAY_MS, MINUTE_MS } from '../../time';
import type { RatingPreview, ScheduleResult, Scheduler, SchedulerContext } from '../types';
import {
  adoptedEase,
  clamp,
  closestIndex,
  dueAfter,
  dueInDays,
  genericMemory,
  parseParams,
  safeNumber,
  toResult,
  withoutSchedulerData,
} from '../util';
import { ANKI_PARAM_SPEC, AnkiParamsSchema } from './ankiParams';
import type { AnkiParams } from './ankiParams';

export type { AnkiParams } from './ankiParams';

type Ctx = SchedulerContext<AnkiParams>;

/** Next position in (re)learning steps, or graduation. */
type StepOutcome = { graduate: false; step: number; delayMs: number } | { graduate: true };

function stepOutcome(stepsMin: readonly number[], current: number, rating: Rating): StepOutcome {
  const count = stepsMin.length;
  if (count === 0 || rating === 4) return { graduate: true };
  const cur = clamp(current, 0, count - 1);
  const ms = (i: number) => (stepsMin[i] ?? 0) * MINUTE_MS;
  if (rating === 1) return { graduate: false, step: 0, delayMs: ms(0) };
  if (rating === 2) {
    // Hard repeats the current step; on the first step, halfway to the next one.
    let delayMs = ms(cur);
    if (cur === 0)
      delayMs = count > 1 ? (ms(0) + ms(1)) / 2 : Math.min(ms(0) * 1.5, ms(0) + DAY_MS);
    return { graduate: false, step: cur, delayMs };
  }
  return cur + 1 < count
    ? { graduate: false, step: cur + 1, delayMs: ms(cur + 1) }
    : { graduate: true };
}

/**
 * Rounds a review interval, applies fuzz (driven by the uniform draw `u`) and clamps it.
 * Fuzz is about ±5 % for intervals of 3 days or more, and never brings an interval that grew
 * back to the previous one or below.
 */
function finalDays(ivl: number, previous: number, p: AnkiParams, u: number): number {
  let days = Math.round(Math.min(ivl, p.maxInterval));
  if (p.fuzz && days >= 3) {
    const delta = Math.max(1, Math.round(days * 0.05));
    days += Math.floor(u * (2 * delta + 1)) - delta;
  }
  const floor = ivl >= previous + 1 ? Math.floor(previous) + 1 : 1;
  return clamp(days, Math.min(floor, p.maxInterval), p.maxInterval);
}

function nextMemory(card: CardMemory, ctx: Ctx, patch: Partial<CardMemory>): CardMemory {
  const rest = withoutSchedulerData(card);
  return { ...rest, reps: card.reps + 1, lastReview: ctx.now, ...patch };
}

function pendingInterval(card: CardMemory, p: AnkiParams): number {
  const raw = card.schedulerData?.pendingInterval;
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : p.minLapseInterval;
  return clamp(Math.round(value), 1, p.maxInterval);
}

function currentEase(card: CardMemory, p: AnkiParams): number {
  return card.ease > 0 ? Math.max(p.minEase, card.ease) : p.startingEase;
}

function toReview(card: CardMemory, ctx: Ctx, days: number, ease: number): CardMemory {
  return nextMemory(card, ctx, {
    state: 'review',
    interval: days,
    due: dueInDays(days, ctx),
    ease,
    step: 0,
  });
}

function scheduleLearning(card: CardMemory, rating: Rating, ctx: Ctx, u: number): CardMemory {
  const p = ctx.params;
  const ease = currentEase(card, p);
  const current = card.state === 'new' ? 0 : card.step;
  const outcome = stepOutcome(p.learningSteps, current, rating);
  if (outcome.graduate) {
    const target = rating === 4 ? p.easyInterval : p.graduatingInterval;
    return toReview(card, ctx, finalDays(target, 0, p, u), ease);
  }
  const { due, interval } = dueAfter(outcome.delayMs, ctx);
  return nextMemory(card, ctx, { state: 'learning', step: outcome.step, due, interval, ease });
}

function scheduleRelearning(card: CardMemory, rating: Rating, ctx: Ctx, u: number): CardMemory {
  const p = ctx.params;
  const ease = currentEase(card, p);
  const pending = pendingInterval(card, p);
  const outcome = stepOutcome(p.relearningSteps, card.step, rating);
  if (outcome.graduate) {
    const target = rating === 4 ? pending + 1 : pending;
    return toReview(card, ctx, finalDays(target, 0, p, u), ease);
  }
  const { due, interval } = dueAfter(outcome.delayMs, ctx);
  return nextMemory(card, ctx, {
    state: 'relearning',
    step: outcome.step,
    due,
    interval,
    ease,
    schedulerData: { pendingInterval: pending },
  });
}

function scheduleReview(card: CardMemory, rating: Rating, ctx: Ctx, u: number): CardMemory {
  const p = ctx.params;
  const ease = currentEase(card, p);
  const ivl = Math.max(1, safeNumber(card.interval, 1));
  if (rating === 1) {
    const newEase = Math.max(p.minEase, ease + p.easeAgain);
    const pending = clamp(
      Math.max(p.minLapseInterval, Math.round((ivl * p.lapseNewIntervalPct) / 100)),
      1,
      p.maxInterval,
    );
    const lapsed: CardMemory = { ...card, lapses: card.lapses + 1, ease: newEase };
    if (p.relearningSteps.length === 0) return toReview(lapsed, ctx, pending, newEase);
    return scheduleRelearning(
      { ...lapsed, state: 'relearning', step: 0, schedulerData: { pendingInterval: pending } },
      1,
      ctx,
      u,
    );
  }
  let hard = Math.max(1, ivl * p.hardInterval);
  if (p.hardInterval > 1) hard = Math.max(hard, ivl + 1);
  const good = Math.max(ivl * ease * p.intervalModifier, hard + 1, ivl + 1);
  const easy = Math.max(good * p.easyBonus, good + 1);
  const hardDays = finalDays(hard, ivl, p, u);
  const goodDays = Math.max(finalDays(good, ivl, p, u), Math.min(hardDays + 1, p.maxInterval));
  const easyDays = Math.max(finalDays(easy, ivl, p, u), Math.min(goodDays + 1, p.maxInterval));
  if (rating === 2) return toReview(card, ctx, hardDays, Math.max(p.minEase, ease + p.easeHard));
  if (rating === 3) return toReview(card, ctx, goodDays, ease);
  return toReview(card, ctx, easyDays, ease + p.easeEasy);
}

function scheduleWith(card: CardMemory, rating: Rating, ctx: Ctx, u: number): ScheduleResult {
  let after: CardMemory;
  switch (card.state) {
    case 'new':
    case 'learning':
      after = scheduleLearning(card, rating, ctx, u);
      break;
    case 'relearning':
      after = scheduleRelearning(card, rating, ctx, u);
      break;
    case 'review':
      after = scheduleReview(card, rating, ctx, u);
      break;
  }
  return toResult(card, after);
}

function adopt(card: CardMemory, ctx: Ctx): CardMemory {
  const p = ctx.params;
  if (card.state === 'new') return blankMemory(card.due);
  const base = genericMemory(card);
  const ease = adoptedEase(card, p.startingEase, p.minEase);
  const days = clamp(Math.round(base.interval), 1, p.maxInterval);
  const due = Math.min(base.due, dueInDays(p.maxInterval, ctx));
  const steps = card.state === 'learning' ? p.learningSteps : p.relearningSteps;
  if (card.state === 'review' || steps.length === 0) {
    return { ...base, state: 'review', interval: days, due, ease };
  }
  const step = closestIndex(
    steps.map((m) => (m * MINUTE_MS) / DAY_MS),
    base.interval,
  );
  const adopted: CardMemory = { ...base, step, ease };
  if (card.state === 'relearning') {
    adopted.schedulerData = { pendingInterval: p.minLapseInterval };
  }
  return adopted;
}

/** SM-2 improved with learning steps, in the style of Anki's classic scheduler. */
export const ankiScheduler: Scheduler<AnkiParams> = {
  id: 'anki',
  label: { fr: 'Anki (SM-2 amélioré)', en: 'Anki (improved SM-2)' },
  description: {
    fr: 'Le planificateur classique d’Anki : des étapes d’apprentissage courtes, puis des intervalles multipliés par la « facilité » de chaque carte, qui baisse quand vous peinez et monte quand c’est facile.',
    en: 'Anki’s classic scheduler: short learning steps, then intervals multiplied by each card’s ease, which drops when you struggle and rises when it is easy.',
  },
  paramSpec: ANKI_PARAM_SPEC,
  defaults: AnkiParamsSchema.parse({}),
  validate: (params) => parseParams('anki', AnkiParamsSchema, params),
  initCard: ({ now }) => blankMemory(now),
  schedule: (card, rating, ctx) => scheduleWith(card, rating, ctx, ctx.rng.next()),
  preview(card, ctx) {
    const u = ctx.rng.next();
    const one = (r: Rating): RatingPreview => {
      const { card: c } = scheduleWith(card, r, ctx, u);
      return { due: c.due, interval: c.interval };
    };
    return { 1: one(1), 2: one(2), 3: one(3), 4: one(4) };
  },
  adopt,
};
