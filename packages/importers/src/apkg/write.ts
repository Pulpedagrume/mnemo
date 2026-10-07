import JSZip from 'jszip';
import {
  ANSWER_SEPARATOR,
  clozeNumbers,
  generateCardOrds,
  getField,
  renderCard,
  type Note,
  type NoteType,
} from '@mnemo/core';
import { safeFileName } from '../export/buildDocument';
import { decodeEntities } from './html';
import { markdownToAnkiHtml } from './markdown';
import { guidFor } from './guid';
import {
  ANKI_SCHEMA_SQL,
  MODEL_IDS,
  confJson,
  dconfJson,
  deckJson,
  modelsJson,
  type ExportModelKind,
} from './schema';
import { sha1Hex } from './sha1';
import type { SqlEngine } from './sql';

export interface WriteApkgNote {
  note: Note;
  noteType: NoteType;
  /** Full deck path ("A::B"); '' → Anki's "Default" deck. */
  deckPath: string;
}

export interface WriteApkgInput {
  notes: readonly WriteApkgNote[];
  /** Media referenced by the notes (`media:<id>`), with their content. */
  media: readonly { id: string; name: string; bytes: Uint8Array }[];
  decks?: readonly { path: string; description?: string }[];
  /** Epoch ms used for ids and timestamps (from the injected clock). */
  now: number;
}

const ENTRY_DATE = new Date(Date.UTC(2020, 0, 1));
const DIRECT: ReadonlySet<string> = new Set(['basic', 'basic_reversed', 'cloze']);

/** What the export loses, one line per kind (shown to the user). */
export function apkgExportWarnings(notes: readonly WriteApkgNote[]): string[] {
  const converted = new Map<string, number>();
  let hints = 0;
  let explanations = 0;
  for (const { note, noteType } of notes) {
    if (!DIRECT.has(noteType.id))
      converted.set(noteType.name, (converted.get(noteType.name) ?? 0) + 1);
    if (note.hints.some((h) => h.trim() !== '')) hints++;
    if ((note.explanation ?? '').trim() !== '') explanations++;
  }
  const out = [...converted].map(
    ([name, n]) =>
      `${n} note(s) « ${name} » → Basic (one Anki note per card, rendered content; interactivity lost)`,
  );
  if (hints > 0) out.push(`${hints} note(s): hints are not exported`);
  if (explanations > 0)
    out.push(`${explanations} note(s): explanations are appended to the answer`);
  return out;
}

const plain = (html: string): string =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')).trim();

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

interface AnkiNoteOut {
  guid: string;
  model: ExportModelKind;
  fields: string[];
  ords: number[];
  deck: string;
  tags: string[];
}

const join = (...parts: string[]): string => parts.filter((p) => p.trim() !== '').join('\n\n');
const stripMarkers = (md: string): string => md.replace(/\[\[(type|hint):[^\]]*\]\]/g, '').trim();

function toAnkiNotes(item: WriteApkgNote, toHtml: (md: string) => string): AnkiNoteOut[] {
  const { note, noteType } = item;
  const base = { deck: item.deckPath, tags: note.tags };
  const guid = guidFor(note);
  const extra = getField(note.fields, 'extra');
  const explanation = note.explanation ?? '';
  if (noteType.id === 'basic' || noteType.id === 'basic_reversed') {
    const back = join(getField(note.fields, 'back'), extra, explanation);
    return [
      {
        ...base,
        guid,
        model: noteType.id,
        fields: [toHtml(getField(note.fields, 'front')), toHtml(back)],
        ords: noteType.id === 'basic' ? [0] : [0, 1],
      },
    ];
  }
  if (noteType.id === 'cloze') {
    const text = getField(note.fields, 'text');
    return [
      {
        ...base,
        guid,
        model: 'cloze',
        fields: [toHtml(text), toHtml(join(extra, explanation))],
        ords: clozeNumbers(text).map((n) => n - 1),
      },
    ];
  }
  return generateCardOrds(note, noteType).map((ord) => {
    const card = renderCard(note, noteType, ord);
    const sep = card.back.indexOf(ANSWER_SEPARATOR);
    const answer = sep >= 0 ? card.back.slice(sep + ANSWER_SEPARATOR.length) : card.back;
    return {
      ...base,
      guid: ord === 0 ? guid : `${guid}#${ord}`,
      model: 'basic' as const,
      fields: [
        toHtml(stripMarkers(card.front)),
        toHtml(join(stripMarkers(answer), card.extra ?? '', card.explanation ?? '')),
      ],
      ords: [0],
    };
  });
}

