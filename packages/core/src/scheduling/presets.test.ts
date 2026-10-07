import { describe, expect, it } from 'vitest';
import { PresetSchema } from '../model/preset';
import { createSchedulerRegistry, getScheduler } from './registry';
import { exportPreset, parsePresetExport, PRESET_EXPORT_FORMAT } from './presetIo';
import {
  BUILTIN_PRESET_KEYS,
  builtinPresetTemplate,
  builtinPresetTemplates,
  DEFAULT_PRESET_KEY,
  presetFromTemplate,
} from './presets';
import type { BuiltinPresetKey } from './presets';
import { T0 } from './test/helpers';

describe('built-in presets', () => {
  const templates = builtinPresetTemplates();

  it('has the five expected presets with valid params', () => {
    expect(templates.map((t) => t.key)).toEqual([...BUILTIN_PRESET_KEYS]);
    for (const t of templates) {
      expect(getScheduler(t.algorithm).validate(t.params)).toEqual(t.params);
      expect(t.name.fr).not.toBe('');
      expect(t.description.en).not.toBe('');
    }
  });

  it('matches the documented settings', () => {
    const byKey = (k: BuiltinPresetKey) => builtinPresetTemplate(k);
    expect(DEFAULT_PRESET_KEY).toBe('standard');
    expect(byKey('beginner')).toMatchObject({ algorithm: 'ladder', limits: { newPerDay: 10 } });
    expect(byKey('standard')).toMatchObject({
      algorithm: 'fsrs',
      params: { requestRetention: 0.9 },
      limits: { newPerDay: 20 },
    });
    expect(byKey('exam30')).toMatchObject({ algorithm: 'anki', params: { maxInterval: 30 } });
    expect(byKey('exam30').limits.newPerDay).toBeGreaterThan(20);
    expect(byKey('longTerm')).toMatchObject({ params: { maximumInterval: 36_500 } });
    expect(byKey('languages')).toMatchObject({
      params: { requestRetention: 0.88 },
      limits: { newPerDay: 25, mix: 'mixed' },
    });
    expect(byKey('standard').name).toEqual({ fr: 'Standard', en: 'Standard' });
    expect(() => builtinPresetTemplate('nope' as BuiltinPresetKey)).toThrow(/Unknown/);
  });

  it('instantiates valid Preset entities', () => {
    for (const t of templates) {
      const preset = presetFromTemplate(t, { id: `id-${t.key}`, now: T0, locale: 'fr' });
      expect(() => PresetSchema.parse(preset)).not.toThrow();
      expect(preset).toMatchObject({ builtin: true, createdAt: T0, name: t.name.fr });
    }
  });

  it('returns fresh copies', () => {
    const a = builtinPresetTemplates();
    a[0]!.limits.newPerDay = 999;
    expect(builtinPresetTemplates()[0]!.limits.newPerDay).toBe(10);
  });
});

describe('preset export / import', () => {
  const preset = presetFromTemplate(builtinPresetTemplate('languages'), {
    id: 'p1',
    now: T0,
    locale: 'en',
  });

  it('round-trips through JSON', () => {
    const exported = exportPreset(preset);
    expect(exported.format).toBe(PRESET_EXPORT_FORMAT);
    expect(exported.preset).not.toHaveProperty('id');
    const parsed = parsePresetExport(JSON.parse(JSON.stringify(exported)));
    expect(parsed).toEqual({
      ok: true,
      errors: [],
      preset: {
        name: 'Languages',
        algorithm: 'fsrs',
        params: preset.params,
        limits: preset.limits,
        behavior: preset.behavior,
      },
    });
  });

  it('fills missing params and limits with defaults', () => {
    const parsed = parsePresetExport({
      format: PRESET_EXPORT_FORMAT,
      preset: { name: 'Mine', algorithm: 'leitner', params: {}, limits: {}, behavior: {} },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.preset?.params).toEqual(getScheduler('leitner').defaults);
    expect(parsed.preset?.limits.newPerDay).toBe(20);
  });

  it('reports structural, algorithm and parameter errors', () => {
    expect(parsePresetExport({ format: 'other' }).errors.map((e) => e.path)).toContain('format');
    expect(parsePresetExport(null).ok).toBe(false);
    const base = { name: 'X', params: {}, limits: {}, behavior: {} };
    expect(
      parsePresetExport({ format: PRESET_EXPORT_FORMAT, preset: { ...base, algorithm: 'zzz' } })
        .errors,
    ).toEqual([{ path: 'preset.algorithm', message: 'Unknown algorithm "zzz"' }]);
    const bad = parsePresetExport({
      format: PRESET_EXPORT_FORMAT,
      preset: { ...base, algorithm: 'leitner', params: { boxes: 3 } },
    });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]?.path).toBe('preset.params.boxIntervalsDays');
  });

  it('uses the given registry and rethrows unexpected errors', () => {
    const registry = createSchedulerRegistry([
      {
        ...getScheduler('sm2'),
        id: 'boom',
        validate: () => {
          throw new Error('boom');
        },
      },
    ]);
    const input = {
      format: PRESET_EXPORT_FORMAT,
      preset: { name: 'X', algorithm: 'boom', params: {}, limits: {}, behavior: {} },
    };
    expect(() => parsePresetExport(input, registry)).toThrow('boom');
  });
});
