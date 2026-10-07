import type { Card, Deck, Id, Locale, Preset } from '@mnemo/core';
import {
  DEFAULT_PRESET_KEY,
  PresetSchema,
  builtinNoteTypeRecords,
  builtinPresetTemplate,
  builtinPresetTemplates,
  cardMemory,
  convertCards,
  forecastDue,
  getScheduler,
  indexDecks,
  makeSchedulerContext,
  presetFromTemplate,
  resolveDeckPreset,
  type DueForecast,
} from '@mnemo/core';
import type { Stores } from '@mnemo/storage';
import type { ServiceContext } from './context';
import { loadCalendar, loadSettings } from './context';

export class PresetError extends Error {
  constructor(
    readonly code: 'not-found' | 'invalid' | 'is-default',
    message: string,
  ) {
    super(message);
    this.name = 'PresetError';
  }
}

const DEFAULT_DECK_NAME: Record<Locale, string> = { fr: 'Par défaut', en: 'Default' };

/**
 * Seeds a fresh collection: built-in note types (missing ones are added on upgrade), built-in
 * presets with "Standard" as default, and a first deck. Idempotent.
 */
export async function ensureCollection(ctx: ServiceContext, locale: Locale): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const now = ctx.clock.now();
    const existingTypes = new Set((await tx.noteTypes.list()).map((n) => n.id));
    const missing = builtinNoteTypeRecords(now).filter((n) => !existingTypes.has(n.id));
    if (missing.length > 0) await tx.noteTypes.putMany(missing);

    if ((await tx.presets.count()) === 0) {
      let defaultId: Id | undefined;
      for (const template of builtinPresetTemplates()) {
        const preset = presetFromTemplate(template, { id: ctx.newId(), now, locale });
        await tx.presets.put(preset);
        if (template.key === DEFAULT_PRESET_KEY) defaultId = preset.id;
      }
      if (defaultId)
        await tx.settings.put({ key: 'defaultPresetId', value: defaultId, updatedAt: now });
    }

    if ((await tx.decks.count()) === 0) {
      await tx.decks.put({
        id: ctx.newId(),
        name: DEFAULT_DECK_NAME[locale],
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

/** The preset used by root decks without their own preset. Recreated if it went missing. */
export async function getDefaultPreset(
  ctx: ServiceContext,
  stores: Stores = ctx.repo,
): Promise<Preset> {
  const settings = await loadSettings(stores);
  if (settings.defaultPresetId) {
    const preset = await stores.presets.get(settings.defaultPresetId);
    if (preset) return preset;
  }
  const any = (await stores.presets.list())[0];
  if (any) return any;
  const now = ctx.clock.now();
  const preset = presetFromTemplate(builtinPresetTemplate(DEFAULT_PRESET_KEY), {
    id: ctx.newId(),
    now,
    locale: settings.locale,
  });
  await stores.presets.put(preset);
  return preset;
}

export async function listPresets(ctx: ServiceContext): Promise<Preset[]> {
  return (await ctx.repo.presets.list()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolver of each deck's effective preset (own, inherited, or default). */
export async function presetResolver(
  ctx: ServiceContext,
  stores: Stores = ctx.repo,
): Promise<{ decks: Deck[]; presetFor: (deckId: Id) => Preset; defaultPreset: Preset }> {
  const decks = await stores.decks.list();
  const presets = new Map((await stores.presets.list()).map((p) => [p.id, p] as const));
  const defaultPreset = await getDefaultPreset(ctx, stores);
  const index = indexDecks(decks);
  const cache = new Map<Id, Preset>();
  return {
    decks,
    defaultPreset,
    presetFor(deckId) {
      let p = cache.get(deckId);
      if (!p) {
        p = resolveDeckPreset(deckId, index, presets, defaultPreset);
        cache.set(deckId, p);
      }
      return p;
    },
  };
}

/** Validates a preset (schema and the scheduler's parameters) and returns it with full params. */
export function validatePreset(preset: Preset): Preset {
  const parsed = PresetSchema.safeParse(preset);
  if (!parsed.success) throw new PresetError('invalid', parsed.error.message);
  try {
    const params = getScheduler(preset.algorithm).validate(preset.params) as Record<
      string,
      unknown
    >;
    return { ...parsed.data, params };
  } catch (e) {
    throw new PresetError('invalid', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Saves a preset. Changing the algorithm must go through `changePresetAlgorithm`, which also
 * converts the cards.
 */
export async function savePreset(ctx: ServiceContext, preset: Preset): Promise<Preset> {
  const valid = validatePreset({ ...preset, updatedAt: ctx.clock.now() });
  await ctx.repo.presets.put(valid);
  return valid;
}

/** Copies a preset (or the default one) under a new name. */
export async function duplicatePreset(
  ctx: ServiceContext,
  sourceId: Id,
  name: string,
): Promise<Preset> {
  const source = await ctx.repo.presets.get(sourceId);
  if (!source) throw new PresetError('not-found', `Preset ${sourceId} not found`);
  const now = ctx.clock.now();
  const copy: Preset = {
    ...source,
    params: { ...source.params },
    limits: { ...source.limits },
    behavior: { ...source.behavior },
    id: ctx.newId(),
    name,
    createdAt: now,
    updatedAt: now,
  };
  delete copy.builtin;
  delete copy.deletedAt;
  await ctx.repo.presets.put(copy);
  return copy;
}

/** Deletes a preset; decks using it fall back to their parent's (or the default) preset. */
export async function deletePreset(ctx: ServiceContext, id: Id): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const preset = await tx.presets.get(id);
    if (!preset) throw new PresetError('not-found', `Preset ${id} not found`);
    if ((await getDefaultPreset(ctx, tx)).id === id)
      throw new PresetError('is-default', 'The default preset cannot be deleted');
    const now = ctx.clock.now();
    for (const deck of await tx.decks.list()) {
      if (deck.presetId !== id) continue;
      const updated = { ...deck, updatedAt: now };
      delete updated.presetId;
      await tx.decks.put(updated);
    }
    await tx.presets.put({ ...preset, deletedAt: now, updatedAt: now });
  });
}

export async function setDefaultPreset(ctx: ServiceContext, id: Id): Promise<void> {
  if (!(await ctx.repo.presets.get(id)))
    throw new PresetError('not-found', `Preset ${id} not found`);
  await ctx.repo.settings.put({ key: 'defaultPresetId', value: id, updatedAt: ctx.clock.now() });
}

/** Non-deleted cards whose deck currently resolves to `presetId`. */
async function cardsUsingPreset(
  ctx: ServiceContext,
  stores: Stores,
  presetId: Id,
): Promise<Card[]> {
  const { decks, presetFor } = await presetResolver(ctx, stores);
  const deckIds = decks.filter((d) => presetFor(d.id).id === presetId).map((d) => d.id);
  return deckIds.length ? stores.cards.byDeck(deckIds) : [];
}

export interface AlgorithmChangePreview {
  cards: number;
  before: DueForecast;
  after: DueForecast;
}

async function convertedCards(
  ctx: ServiceContext,
  stores: Stores,
  preset: Preset,
  algorithm: string,
  params: unknown,
) {
  const from = getScheduler(preset.algorithm);
  const to = getScheduler(algorithm);
  const validParams: unknown = to.validate(params);
  const calendar = await loadCalendar(ctx, stores);
  const now = ctx.clock.now();
  const cards = await cardsUsingPreset(ctx, stores, preset.id);
  const sctx = makeSchedulerContext({ now, params: validParams, rng: ctx.rng, calendar });
  const converted = convertCards(cards.map(cardMemory), from, to, sctx);
  return { cards, converted, calendar, now, validParams };
}

/** Effect of switching a preset to another algorithm, shown before confirming. */
export async function previewAlgorithmChange(
  ctx: ServiceContext,
  presetId: Id,
  algorithm: string,
  params?: unknown,
): Promise<AlgorithmChangePreview> {
  const preset = await ctx.repo.presets.get(presetId);
  if (!preset) throw new PresetError('not-found', `Preset ${presetId} not found`);
  const { cards, converted, calendar, now } = await convertedCards(
    ctx,
    ctx.repo,
    preset,
    algorithm,
    params ?? {},
  );
  return {
    cards: cards.length,
    before: forecastDue(cards, calendar, now),
    after: forecastDue(converted, calendar, now),
  };
}

/** Switches a preset's algorithm and converts every card that uses it, atomically. */
export async function changePresetAlgorithm(
  ctx: ServiceContext,
  presetId: Id,
  algorithm: string,
  params?: unknown,
): Promise<Preset> {
  return ctx.repo.transaction(async (tx) => {
    const preset = await tx.presets.get(presetId);
    if (!preset) throw new PresetError('not-found', `Preset ${presetId} not found`);
    const { cards, converted, now, validParams } = await convertedCards(
      ctx,
      tx,
      preset,
      algorithm,
      params ?? {},
    );
    await tx.cards.putMany(
      cards.map((card, i) => {
        const memory = converted[i] ?? cardMemory(card);
        const next: Card = { ...card, ...memory, updatedAt: now };
        if (memory.schedulerData === undefined) delete next.schedulerData;
        if (memory.lastReview === undefined) delete next.lastReview;
        return next;
      }),
    );
    const updated = {
      ...preset,
      algorithm,
      params: validParams as Record<string, unknown>,
      updatedAt: now,
    };
    await tx.presets.put(updated);
    return updated;
  });
}
