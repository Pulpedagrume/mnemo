import { fieldKey } from '@mnemo/core';
import type { ImportParseResult, ParseOptions } from '../api';
import type { BundleLimits, BundleMedia } from '../bundle/read';
import { safeFileName } from '../export/buildDocument';
import { parseImport } from '../parse/pipeline';
import type { ImportIssue, ImportReport } from '../report';
import { readCollection, type AnkiCollection, type AnkiNoteRow } from './collection';
import { ankiHtmlToMarkdown, decodeEntities } from './html';
import { uidFromGuid } from './guid';
import { apkgIssues } from './issues';
import { classifyModel, type ClassifiedModel } from './models';
import { collectScheduling, type ApkgScheduleEntry } from './scheduling';
import type { SqlEngine } from './sql';
import { readApkgArchive } from './zip';

export interface ReadApkgOptions extends Pick<ParseOptions, 'strict' | 'maxNotes'> {
  fileName?: string;
  /** Convert Anki scheduling (intervals, ease, due dates). Default: false, cards start new. */
  withScheduling?: boolean;
  limits?: Partial<BundleLimits>;
}

export interface ApkgParseResult extends ImportParseResult {
  /** Image files from the package, keyed by declared media id (`result.media[].id`). */
  mediaFiles: Map<string, BundleMedia & { name: string }>;
  /** Scheduling by note uid (only with `withScheduling`). */
  scheduling: Map<string, ApkgScheduleEntry[]>;
}

function emptyResult(issues: ImportIssue[]): ApkgParseResult {
  return {
    format: 'json',
    decks: [],
    media: [],
    noteTypes: [],
    notes: [],
    report: recount({ issues: [], counts: emptyCounts() }, issues),
    mediaFiles: new Map(),
    scheduling: new Map(),
  };
}

const emptyCounts = (): ImportReport['counts'] => ({
  notes: 0,
  valid: 0,
  invalid: 0,
  cards: 0,
  byType: {},
  errors: 0,
  warnings: 0,
  infos: 0,
});

/** Prepends package-level issues and recomputes the severity counters. */
function recount(report: ImportReport, extra: readonly ImportIssue[]): ImportReport {
  const issues = [...extra, ...report.issues];
  const count = (s: ImportIssue['severity']) => issues.filter((i) => i.severity === s).length;
  return {
    ...report,
    issues,
    counts: {
      ...report.counts,
      errors: count('error'),
      warnings: count('warning'),
      infos: count('info'),
    },
  };
}

/** Plain text of an HTML field (for typed answers). */
const plainText = (html: string): string =>
  decodeEntities(html.replace(/<br\s*\/?>|<\/div>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

interface Builder {
  col: AnkiCollection;
  models: Map<string, ClassifiedModel>;
  mediaIds: Map<string, string>;
  missingImages: Set<string>;
  sounds: Set<string>;
  soundNotes: number;
  keptHtmlNotes: number;
  styleNotes: number;
}

function mediaRef(
  b: Builder,
  available: ReadonlyMap<string, unknown>,
  name: string,
): string | undefined {
  // Anki stores names as typed, but some exporters URL-encode them (`a%20b.png`).
  let file = name;
  if (!available.has(file)) {
    try {
      file = decodeURIComponent(name);
    } catch {
      file = name;
    }
  }
  if (!available.has(file)) {
    b.missingImages.add(file);
    return undefined;
  }
  let id = b.mediaIds.get(file);
  if (id === undefined) {
    const base = safeFileName(file).slice(-64);
    id = base;
    const used = new Set(b.mediaIds.values());
    for (let i = 2; used.has(id); i++) id = `${i}-${base}`.slice(0, 64);
    b.mediaIds.set(file, id);
  }
  return `media:${id}`;
}

function deckOf(b: Builder, note: AnkiNoteRow): string {
  const card = b.col.cards.get(note.id)?.[0];
  if (!card) return '';
  const deck = b.col.decks.get(card.odid !== '' && card.odid !== '0' ? card.odid : card.did);
  return deck?.name ?? '';
}

function buildNote(
  b: Builder,
  note: AnkiNoteRow,
  available: ReadonlyMap<string, unknown>,
): Record<string, unknown> | undefined {
  const cm = b.models.get(note.mid);
  if (!cm) return undefined;
  const seen = { sound: false, kept: false, style: false };
  const md = (html: string | undefined): string => {
    const r = ankiHtmlToMarkdown(html ?? '', (src) => mediaRef(b, available, src));
    for (const s of r.sounds) b.sounds.add(s);
    seen.sound ||= r.sounds.length > 0;
    seen.kept ||= r.keptHtml;
    seen.style ||= r.droppedStyle;
    return r.text;
  };
  const f = note.fields;
  const out: Record<string, unknown> = { uid: uidFromGuid(note.guid) };
  switch (cm.kind) {
    case 'basic':
    case 'basic_reversed':
      Object.assign(out, { type: cm.kind, front: md(f[0]), back: md(f[1]) });
      break;
    case 'typed':
      Object.assign(out, { type: 'typed', front: md(f[0]), answer: plainText(f[1] ?? '') });
      break;
    case 'cloze': {
      const extra = f
        .slice(1)
        .map(md)
        .filter((s) => s !== '')
        .join('\n\n');
      Object.assign(out, { type: 'cloze', text: md(f[0]) }, extra === '' ? {} : { extra });
      break;
    }
    case 'custom': {
      const fields: Record<string, string> = {};
      cm.model.fields.forEach((name, i) => (fields[name] = md(f[i])));
      Object.assign(out, { type: `custom:${cm.customId ?? ''}`, fields });
      break;
    }
  }
  const deck = deckOf(b, note);
  if (deck !== '') out.deck = deck;
  if (note.tags.length > 0) out.tags = note.tags;
  if (seen.sound) b.soundNotes++;
  if (seen.kept) b.keptHtmlNotes++;
  if (seen.style) b.styleNotes++;
  return out;
}

/** Field names unique case-insensitively (Mnemo keys fields by lowercase name). */
function uniqueFields(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    let n = name;
    for (let i = 2; seen.has(fieldKey(n)); i++) n = `${name} ${i}`;
    seen.add(fieldKey(n));
    return n;
  });
}

