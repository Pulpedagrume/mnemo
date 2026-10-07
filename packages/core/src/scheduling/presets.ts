import type { I18nString, Locale } from '../i18n';
import { BehaviorSchema, LimitsSchema } from '../model/preset';
import type { Behavior, Limits, Preset } from '../model/preset';
import { getScheduler } from './registry';

/** A built-in preset, before it gets an id and timestamps. `key` is stable across versions. */
export interface PresetTemplate {
  key: BuiltinPresetKey;
  name: I18nString;
  description: I18nString;
  algorithm: string;
  /** Complete, validated parameters of `algorithm`. */
  params: Record<string, unknown>;
  limits: Limits;
  behavior: Behavior;
}

export const BUILTIN_PRESET_KEYS = [
  'beginner',
  'standard',
  'exam30',
  'longTerm',
  'languages',
] as const;
export type BuiltinPresetKey = (typeof BUILTIN_PRESET_KEYS)[number];

/** Preset applied to new decks unless the user picks another one. */
export const DEFAULT_PRESET_KEY: BuiltinPresetKey = 'standard';

interface TemplateInput {
  key: BuiltinPresetKey;
  name: I18nString;
  description: I18nString;
  algorithm: string;
  params?: Record<string, unknown>;
  limits?: Partial<Limits>;
  behavior?: Partial<Behavior>;
}

function template(input: TemplateInput): PresetTemplate {
  const params = getScheduler(input.algorithm).validate(input.params ?? {}) as Record<
    string,
    unknown
  >;
  return {
    key: input.key,
    name: input.name,
    description: input.description,
    algorithm: input.algorithm,
    params,
    limits: LimitsSchema.parse(input.limits ?? {}),
    behavior: BehaviorSchema.parse(input.behavior ?? {}),
  };
}

/** Fresh copies of the built-in presets (callers may mutate them). */
export function builtinPresetTemplates(): PresetTemplate[] {
  return [
    template({
      key: 'beginner',
      name: { fr: 'Débutant (simple)', en: 'Beginner (simple)' },
      description: {
        fr: 'Une échelle de délais fixes, facile à comprendre (10 min, 1 jour, 3 jours, 1 semaine…), et 10 nouvelles cartes par jour.',
        en: 'A ladder of fixed delays that is easy to understand (10 min, 1 day, 3 days, 1 week…), and 10 new cards a day.',
      },
      algorithm: 'ladder',
      limits: { newPerDay: 10, reviewsPerDay: 100 },
    }),
    template({
      key: 'standard',
      name: { fr: 'Standard', en: 'Standard' },
      description: {
        fr: 'Le réglage conseillé : FSRS avec 90 % de rétention visée et 20 nouvelles cartes par jour.',
        en: 'The recommended setting: FSRS targeting 90% retention, with 20 new cards a day.',
      },
      algorithm: 'fsrs',
      params: { requestRetention: 0.9 },
      limits: { newPerDay: 20, reviewsPerDay: 200 },
    }),
    template({
      key: 'exam30',
      name: { fr: 'Examen dans 30 jours', en: 'Exam in 30 days' },
      description: {
        fr: 'Pour un examen proche : plus de nouvelles cartes chaque jour et aucun intervalle au-delà de 30 jours, pour tout revoir avant la date.',
        en: 'For an upcoming exam: more new cards each day and no interval beyond 30 days, so everything is reviewed before the date.',
      },
      algorithm: 'anki',
      params: {
        learningSteps: [1, 10, 60],
        maxInterval: 30,
        graduatingInterval: 1,
        easyInterval: 3,
        easyBonus: 1.2,
      },
      limits: { newPerDay: 40, reviewsPerDay: 400 },
    }),
    template({
      key: 'longTerm',
      name: { fr: 'Mémoire longue (FSRS 0,90)', en: 'Long-term memory (FSRS 0.90)' },
      description: {
        fr: 'Pour retenir sur des années : FSRS à 90 %, intervalles jusqu’à 100 ans et un rythme modéré de 10 nouvelles cartes par jour.',
        en: 'To remember for years: FSRS at 90%, intervals up to 100 years and a gentle pace of 10 new cards a day.',
      },
      algorithm: 'fsrs',
      params: { requestRetention: 0.9, maximumInterval: 36_500 },
      limits: { newPerDay: 10, reviewsPerDay: 200 },
    }),
    template({
      key: 'languages',
      name: { fr: 'Langues', en: 'Languages' },
      description: {
        fr: 'Pour le vocabulaire : FSRS un peu plus économe (88 %), 25 nouveaux mots par jour, mélangés aux révisions.',
        en: 'For vocabulary: slightly leaner FSRS (88%), 25 new words a day, mixed with reviews.',
      },
      algorithm: 'fsrs',
      params: { requestRetention: 0.88 },
      limits: { newPerDay: 25, reviewsPerDay: 250, mix: 'mixed' },
    }),
  ];
}

export function builtinPresetTemplate(key: BuiltinPresetKey): PresetTemplate {
  const found = builtinPresetTemplates().find((t) => t.key === key);
  if (!found) throw new Error(`Unknown built-in preset "${key}"`);
  return found;
}

/** Instantiates a built-in preset (name in the user's language). */
export function presetFromTemplate(
  t: PresetTemplate,
  opts: { id: string; now: number; locale: Locale },
): Preset {
  return {
    id: opts.id,
    name: t.name[opts.locale],
    algorithm: t.algorithm,
    params: { ...t.params },
    limits: { ...t.limits },
    behavior: { ...t.behavior },
    builtin: true,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
}
