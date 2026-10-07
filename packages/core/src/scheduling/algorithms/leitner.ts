import { z } from 'zod';
import { blankMemory } from '../../model/card';
import type { CardMemory, Rating } from '../../model/card';
import type { ParamSpec, Scheduler, SchedulerContext } from '../types';
import {
  clamp,
  closestIndex,
  dueInDays,
  genericMemory,
  parseParams,
  toResult,
  withoutSchedulerData,
} from '../util';

export const LeitnerParamsSchema = z
  .object({
    boxes: z.number().int().min(2).max(20).default(5),
    boxIntervalsDays: z
      .array(z.number().int().min(1).max(36_500))
      .min(2)
      .max(20)
      .default([1, 2, 4, 8, 16]),
    onAgain: z.enum(['box1', 'back1']).default('box1'),
  })
  .superRefine((p, ctx) => {
    if (p.boxIntervalsDays.length !== p.boxes) {
      ctx.addIssue({
        code: 'custom',
        path: ['boxIntervalsDays'],
        message: `expected ${p.boxes} intervals (one per box), got ${p.boxIntervalsDays.length}`,
      });
    }
  });
export type LeitnerParams = z.infer<typeof LeitnerParamsSchema>;

const LEITNER_PARAM_SPEC: ParamSpec<LeitnerParams> = [
  {
    key: 'boxes',
    kind: 'integer',
    min: 2,
    max: 20,
    label: { fr: 'Nombre de boîtes', en: 'Number of boxes' },
    help: {
      fr: 'Nombre de boîtes du système de Leitner. Une carte bien sue avance d’une boîte ; chaque boîte a son propre délai. La liste des intervalles doit avoir autant de valeurs. Par défaut : 5.',
      en: 'Number of Leitner boxes. A known card moves up one box; each box has its own delay. The interval list must have as many values. Default: 5.',
    },
  },
  {
    key: 'boxIntervalsDays',
    kind: 'numberList',
    min: 1,
    max: 36_500,
    minItems: 2,
    maxItems: 20,
    unit: 'days',
    label: { fr: 'Intervalle de chaque boîte', en: 'Interval of each box' },
    help: {
      fr: 'Nombre de jours avant de revoir une carte selon sa boîte (boîte 1, boîte 2…). Par défaut : 1, 2, 4, 8 et 16 jours.',
      en: 'Days before seeing a card again, per box (box 1, box 2…). Default: 1, 2, 4, 8 and 16 days.',
    },
  },
  {
    key: 'onAgain',
    kind: 'enum',
    options: [
      { value: 'box1', label: { fr: 'Retour à la boîte 1', en: 'Back to box 1' } },
      { value: 'back1', label: { fr: 'Recule d’une boîte', en: 'Down one box' } },
    ],
    label: { fr: 'En cas d’oubli', en: 'When forgotten' },
    help: {
      fr: 'Ce qui arrive à une carte quand vous répondez « À revoir » : elle repart dans la première boîte (classique), ou recule seulement d’une boîte (plus indulgent).',
      en: 'What happens when you answer Again: the card goes back to the first box (classic), or only down one box (more forgiving).',
    },
  },
];

function nextBox(box: number, rating: Rating, p: LeitnerParams): number {
  const current = clamp(box, 1, p.boxes);
  switch (rating) {
    case 1:
      return p.onAgain === 'box1' ? 1 : Math.max(1, current - 1);
    case 2:
      return current;
    case 3:
      return Math.min(p.boxes, current + 1);
    case 4:
      return Math.min(p.boxes, current + 2);
  }
}

function boxInterval(box: number, p: LeitnerParams): number {
  return p.boxIntervalsDays[clamp(box, 1, p.boxes) - 1] ?? 1;
}

function schedule(card: CardMemory, rating: Rating, ctx: SchedulerContext<LeitnerParams>) {
  const p = ctx.params;
  const box = nextBox(card.box, rating, p);
  const interval = boxInterval(box, p);
  const lapsed = rating === 1 && card.state !== 'new';
  const rest = withoutSchedulerData(card);
  const after: CardMemory = {
    ...rest,
    state: 'review',
    box,
    step: 0,
    interval,
    due: dueInDays(interval, ctx),
    reps: card.reps + 1,
    lapses: card.lapses + (lapsed ? 1 : 0),
    lastReview: ctx.now,
  };
  return toResult(card, after);
}

/** Leitner boxes: each card sits in a box with a fixed review delay. */
export const leitnerScheduler: Scheduler<LeitnerParams> = {
  id: 'leitner',
  label: { fr: 'Boîtes de Leitner', en: 'Leitner boxes' },
  description: {
    fr: 'Chaque carte est rangée dans une boîte. « Bien » la fait avancer d’une boîte, « Facile » de deux, « Difficile » la laisse en place et « À revoir » la fait reculer. Chaque boîte a un délai fixe.',
    en: 'Each card sits in a box. Good moves it up one box, Easy two, Hard keeps it and Again moves it back. Each box has a fixed delay.',
  },
  paramSpec: LEITNER_PARAM_SPEC,
  defaults: LeitnerParamsSchema.parse({}),
  validate: (params) => parseParams('leitner', LeitnerParamsSchema, params),
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
    const p = ctx.params;
    if (card.state === 'new') return blankMemory(card.due);
    const base = genericMemory(card);
    // (Re)learning cards restart in box 1; others go to the box with the closest delay.
    const box = card.state === 'review' ? closestIndex(p.boxIntervalsDays, base.interval) + 1 : 1;
    const interval = boxInterval(box, p);
    return {
      ...base,
      state: 'review',
      box,
      interval,
      due: Math.min(base.due, dueInDays(interval, ctx)),
    };
  },
};