/**
 * Reads an Anki package (`.apkg`, legacy `collection.anki2`/`.anki21` schema) and returns the
 * same result as the other formats: the collection is converted to a `mnemo/1` document which
 * goes through the regular validation pipeline. Media files are returned by declared id.
 */
export async function readApkg(
  bytes: Uint8Array,
  engine: SqlEngine,
  opts: ReadApkgOptions = {},
): Promise<ApkgParseResult> {
  const archive = await readApkgArchive(bytes, opts.limits);
  const issues = [...archive.issues];
  if (!archive.collection) return emptyResult(issues);
  let col: AnkiCollection;
  try {
    const db = await engine.open(archive.collection);
    try {
      col = readCollection(db);
    } finally {
      db.close();
    }
  } catch (err) {
    issues.push(apkgIssues.badCollection(err instanceof Error ? err.message : String(err)));
    return emptyResult(issues);
  }
  const b: Builder = {
    col,
    models: new Map(
      [...col.models].map(([id, m]) => [
        id,
        classifyModel({ ...m, fields: uniqueFields(m.fields) }),
      ]),
    ),
    mediaIds: new Map(),
    missingImages: new Set(),
    sounds: new Set(),
    soundNotes: 0,
    keptHtmlNotes: 0,
    styleNotes: 0,
  };
  const notes: Record<string, unknown>[] = [];
  const uids = new Map<string, string>();
  let orphans = 0;
  for (const note of col.notes) {
    const built = buildNote(b, note, archive.media);
    if (!built) orphans++;
    else {
      notes.push(built);
      uids.set(note.id, String(built.uid));
    }
  }
  const usedModels = new Set(col.notes.map((n) => n.mid));
  const customs = [...b.models.values()].filter(
    (m) => m.kind === 'custom' && usedModels.has(m.model.id),
  );
  for (const m of customs) {
    issues.push(apkgIssues.customModel(m.model.name, m.customId ?? ''));
    if (m.removedFilters.length > 0)
      issues.push(apkgIssues.templateFilters(m.model.name, m.removedFilters));
  }
  if (orphans > 0) issues.push(apkgIssues.emptyNote(orphans));
  if (b.soundNotes > 0) issues.push(apkgIssues.sounds(b.soundNotes, [...b.sounds]));
  if (b.missingImages.size > 0) issues.push(apkgIssues.missingImages([...b.missingImages]));
  if (b.keptHtmlNotes > 0) issues.push(apkgIssues.keptHtml(b.keptHtmlNotes));
  if (b.styleNotes > 0) issues.push(apkgIssues.droppedStyle(b.styleNotes));

  const usedDecks = new Set(notes.map((n) => n.deck));
  const decks = [...col.decks.values()]
    .filter((d) => !d.dyn && usedDecks.has(d.name))
    .map((d) => ({
      path: d.name,
      description: ankiHtmlToMarkdown(d.description, () => undefined).text,
    }))
    .filter((d) => d.description !== '');
  const mediaFiles = new Map<string, BundleMedia & { name: string }>();
  for (const [file, id] of b.mediaIds) {
    const m = archive.media.get(file);
    if (m) mediaFiles.set(id, { ...m, name: file });
  }
  const doc = {
    format: 'mnemo/1',
    meta: { generator: 'Anki (.apkg)' },
    ...(decks.length > 0 ? { decks } : {}),
    ...(mediaFiles.size > 0
      ? { media: [...mediaFiles].map(([id, m]) => ({ id, file: m.name })) }
      : {}),
    ...(customs.length > 0
      ? {
          noteTypes: customs.map((m) => ({
            id: m.customId,
            name: m.model.name,
            fields: m.model.fields,
            templates: m.templates,
            ...(m.model.css.trim() === '' ? {} : { css: m.model.css }),
          })),
        }
      : {}),
    notes,
  };
  if (notes.length === 0) {
    issues.push(apkgIssues.noCollection());
    return emptyResult(issues);
  }
  const text = JSON.stringify(doc);
  const parsed = parseImport(text, {
    format: 'json',
    fileName: opts.fileName ?? 'collection.apkg',
    maxBytes: Math.max(text.length * 4, 1),
    ...(opts.strict === undefined ? {} : { strict: opts.strict }),
    ...(opts.maxNotes === undefined ? {} : { maxNotes: opts.maxNotes }),
  });
  const schedule =
    opts.withScheduling === true
      ? collectScheduling(col.cards, col.crt, uids, issues)
      : new Map<string, ApkgScheduleEntry[]>();
  return { ...parsed, report: recount(parsed.report, issues), mediaFiles, scheduling: schedule };
}
