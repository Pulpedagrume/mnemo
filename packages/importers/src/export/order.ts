/** Stable key order of exported documents (JSON, YAML). */

export const DOCUMENT_KEY_ORDER: readonly string[] = [
  '$schema',
  'format',
  'meta',
  'defaults',
  'decks',
  'media',
  'noteTypes',
  'notes',
  'continuation',
];

/** type, uid, type-specific keys, then common keys. */
export const NOTE_KEY_ORDER: readonly string[] = [
  'type',
  'uid',
  // type-specific
  'front',
  'back',
  'statement',
  'text',
  'question',
  'answer',
  'caseSensitive',
  'ignoreAccents',
  'choices',
  'answers',
  'shuffle',
  'pairs',
  'distractors',
  'steps',
  'items',
  'ordered',
  'fields',
  // common
  'deck',
  'tags',
  'hint',
  'explanation',
  'extra',
  'source',
  'difficulty',
  'needsReview',
  'media',
];

const NESTED_ORDERS: Readonly<Record<string, readonly string[]>> = {
  choice: ['text', 'correct', 'explanation'],
  pair: ['left', 'right'],
  source: ['doc', 'page', 'section', 'url'],
  meta: ['title', 'language', 'source', 'generator'],
  defaults: ['deck', 'tags', 'type'],
  deck: ['path', 'description', 'preset'],
  media: ['id', 'file', 'url', 'data', 'alt'],
  noteType: ['id', 'name', 'fields', 'templates', 'css'],
  template: ['name', 'front', 'back'],
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Copy of `obj` with the keys of `order` first (in that order), then the others as they come. */
export function orderKeys(
  obj: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of order) if (obj[key] !== undefined) out[key] = obj[key];
  for (const [key, value] of Object.entries(obj))
    if (!(key in out) && value !== undefined) out[key] = value;
  return out;
}

const mapRecords = (value: unknown, fn: (r: Record<string, unknown>) => unknown): unknown =>
  Array.isArray(value) ? (value as unknown[]).map((v) => (isRecord(v) ? fn(v) : v)) : value;

/** Note with its keys (and nested choices, pairs, source) in the stable order. */
export function orderNote(note: Record<string, unknown>): Record<string, unknown> {
  const out = orderKeys(note, NOTE_KEY_ORDER);
  if (out.choices !== undefined)
    out.choices = mapRecords(out.choices, (c) => orderKeys(c, NESTED_ORDERS.choice ?? []));
  if (out.pairs !== undefined)
    out.pairs = mapRecords(out.pairs, (p) => orderKeys(p, NESTED_ORDERS.pair ?? []));
  if (isRecord(out.source)) out.source = orderKeys(out.source, NESTED_ORDERS.source ?? []);
  return out;
}

/** Whole document in the stable order (document keys, nested objects and notes). */
export function orderDocument(doc: Record<string, unknown>): Record<string, unknown> {
  const out = orderKeys(doc, DOCUMENT_KEY_ORDER);
  const nested = (key: string, orderName: string) => {
    const order = NESTED_ORDERS[orderName] ?? [];
    const value = out[key];
    if (isRecord(value)) out[key] = orderKeys(value, order);
    else if (Array.isArray(value)) out[key] = mapRecords(value, (r) => orderKeys(r, order));
  };
  nested('meta', 'meta');
  nested('defaults', 'defaults');
  nested('decks', 'deck');
  nested('media', 'media');
  nested('noteTypes', 'noteType');
  if (Array.isArray(out.noteTypes))
    out.noteTypes = mapRecords(out.noteTypes, (t) => ({
      ...t,
      templates: mapRecords(t.templates, (tpl) => orderKeys(tpl, NESTED_ORDERS.template ?? [])),
    }));
  out.notes = mapRecords(out.notes, orderNote);
  return out;
}
