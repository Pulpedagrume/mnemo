import { z } from 'zod';
import { blankMemory } from '../../model/card';
import type { CardMemory, CardState, Rating } from '../../model/card';
import { DAY_MS } from '../../time';
import type { ParamSpec, Scheduler, SchedulerContext } from '../types';
import {
  clamp,
  closestIndex,
  dueAfter,
  durationsMs,
  durationsSchema,
  genericMemory,
  parseParams,
  toResult,
  withoutSchedulerData,
} from '../util';

export const LadderParamsSchema = z
  .object({
    rungs: durationsSchema(1, 30).default(['10m', '1d', '3d', '1w', '2w', '1mo', '3mo', '6mo']),
    onAgain: z.enum(['rung0', 'back1', 'back2']).default('rung0'),
  })
  .superRefine((p, ctx) => {
    const ms = durationsMs(p.rungs);
    for (let i = 1; i < ms.length; i++) {
      if ((ms[i] ?? 0) < (ms[i - 1] ?? 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rungs', i],
          message: 'rungs must be in increasing order',
        });
        return;
      }
    }
  });
export type LadderParams = z.infer<typeof LadderParamsSchema>;

const LADDER_PARAM_SPEC: ParamSpec<LadderParams> = [
  {
    key: 'rungs',
    kind: 'durations',
    minItems: 1,
    maxItems: 30,
    label: { fr: 'Barreaux de l’échelle', en: 'Ladder rungs' },
    help: {
      fr: 'Délais successifs avant de revoir une carte, du plus court au plus long (m = minutes, h = heures, d ou j = jours, w = semaines, mo = mois). Chaque « Bien » fait monter d’un barreau. Par défaut : 10m, 1d, 3d, 1w, 2w, 1mo, 3mo, 6mo.',
      en: 'Successive delays before seeing a card again, shortest first (m = minutes, h = hours, d = days, w = weeks, mo = months). Each Good climbs one rung. Default: 10m, 1d, 3d, 1w, 2w, 1mo, 3mo, 6mo.',
    },
  },
  {
    key: 'onAgain',
    kind: 'enum',
    options: [
      { value: 'rung0', label: { fr: 'Retour en bas de l’échelle', en: 'Back to the bottom' } },
      { value: 'back1', label: { fr: 'Descend d’un barreau', en: 'Down one rung' } },
      { value: 'back2', label: { fr: 'Descend de deux barreaux', en: 'Down two rungs' } },
    ],
    label: { fr: 'En cas d’oubli', en: 'When forgotten' },
    help: {
      fr: 'Ce qui arrive quand vous répondez « À revoir » : la carte repart du premier barreau, ou descend seulement d’un ou deux barreaux (plus indulgent pour les cartes anciennes).',
      en: 'What happens when you answer Again: the card restarts from the first rung, or only goes down one or two rungs (gentler on old cards).',
    },
  },
];

function nextRung(card: CardMemory, rating: Rating, p: LadderParams, last: number): number {
  // A new card stands just below the first rung.
  const current = card.state === 'new' ? -1 : clamp(card.step, 0, last);
  switch (rating) {
    case 1:
      if (p.onAgain === 'rung0') return 0;
      return Math.max(0, current - (p.onAgain === 'back1' ? 1 : 2));
    case 2:
      return Math.max(0, current);
    case 3:
      return Math.min(last, current + 1);
    case 4:
      return Math.min(last, current + 2);
  }
}

function placeOnRung(
  rung: number,
  rungsMs: readonly number[],
  ctx: SchedulerContext<LadderParams>,
  wasReview: boolean,
): Pick<CardMemory, 'state' | 'step' | 'due' | 'interval'> {
  const { due, interval, dayBased } = dueAfter(rungsMs[rung] ?? DAY_MS, ctx);
  let state: CardState = 'review';
  if (!dayBased) state = wasReview ? 'relearning' : 'learning';
  return { state, step: rung, due, interval };
}

function schedule(card: CardMemory, rating: Rating, ctx: SchedulerContext<LadderParams>) {
  const rungsMs = durationsMs(ctx.params.rungs);
  const rung = nextRung(card, rating, ctx.params, rungsMs.length - 1);
  const lapsed = rating === 1 && card.state === 'review';
  const wasReview = card.state === 'review' || card.state === 'relearning';
  const rest = withoutSchedulerData(card);
  const after: CardMemory = {
    ...rest,
    ...placeOnRung(rung, rungsMs, ctx, wasReview && (lapsed || card.state === 'relearning')),
    reps: card.reps + 1,
    lapses: card.lapses + (lapsed ? 1 : 0),
    lastReview: ctx.now,
  };
  return toResult(card, after);
}

/** Fixed ladder of delays: each success climbs one rung. */
export const ladderScheduler: Scheduler<LadderParams> = {
  id: 'ladder',
  label: { fr: 'Échelle simple', en: 'Simple ladder' },
  description: {
    fr: 'Le plus simple : une liste fixe de délais (10 min, 1 jour, 3 jours, 1 semaine…). « Bien » fait monter d’un barreau, « Facile » de deux, « Difficile » reste sur place et « À revoir » fait redescendre.',
    en: 'The simplest: a fixed list of delays (10 min, 1 day, 3 days, 1 week…). Good climbs one rung, Easy two, Hard stays and Again goes back down.',
  },
  paramSpec: LADDER_PARAM_SPEC,
  defaults: LadderParamsSchema.parse({}),
  validate: (params) => parseParams('ladder', LadderParamsSchema, params),
  initCard: ({ now }) => blankMemory(now),
  schedule,
  preview(card, ctx) {
    const one = (r: Rating) => {
      const { card: c } = schedule(card, r, ctx);
      return { due: c.due, interval: c.interval };
    };
    return { 1: one(1), 2: one(2), 3: one(3), 4: one(4) };
  },
  adopt(card, ctx) {
    if (card.state === 'new') return blankMemory(card.due);
    const base = genericMemory(card);
    const rungsMs = durationsMs(ctx.params.rungs);
    const rung = closestIndex(rungsMs, base.interval * DAY_MS);
    const placed = placeOnRung(rung, rungsMs, ctx, card.state === 'relearning');
    // Keep the existing due date unless it lies beyond the new rung's delay.
    return { ...base, ...placed, due: Math.min(base.due, placed.due) };
  },
};
