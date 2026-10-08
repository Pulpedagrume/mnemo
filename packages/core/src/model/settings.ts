import { z } from 'zod';
import { LOCALES } from '../i18n';
import { IdSchema, TimestampSchema } from './common';

/** `calm`: light theme with soft pastel colours, rounder shapes and slower transitions. */
export const ThemeSchema = z.enum(['system', 'light', 'dark', 'calm']);
export type Theme = z.infer<typeof ThemeSchema>;

/** Upper bound of a mascot data URL (the app downsizes pictures to 256 px before storing them). */
export const MAX_MASCOT_IMAGE_CHARS = 300_000;

/** Raster images only: an SVG could carry scripts, and the value comes from a user file. */
export const MascotImageSchema = z
  .string()
  .max(MAX_MASCOT_IMAGE_CHARS)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);

/** Application settings with their defaults. Stored as key/value rows. */
export const AppSettingsSchema = z.object({
  locale: z.enum(LOCALES).default('fr'),
  theme: ThemeSchema.default('system'),
  /** IANA zone; empty string = use the device's zone. */
  timeZone: z.string().default(''),
  rolloverHour: z.number().int().min(0).max(23).default(4),
  defaultPresetId: IdSchema.optional(),
  textScale: z.number().min(0.75).max(2).default(1),
  showTimer: z.boolean().default(false),
  backupReminderDays: z.number().int().min(0).max(365).default(14),
  lastBackupAt: TimestampSchema.optional(),
  /** Personal mascot of the calm theme: a small raster image (data URL), '' = default mascot. */
  mascotImage: z.union([z.literal(''), MascotImageSchema]).default(''),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type SettingKey = keyof AppSettings;

export const SettingRowSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  updatedAt: TimestampSchema,
  /** HLC of the last write (sync: last writer wins per key). */
  hlc: z.string().optional(),
});
export type SettingRow = z.infer<typeof SettingRowSchema>;

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({});

/** Builds settings from stored rows; unknown keys are ignored and invalid values reset to default. */
export function settingsFromRows(rows: readonly SettingRow[]): AppSettings {
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const shape = AppSettingsSchema.shape;
  for (const key of Object.keys(shape) as SettingKey[]) {
    if (!(key in raw)) continue;
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as AppSettings;
}
