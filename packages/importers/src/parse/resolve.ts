import { FRONT_ALIAS_TYPES, KEY_ALIASES, TYPE_ALIASES } from '../format/aliases';
import {
  BUILTIN_NOTE_SCHEMAS,
  CustomNoteSchema,
  IMPORT_NOTE_TYPES,
  type ImportNoteType,
} from '../format/schema';
import type { NoteCtx } from './context';
import { t } from './issue';
import { closest, foldName, isPlainObject } from './text';
import { normalizeCompactMcq } from './resolve-mcq';

const CUSTOM_RE = /^custom:/;

export function isBuiltinType(type: string): type is ImportNoteType {
  return (IMPORT_NOTE_TYPES as readonly string[]).includes(type);
}

/** Canonical keys accepted for a note type. */
export function keysOfType(type: string): ReadonlySet<string> {
  const schema = isBuiltinType(type) ? BUILTIN_NOTE_SCHEMAS[type] : CustomNoteSchema;
  return new Set(Object.keys(schema.shape));
}

/**
 * Type-aware alias resolution of a note key: `question`/`q`/`recto` mean `front` for
 * basic/basic_reversed/typed, `question` for mcq/ordering/list/matching and `statement` for
 * truefalse; `back`/`réponse` mean `answer` for typed and truefalse. Undefined: no mapping.
 */
export function canonicalKey(type: string, key: string): string | undefined {
  const keys = keysOfType(type);
  if (keys.has(key)) return key;
  const lc = key.trim().toLowerCase();
  if (keys.has(lc)) return lc;
  let cand = KEY_ALIASES[lc] ?? KEY_ALIASES[foldName(lc)] ?? lc;
  if (cand === 'front' || lc === 'question') {
    if (FRONT_ALIAS_TYPES.includes(type)) cand = 'front';
    else if (keys.has('question')) cand = 'question';
    else if (type === 'truefalse') cand = 'statement';
  } else if (cand === 'back' || cand === 'answer') {
    if (type === 'typed' || type === 'truefalse') cand = 'answer';
    else if (keys.has('back')) cand = 'back';
  }
  return keys.has(cand) ? cand : undefined;
}

const BOOLEAN_WORDS: Readonly<Record<string, boolean>> = {
  true: true,
  vrai: true,
  oui: true,
  yes: true,
  v: true,
  false: false,
  faux: false,
  non: false,
  no: false,
  f: false,
};

/** `answer: "vrai"` → `true` for true/false notes (alias warning). */
function normalizeBooleanAnswer(out: Record<string, unknown>, ctx: NoteCtx): void {
  if (typeof out.answer !== 'string' || ctx.sink.strict) return;
  const value = BOOLEAN_WORDS[foldName(out.answer)];
  if (value === undefined) return;
  ctx.sink.warn(
    'alias',
    t(
      `Réponse « ${out.answer} » interprétée comme ${String(value)}.`,
      `Answer "${out.answer}" interpreted as ${String(value)}.`,
    ),
    t(
      'Écrivez answer: true ou answer: false (sans guillemets).',
      'Write answer: true or answer: false (without quotes).',
    ),
    ctx.loc(['answer'], {
      suggestion: t(`« ${out.answer} » → ${String(value)}`, `"${out.answer}" → ${String(value)}`),
    }),
  );
  out.answer = value;
}

