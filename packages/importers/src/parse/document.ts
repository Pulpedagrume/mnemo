import { FORMAT_ID } from '@mnemo/core';
import { z } from 'zod';
import type { ImportParseResult } from '../api';
import {
  ImportDeckSchema,
  ImportDefaultsSchema,
  ImportMediaSchema,
  ImportMetaSchema,
  ImportNoteTypeDefSchema,
} from '../format/schema';
import { joinPath, t, type IssueSink } from './issue';
import { isPlainObject } from './text';

export interface DocInfo {
  meta?: ImportParseResult['meta'];
  defaults: z.infer<typeof ImportDefaultsSchema>;
  decks: ImportParseResult['decks'];
  media: ImportParseResult['media'];
  noteTypes: ImportParseResult['noteTypes'];
  continuation?: string;
  notes: unknown[];
}

const KNOWN_KEYS = [
  '$schema',
  'format',
  'meta',
  'defaults',
  'decks',
  'media',
  'noteTypes',
  'continuation',
  'notes',
];

function reportZod(sink: IssueSink, base: string, error: z.ZodError): void {
  for (const issue of error.issues) {
    const keys = issue.code === 'unrecognized_keys' ? issue.keys : [undefined];
    for (const key of keys) {
      const path = joinPath(base, key === undefined ? issue.path : [...issue.path, key]);
      sink.error(
        key === undefined ? 'invalid_value' : 'unknown_key',
        key === undefined
          ? t(
              `Valeur invalide pour « ${path} » : ${issue.message}.`,
              `Invalid value for "${path}": ${issue.message}.`,
            )
          : t(`Clé inconnue « ${path} ».`, `Unknown key "${path}".`),
        key === undefined
          ? t(
              `Corrigez « ${path} » (voir la documentation du format mnemo/1).`,
              `Fix "${path}" (see the mnemo/1 format documentation).`,
            )
          : t(`Supprimez « ${path} ».`, `Remove "${path}".`),
        { path },
      );
    }
  }
}

function parseList<T>(sink: IssueSink, key: string, value: unknown, schema: z.ZodType<T>): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    sink.error(
      'invalid_value',
      t(`« ${key} » doit être une liste [ … ].`, `"${key}" must be a list [ … ].`),
      t(`Écrivez « ${key} » sous forme de liste.`, `Write "${key}" as a list.`),
      { path: key },
    );
    return [];
  }
  const out: T[] = [];
  value.forEach((item, i) => {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
    else reportZod(sink, `${key}[${i}]`, r.error);
  });
  return out;
}

function parseOne<T>(
  sink: IssueSink,
  key: string,
  value: unknown,
  schema: z.ZodType<T>,
): T | undefined {
  if (value === undefined) return undefined;
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  reportZod(sink, key, r.error);
  return undefined;
}

function checkFormat(sink: IssueSink, root: Record<string, unknown> | undefined): void {
  const format = root?.format;
  if (format === FORMAT_ID) return;
  if (format === undefined) {
    sink.fix(
      'wrong_format_id',
      root === undefined
        ? t(
            'Liste de notes sans en-tête : lue comme un document mnemo/1.',
            'List of notes without header: read as a mnemo/1 document.',
          )
        : t(
            'Champ « format » absent : document lu comme mnemo/1.',
            'Missing "format" field: document read as mnemo/1.',
          ),
      t(
        'Écrivez { "format": "mnemo/1", "notes": [ … ] }.',
        'Write { "format": "mnemo/1", "notes": [ … ] }.',
      ),
      { path: 'format' },
    );
    return;
  }
  const shown = typeof format === 'string' ? format : JSON.stringify(format);
  sink.error(
    'wrong_format_id',
    t(
      `Format « ${shown} » non pris en charge (attendu « ${FORMAT_ID} »).`,
      `Unsupported format "${shown}" (expected "${FORMAT_ID}").`,
    ),
    t(`Écrivez "format": "${FORMAT_ID}".`, `Write "format": "${FORMAT_ID}".`),
    { path: 'format' },
  );
}

/** Validates the document envelope; notes are returned unvalidated. Undefined: unusable. */
export function readDocument(root: unknown, sink: IssueSink): DocInfo | undefined {
  if (Array.isArray(root)) {
    checkFormat(sink, undefined);
    return { defaults: {}, decks: [], media: [], noteTypes: [], notes: root };
  }
  if (!isPlainObject(root)) {
    sink.error(
      'not_a_document',
      t(
        'Le fichier n’est pas un document mnemo/1 (objet attendu).',
        'The file is not a mnemo/1 document (object expected).',
      ),
      t(
        'Le fichier doit être un objet avec "format": "mnemo/1" et "notes": [ … ].',
        'The file must be an object with "format": "mnemo/1" and "notes": [ … ].',
      ),
    );
    return undefined;
  }
  checkFormat(sink, root);
  for (const key of Object.keys(root)) {
    if (KNOWN_KEYS.includes(key)) continue;
    sink.fix(
      'unknown_key',
      t(`Clé inconnue « ${key} » ignorée.`, `Unknown key "${key}" ignored.`),
      t(
        `Supprimez « ${key} » ; clés acceptées : ${KNOWN_KEYS.join(', ')}.`,
        `Remove "${key}"; accepted keys: ${KNOWN_KEYS.join(', ')}.`,
      ),
      { path: key },
    );
  }
  const notes = root.notes;
  if (!Array.isArray(notes) || notes.length === 0) {
    sink.error(
      notes === undefined ? 'missing_field' : 'invalid_value',
      t(
        'Aucune note : « notes » doit être une liste non vide.',
        'No notes: "notes" must be a non-empty list.',
      ),
      t('Ajoutez "notes": [ { "type": "basic", … } ].', 'Add "notes": [ { "type": "basic", … } ].'),
      { path: 'notes' },
    );
    return undefined;
  }
  if (root.$schema !== undefined) parseOne(sink, '$schema', root.$schema, z.string());
  const continuation = parseOne(sink, 'continuation', root.continuation, z.string().nullable());
  const info: DocInfo = {
    defaults: parseOne(sink, 'defaults', root.defaults, ImportDefaultsSchema) ?? {},
    decks: parseList(sink, 'decks', root.decks, ImportDeckSchema),
    media: parseList(sink, 'media', root.media, ImportMediaSchema),
    noteTypes: parseList(sink, 'noteTypes', root.noteTypes, ImportNoteTypeDefSchema),
    notes,
  };
  const meta = parseOne(sink, 'meta', root.meta, ImportMetaSchema);
  if (meta !== undefined) info.meta = meta;
  if (typeof continuation === 'string' && continuation.trim() !== '')
    info.continuation = continuation.trim();
  return info;
}
