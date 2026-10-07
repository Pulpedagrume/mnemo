import { z } from 'zod';
import { PresetSchema } from '../model/preset';
import type { Preset } from '../model/preset';
import { defaultSchedulerRegistry } from './registry';
import type { SchedulerRegistry } from './registry';
import { ParamValidationError } from './types';

export const PRESET_EXPORT_FORMAT = 'mnemo-preset/1';

/** Portable part of a preset: no id, timestamps or built-in flag. */
export type PresetDraft = Pick<Preset, 'name' | 'algorithm' | 'params' | 'limits' | 'behavior'>;

export interface PresetExport {
  format: typeof PRESET_EXPORT_FORMAT;
  preset: PresetDraft;
}

export interface PresetIssue {
  path: string;
  message: string;
}

export type PresetParseResult =
  | { ok: true; preset: PresetDraft; errors: [] }
  | { ok: false; preset?: undefined; errors: PresetIssue[] };

const DraftSchema = PresetSchema.pick({
  name: true,
  algorithm: true,
  params: true,
  limits: true,
  behavior: true,
});

const ExportSchema = z.object({
  format: z.literal(PRESET_EXPORT_FORMAT),
  preset: DraftSchema,
});

/** JSON-serializable export of a preset (shareable file). */
export function exportPreset(preset: Preset): PresetExport {
  return {
    format: PRESET_EXPORT_FORMAT,
    preset: {
      name: preset.name,
      algorithm: preset.algorithm,
      params: JSON.parse(JSON.stringify(preset.params)) as Record<string, unknown>,
      limits: { ...preset.limits },
      behavior: { ...preset.behavior },
    },
  };
}

/**
 * Validates an untrusted preset export: structure (PresetSchema), known algorithm and parameters
 * (scheduler.validate, which also fills missing parameters with defaults).
 */
export function parsePresetExport(
  input: unknown,
  registry: SchedulerRegistry = defaultSchedulerRegistry,
): PresetParseResult {
  const parsed = ExportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        path: i.path.map(String).join('.'),
        message: i.message,
      })),
    };
  }
  const draft = parsed.data.preset;
  const scheduler = registry.get(draft.algorithm);
  if (!scheduler) {
    return {
      ok: false,
      errors: [{ path: 'preset.algorithm', message: `Unknown algorithm "${draft.algorithm}"` }],
    };
  }
  try {
    const params = scheduler.validate(draft.params) as Record<string, unknown>;
    return { ok: true, preset: { ...draft, params }, errors: [] };
  } catch (error) {
    if (error instanceof ParamValidationError) {
      return {
        ok: false,
        errors: error.issues.map((i) => ({
          path: i.path ? `preset.params.${i.path}` : 'preset.params',
          message: i.message,
        })),
      };
    }
    throw error;
  }
}
