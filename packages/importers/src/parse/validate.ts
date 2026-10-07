import type { I18nString } from '@mnemo/core';
import type { z } from 'zod';
import { COMMON_FIELD_DOCS, NOTE_TYPE_DOCS } from '../format/specs';
import { BUILTIN_NOTE_SCHEMAS, CustomNoteSchema, type ImportNote } from '../format/schema';
import type { NoteCtx } from './context';
import { t } from './issue';
import { canonicalKey, isBuiltinType, keysOfType } from './resolve';
import { closest, isPlainObject } from './text';

type ZodIssue = z.core.$ZodIssue;

export type CustomImportNote = z.infer<typeof CustomNoteSchema>;
export type BuiltinImportNote = Exclude<ImportNote, CustomImportNote>;

export function isCustomNote(note: ImportNote): note is CustomImportNote {
  return 'fields' in note;
}

function getAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let cur = value;
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === 'number') cur = cur[seg];
    else if (isPlainObject(cur) && typeof seg === 'string') cur = cur[seg];
    else return undefined;
  }
  return cur;
}

function fieldDoc(type: string, key: string): I18nString | undefined {
  const own = isBuiltinType(type)
    ? NOTE_TYPE_DOCS[type].fields.find((f) => f.key === key)
    : undefined;
  return (own ?? COMMON_FIELD_DOCS.find((f) => f.key === key))?.doc;
}

const EXPECTED: Readonly<Record<string, I18nString>> = {
  string: t('un texte', 'a text'),
  boolean: t('true ou false', 'true or false'),
  number: t('un nombre', 'a number'),
  int: t('un nombre entier', 'an integer'),
  array: t('une liste [ … ]', 'a list [ … ]'),
  object: t('un objet { … }', 'an object { … }'),
};

