import { default_w } from 'ts-fsrs';
import { z } from 'zod';
import type { ParamSpec } from '../types';
import { durationsSchema } from '../util';

/** Default FSRS-6 weights shipped with ts-fsrs (offer them as "reset" in the UI). */
export const FSRS_DEFAULT_WEIGHTS: readonly number[] = Object.freeze([...default_w]);

export const FsrsParamsSchema = z.object({
  requestRetention: z.number().min(0.7).max(0.99).default(0.9),
  maximumInterval: z.number().int().min(1).max(36_500).default(36_500),
  enableFuzz: z.boolean().default(true),
  enableShortTerm: z.boolean().default(true),
  learningSteps: durationsSchema(0, 10, 365).default(['1m', '10m']),
  relearningSteps: durationsSchema(0, 10, 365).default(['10m']),
  w: z
    .array(z.number().min(0).max(100))
    .refine((w) => [17, 19, 21].includes(w.length), {
      message: 'FSRS weights must contain 17, 19 or 21 numbers',
    })
    .default(() => [...FSRS_DEFAULT_WEIGHTS]),
});
export type FsrsParams = z.infer<typeof FsrsParamsSchema>;

export const FSRS_PARAM_SPEC: ParamSpec<FsrsParams> = [
  {
    key: 'requestRetention',
    kind: 'number',
    min: 0.7,
    max: 0.99,
    step: 0.01,
    unit: 'ratio',
    label: { fr: 'Rétention souhaitée', en: 'Desired retention' },
    help: {
      fr: 'Probabilité visée de vous souvenir d’une carte au moment de la revoir. 0,90 = 90 % : un bon équilibre. Plus haut = beaucoup plus de révisions ; plus bas = moins de travail mais plus d’oublis.',
      en: 'Target probability of remembering a card when it comes back. 0.90 = 90%: a good balance. Higher means many more reviews; lower means less work but more forgetting.',
    },
  },
  {
    key: 'maximumInterval',
    kind: 'integer',
    min: 1,
    max: 36_500,
    unit: 'days',
    label: { fr: 'Intervalle maximal', en: 'Maximum interval' },
    help: {
      fr: 'Une carte ne sera jamais programmée plus loin que ce nombre de jours. Par défaut : 36 500 jours (100 ans).',
      en: 'A card is never scheduled further than this many days. Default: 36,500 days (100 years).',
    },
  },
  {
    key: 'learningSteps',
    kind: 'durations',
    minItems: 0,
    maxItems: 10,
    label: { fr: 'Étapes d’apprentissage', en: 'Learning steps' },
    help: {
      fr: 'Délais courts pour revoir une carte nouvelle le jour même (ex. 1m, 10m). Laissez vide pour laisser FSRS tout décider. Par défaut : 1m, 10m.',
      en: 'Short delays to see a new card again the same day (e.g. 1m, 10m). Leave empty to let FSRS decide everything. Default: 1m, 10m.',
    },
  },
  {
    key: 'relearningSteps',
    kind: 'durations',
    minItems: 0,
    maxItems: 10,
    label: { fr: 'Étapes de réapprentissage', en: 'Relearning steps' },
    help: {
      fr: 'Délais courts pour revoir une carte oubliée (« À revoir ») avant qu’elle reparte en révision. Par défaut : 10m.',
      en: 'Short delays to see a forgotten card (Again) again before it goes back to reviews. Default: 10m.',
    },
  },
  {
    key: 'enableFuzz',
    kind: 'boolean',
    label: { fr: 'Variation aléatoire', en: 'Fuzz' },
    help: {
      fr: 'Décale légèrement les intervalles pour que les cartes apprises le même jour ne reviennent pas toutes ensemble. Recommandé.',
      en: 'Slightly shifts intervals so cards learned on the same day do not all come back together. Recommended.',
    },
  },
  {
    key: 'enableShortTerm',
    kind: 'boolean',
    advanced: true,
    label: { fr: 'Révisions le jour même', en: 'Same-day reviews' },
    help: {
      fr: 'Si activé, les étapes d’apprentissage ci-dessus s’appliquent et FSRS tient compte des révisions du jour même. Si désactivé, une carte passe directement en révision (au plus tôt le lendemain).',
      en: 'When on, the learning steps above apply and FSRS accounts for same-day reviews. When off, a card goes straight to reviews (tomorrow at the earliest).',
    },
  },
  {
    key: 'w',
    kind: 'numberList',
    min: 0,
    max: 100,
    minItems: 17,
    maxItems: 21,
    advanced: true,
    label: { fr: 'Poids du modèle FSRS', en: 'FSRS model weights' },
    help: {
      fr: 'Les 21 paramètres du modèle de mémoire FSRS-6. Ne les modifiez que si vous les avez optimisés sur votre propre historique ; « Réinitialiser » remet les valeurs par défaut.',
      en: 'The 21 parameters of the FSRS-6 memory model. Only change them if you optimized them on your own history; “Reset” restores the defaults.',
    },
  },
];