/** Canonical note type, or undefined (error reported). */
function resolveType(value: unknown, ctx: NoteCtx): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    ctx.sink.error(
      value === undefined ? 'missing_field' : 'unknown_type',
      t('Type de note absent ou vide.', 'Missing or empty note type.'),
      t(
        `Ajoutez « type » parmi : ${IMPORT_NOTE_TYPES.join(', ')}.`,
        `Add "type", one of: ${IMPORT_NOTE_TYPES.join(', ')}.`,
      ),
      ctx.loc(['type']),
    );
    return undefined;
  }
  if (isBuiltinType(value) || CUSTOM_RE.test(value)) return value;
  const lc = foldName(value);
  const target = isBuiltinType(lc) ? lc : (TYPE_ALIASES[lc] ?? TYPE_ALIASES[value.toLowerCase()]);
  if (target !== undefined) {
    const suggestion = t(`type « ${value} » → « ${target} »`, `type "${value}" → "${target}"`);
    if (ctx.sink.strict) {
      ctx.sink.error(
        'unknown_type',
        t(`Type de note inconnu « ${value} ».`, `Unknown note type "${value}".`),
        t(`Utilisez le type « ${target} ».`, `Use the type "${target}".`),
        ctx.loc(['type'], { suggestion }),
      );
      return undefined;
    }
    ctx.sink.warn(
      'alias',
      t(
        `Type « ${value} » interprété comme « ${target} ».`,
        `Type "${value}" interpreted as "${target}".`,
      ),
      t(`Écrivez directement « ${target} ».`, `Write "${target}" directly.`),
      ctx.loc(['type'], { suggestion }),
    );
    return target;
  }
  const near = closest(lc, [...IMPORT_NOTE_TYPES, ...Object.keys(TYPE_ALIASES)]);
  const guess = near === undefined ? undefined : (TYPE_ALIASES[near] ?? near);
  ctx.sink.error(
    'unknown_type',
    t(`Type de note inconnu « ${value} ».`, `Unknown note type "${value}".`),
    guess === undefined
      ? t(
          `Utilisez un type parmi : ${IMPORT_NOTE_TYPES.join(', ')} (ou custom:<id>).`,
          `Use one of: ${IMPORT_NOTE_TYPES.join(', ')} (or custom:<id>).`,
        )
      : t(`Vouliez-vous dire « ${guess} » ?`, `Did you mean "${guess}"?`),
    ctx.loc(
      ['type'],
      guess === undefined ? {} : { suggestion: t(`type → « ${guess} »`, `type → "${guess}"`) },
    ),
  );
  return undefined;
}

function aliasKey(
  ctx: NoteCtx,
  raw: Record<string, unknown>,
  out: Record<string, unknown>,
  shown: string,
  target: string,
  value: unknown,
): void {
  if (target in out || target in raw) {
    // Conflict with an existing canonical key: keep the alias as is (reported as unknown key).
    out[shown] = value;
    return;
  }
  out[target] = value;
  ctx.sink.warn(
    'alias',
    t(
      `Clé « ${shown} » interprétée comme « ${target} ».`,
      `Key "${shown}" interpreted as "${target}".`,
    ),
    t(`Écrivez directement « ${target} ».`, `Write "${target}" directly.`),
    ctx.loc([target], {
      suggestion: t(`« ${shown} » → « ${target} »`, `"${shown}" → "${target}"`),
    }),
  );
}

/**
 * Resolves the type and key aliases of a raw note (tolerant mode) and normalizes the compact MCQ
 * variant. Returns undefined when the note cannot be typed (error reported).
 */
export function resolveNote(
  raw: unknown,
  ctx: NoteCtx,
  defaultType: string | undefined,
): { type: string; note: Record<string, unknown> } | undefined {
  if (!isPlainObject(raw)) {
    ctx.sink.error(
      'invalid_value',
      t('Chaque note doit être un objet { … }.', 'Each note must be an object { … }.'),
      t(
        'Écrivez la note sous la forme { "type": "basic", "front": "…", "back": "…" }.',
        'Write the note as { "type": "basic", "front": "…", "back": "…" }.',
      ),
      ctx.loc(),
    );
    return undefined;
  }
  if (typeof raw.uid === 'string') ctx.uid = raw.uid;
  const type = resolveType(raw.type ?? defaultType, ctx);
  if (type === undefined) return undefined;
  const out: Record<string, unknown> = { type };
  const entries = Object.entries(raw).filter(([k]) => k !== 'type');
  const custom = CUSTOM_RE.test(type);
  for (const [key, value] of entries) {
    if (key === 'fields' && !custom && isPlainObject(value) && !ctx.sink.strict) {
      for (const [inner, innerValue] of Object.entries(value)) {
        const target = canonicalKey(type, inner);
        if (target === undefined) out[`fields.${inner}`] = innerValue;
        else aliasKey(ctx, raw, out, `fields.${inner}`, target, innerValue);
      }
      continue;
    }
    const target = canonicalKey(type, key);
    if (target === key || target === undefined || ctx.sink.strict) out[key] = value;
    else aliasKey(ctx, raw, out, key, target, value);
  }
  if (type === 'mcq') normalizeCompactMcq(out, ctx);
  if (type === 'truefalse') normalizeBooleanAnswer(out, ctx);
  return { type, note: out };
}