function label(path: readonly PropertyKey[]): string {
  return path
    .map((p) => (typeof p === 'number' ? `[${p}]` : String(p)))
    .join('.')
    .replace(/\.\[/g, '[');
}

function unknownKey(type: string, key: string, ctx: NoteCtx): void {
  const target =
    canonicalKey(type, key.replace(/^fields\./, '')) ?? closest(key, [...keysOfType(type)]);
  const allowed = [...keysOfType(type)].filter((k) => k !== 'type').join(', ');
  ctx.sink.error(
    'unknown_key',
    t(`Clé inconnue « ${key} » pour une note ${type}.`, `Unknown key "${key}" for a ${type} note.`),
    target === undefined
      ? t(`Supprimez-la. Clés acceptées : ${allowed}.`, `Remove it. Accepted keys: ${allowed}.`)
      : t(`Renommez-la en « ${target} ».`, `Rename it to "${target}".`),
    ctx.loc(
      [key],
      target === undefined
        ? {}
        : { suggestion: t(`« ${key} » → « ${target} »`, `"${key}" → "${target}"`) },
    ),
  );
}

function sizeIssue(
  issue: ZodIssue & { code: 'too_small' | 'too_big' },
  type: string,
  ctx: NoteCtx,
): void {
  const path = issue.path;
  const key = label(path);
  const bound = Number(issue.code === 'too_small' ? issue.minimum : issue.maximum);
  const small = issue.code === 'too_small';
  if (issue.origin === 'string') {
    ctx.sink.error(
      small ? 'missing_field' : 'invalid_value',
      small
        ? t(`« ${key} » est vide.`, `"${key}" is empty.`)
        : t(`« ${key} » est trop long.`, `"${key}" is too long.`),
      small
        ? t(`Remplissez « ${key} ».`, `Fill in "${key}".`)
        : t(
            `Raccourcissez « ${key} » (${bound} caractères max).`,
            `Shorten "${key}" (max ${bound} characters).`,
          ),
      ctx.loc(path),
    );
    return;
  }
  if (type === 'mcq' && path.length === 1 && path[0] === 'choices') {
    ctx.sink.error(
      'mcq_choice_count',
      t(`Un QCM doit avoir entre 2 et 8 propositions.`, `An MCQ must have 2 to 8 choices.`),
      t(
        small ? 'Ajoutez des propositions (au moins 2).' : 'Gardez au plus 8 propositions.',
        small ? 'Add choices (at least 2).' : 'Keep at most 8 choices.',
      ),
      ctx.loc(path),
    );
    return;
  }
  const what = issue.origin === 'array' ? t('élément(s)', 'item(s)') : t('', '');
  ctx.sink.error(
    'invalid_value',
    small
      ? t(
          `« ${key} » doit valoir au moins ${bound} ${what.fr}.`,
          `"${key}" must be at least ${bound} ${what.en}.`,
        )
      : t(
          `« ${key} » doit valoir au plus ${bound} ${what.fr}.`,
          `"${key}" must be at most ${bound} ${what.en}.`,
        ),
    t(`Corrigez « ${key} ».`, `Fix "${key}".`),
    ctx.loc(path),
  );
}

function translate(
  issue: ZodIssue,
  note: Record<string, unknown>,
  type: string,
  ctx: NoteCtx,
): void {
  const path = issue.path;
  const key = label(path);
  switch (issue.code) {
    case 'unrecognized_keys':
      for (const k of issue.keys) unknownKey(type, label([...path, k]), ctx);
      return;
    case 'too_small':
    case 'too_big':
      sizeIssue(issue, type, ctx);
      return;
    case 'invalid_format':
      if (path[0] === 'uid') {
        ctx.sink.error(
          'invalid_uid',
          t(`uid « ${String(note.uid)} » invalide.`, `Invalid uid "${String(note.uid)}".`),
          t(
            'Un uid ne contient que lettres, chiffres et . _ : - (64 caractères max), ex. « eth-4-001 ».',
            'A uid only contains letters, digits and . _ : - (max 64 characters), e.g. "eth-4-001".',
          ),
          ctx.loc(path),
        );
        return;
      }
      break;
    case 'invalid_type':
      if (getAt(note, path) === undefined) {
        const doc = fieldDoc(type, String(path[path.length - 1]));
        ctx.sink.error(
          'missing_field',
          t(
            `Champ obligatoire « ${key} » manquant (note ${type}).`,
            `Missing required field "${key}" (${type} note).`,
          ),
          t(
            `Ajoutez « ${key} »${doc ? ` : ${doc.fr}` : ''}.`,
            `Add "${key}"${doc ? `: ${doc.en}` : ''}.`,
          ),
          ctx.loc(path),
        );
        return;
      }
      {
        const expected = EXPECTED[issue.expected] ?? t(issue.expected, issue.expected);
        ctx.sink.error(
          'invalid_value',
          t(`« ${key} » doit être ${expected.fr}.`, `"${key}" must be ${expected.en}.`),
          t(`Corrigez la valeur de « ${key} ».`, `Fix the value of "${key}".`),
          ctx.loc(path),
        );
      }
      return;
    default:
      break;
  }
  ctx.sink.error(
    'invalid_value',
    t(`Valeur invalide pour « ${key || 'note'} ».`, `Invalid value for "${key || 'note'}".`),
    t(
      `Vérifiez « ${key || 'note'} » : ${fieldDoc(type, String(path[0]))?.fr ?? 'voir la documentation du format'}.`,
      `Check "${key || 'note'}": ${fieldDoc(type, String(path[0]))?.en ?? 'see the format documentation'}.`,
    ),
    ctx.loc(path),
  );
}

/** Validates one resolved note against its type schema; issues are translated. */
export function validateNote(
  type: string,
  note: Record<string, unknown>,
  ctx: NoteCtx,
): ImportNote | undefined {
  const schema = isBuiltinType(type) ? BUILTIN_NOTE_SCHEMAS[type] : CustomNoteSchema;
  const result = schema.safeParse(note);
  if (result.success) return result.data;
  const seen = new Set<string>();
  for (const issue of result.error.issues) {
    const id = `${issue.code}:${label(issue.path)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    translate(issue, note, type, ctx);
  }
  return undefined;
}
