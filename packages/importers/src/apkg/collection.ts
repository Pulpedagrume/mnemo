import { parseModels, type AnkiModel } from './models';
import type { AnkiCardRow } from './scheduling';
import type { SqlDatabase } from './sql';

export interface AnkiDeck {
  id: string;
  /** Full path with `::`. */
  name: string;
  description: string;
  /** Filtered ("dynamic") deck. */
  dyn: boolean;
}

export interface AnkiNoteRow {
  id: string;
  guid: string;
  mid: string;
  tags: string[];
  fields: string[];
}

export interface AnkiCollection {
  /** Collection creation time (epoch seconds), origin of day-based due dates. */
  crt?: number;
  models: Map<string, AnkiModel>;
  decks: Map<string, AnkiDeck>;
  notes: AnkiNoteRow[];
  /** Cards by note id, sorted by ord. */
  cards: Map<string, AnkiCardRow[]>;
}

const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'bigint' ? String(v) : '';
const num = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(text(v));
  return Number.isFinite(n) ? n : 0;
};

function parseDecks(json: string): Map<string, AnkiDeck> {
  const out = new Map<string, AnkiDeck>();
  const raw: unknown = JSON.parse(json || '{}');
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const d = value as Record<string, unknown>;
    const name = text(d.name).split('\u001f').join('::').trim();
    if (name === '') continue;
    const id = text(d.id) || key;
    out.set(id, { id, name, description: text(d.desc), dyn: num(d.dyn) !== 0 });
  }
  return out;
}

/** Reads the parts of a legacy Anki collection (`collection.anki2` / `.anki21`) used by imports. */
export function readCollection(db: SqlDatabase): AnkiCollection {
  const col = db.all('SELECT crt, models, decks FROM col LIMIT 1')[0];
  if (!col) throw new Error('empty col table');
  const crt = num(col.crt);
  const notes = db.all('SELECT id, guid, mid, tags, flds FROM notes ORDER BY id').map((r) => ({
    id: text(r.id),
    guid: text(r.guid),
    mid: text(r.mid),
    tags: text(r.tags)
      .split(/\s+/)
      .filter((t) => t !== ''),
    fields: text(r.flds).split('\u001f'),
  }));
  const cards = new Map<string, AnkiCardRow[]>();
  for (const r of db.all('SELECT * FROM cards ORDER BY nid, ord')) {
    const card: AnkiCardRow = {
      nid: text(r.nid),
      did: text(r.did),
      odid: text(r.odid),
      ord: num(r.ord),
      type: num(r.type),
      queue: num(r.queue),
      due: num(r.due),
      ivl: num(r.ivl),
      factor: num(r.factor),
      reps: num(r.reps),
      lapses: num(r.lapses),
      data: text(r.data),
    };
    const list = cards.get(card.nid);
    if (list) list.push(card);
    else cards.set(card.nid, [card]);
  }
  const result: AnkiCollection = {
    models: parseModels(text(col.models) || '{}'),
    decks: parseDecks(text(col.decks)),
    notes,
    cards,
  };
  if (crt > 0) result.crt = crt;
  return result;
}
