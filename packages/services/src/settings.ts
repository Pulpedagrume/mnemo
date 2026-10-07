import type { AppSettings } from '@mnemo/core';
import { AppSettingsSchema } from '@mnemo/core';
import type { ServiceContext } from './context';
import { loadSettings } from './context';

export function getSettings(ctx: ServiceContext): Promise<AppSettings> {
  return loadSettings(ctx.repo);
}

/** Validates and stores the given settings; returns the full, updated settings. */
export async function updateSettings(
  ctx: ServiceContext,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const shape = AppSettingsSchema.shape;
  const now = ctx.clock.now();
  await ctx.repo.transaction(async (tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in shape)) throw new Error(`Unknown setting: ${key}`);
      const parsed = shape[key as keyof AppSettings].parse(value);
      await tx.settings.put({ key, value: parsed, updatedAt: now });
    }
  });
  return loadSettings(ctx.repo);
}