/**
 * Writes an Anki package (legacy `collection.anki2` schema, readable by every Anki version).
 * Basic, reversed and cloze notes use the standard Anki note types; other types become Basic
 * notes with their rendered content (see `apkgExportWarnings`). Cards are new (no scheduling).
 */
export async function writeApkg(input: WriteApkgInput, engine: SqlEngine): Promise<Uint8Array> {
  const now = Math.floor(input.now);
  const sec = Math.floor(now / 1000);
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const m of input.media) {
    const safe = safeFileName(m.name);
    const dot = safe.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, ''];
    let name = safe;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}-${i}${ext}`;
    used.add(name.toLowerCase());
    names.set(m.id, name);
  }
  const toHtml = (md: string) => markdownToAnkiHtml(md, (id) => names.get(id));
  const notes = input.notes.flatMap((n) => toAnkiNotes(n, toHtml));

  const deckIds = new Map<string, number>([['Default', 1]]);
  const descriptions = new Map((input.decks ?? []).map((d) => [d.path, d.description ?? '']));
  const addDeck = (path: string): number => {
    const parts = path.split('::');
    let id = 1;
    for (let i = 1; i <= parts.length; i++) {
      const name = parts.slice(0, i).join('::');
      id = deckIds.get(name) ?? 1_000_000_000 + fnv(name);
      deckIds.set(name, id);
    }
    return id;
  };
  const decksJson: Record<string, unknown> = {};

  const db = await engine.open();
  try {
    db.run(ANKI_SCHEMA_SQL);
    let cardId = now;
    notes.forEach((n, i) => {
      const nid = now + i;
      const did = n.deck.trim() === '' ? 1 : addDeck(n.deck);
      const sfld = plain(n.fields[0] ?? '');
      const csum = parseInt(sha1Hex(sfld).slice(0, 8), 16);
      const tags = n.tags.length > 0 ? ` ${n.tags.join(' ')} ` : '';
      db.run('INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, ?)', [
        nid,
        n.guid,
        MODEL_IDS[n.model],
        sec,
        tags,
        n.fields.join('\u001f'),
        sfld,
        csum,
        '',
      ]);
      for (const ord of n.ords)
        db.run('INSERT INTO cards VALUES (?, ?, ?, ?, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?)', [
          ++cardId,
          nid,
          did,
          ord,
          sec,
          i + 1,
          '',
        ]);
    });
    for (const [name, id] of deckIds)
      decksJson[String(id)] = deckJson(id, name, toHtml(descriptions.get(name) ?? ''), sec);
    const tags = Object.fromEntries([...new Set(notes.flatMap((n) => n.tags))].map((t) => [t, 0]));
    db.run('INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
      Math.floor(sec / 86_400) * 86_400,
      now,
      now,
      JSON.stringify(confJson()),
      JSON.stringify(modelsJson(sec)),
      JSON.stringify(decksJson),
      JSON.stringify(dconfJson(sec)),
      JSON.stringify(tags),
    ]);
    const zip = new JSZip();
    const options = { date: ENTRY_DATE, createFolders: false, binary: true };
    zip.file('collection.anki2', db.export(), options);
    const mediaMap: Record<string, string> = {};
    input.media.forEach((m, i) => {
      mediaMap[String(i)] = names.get(m.id) ?? m.name;
      zip.file(String(i), m.bytes, options);
    });
    zip.file('media', JSON.stringify(mediaMap), { date: ENTRY_DATE, createFolders: false });
    return await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  } finally {
    db.close();
  }
}
