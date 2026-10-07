import { builtinNoteType, noteFingerprintInput } from '@mnemo/core';
import {
  DEFAULT_LIMITS,
  type ImportFormat,
  type ImportParseResult,
  type ParseOptions,
  type ParsedNote,
} from '../api';
import type { ImportIssue, ImportReport } from '../report';
import { extractFence, normalizeText } from './cleanup/text';
import { NoteCtx } from './context';
import { detectFormat } from './detect';
import { readDocument, type DocInfo } from './document';
import { parseFormat } from './formats';
import { IssueSink, t } from './issue';
import { normalizeDeck, splitTags, toParsedNote, type NormalizeEnv } from './normalize';
import { resolveNote } from './resolve';
import { sanitizeNote } from './sanitize';
import { checkNote } from './semantic';
import { isPlainObject, utf8Length } from './text';
import type { NoteLoc } from './types';
import { validateNote } from './validate';

function buildReport(
  issues: ImportIssue[],
  found: number,
  notes: readonly ParsedNote[],
): ImportReport {
  const byType: Record<string, number> = {};
  let cards = 0;
  for (const n of notes) {
    byType[n.noteTypeId] = (byType[n.noteTypeId] ?? 0) + 1;
    cards += n.cards;
  }
  const count = (s: ImportIssue['severity']): number =>
    issues.filter((i) => i.severity === s).length;
  return {
    issues,
    counts: {
      notes: found,
      valid: notes.length,
      invalid: found - notes.length,
      cards,
      byType,
      errors: count('error'),
      warnings: count('warning'),
      infos: count('info'),
    },
  };
}

function emptyResult(format: ImportFormat, sink: IssueSink): ImportParseResult {
  return {
    format,
    decks: [],
    media: [],
    noteTypes: [],
    notes: [],
    report: buildReport(sink.issues, 0, []),
  };
}

interface NoteRun {
  doc: DocInfo;
  env: NormalizeEnv;
  declaredMedia: ReadonlySet<string>;
  uids: Map<string, number>;
  fingerprints: Map<string, number>;
  /** Notes with errors already reported by the format parser (Markdown structure, CSV rows). */
  parserErrors: ReadonlySet<number>;
}

function processNote(
  raw: unknown,
  index: number,
  loc: NoteLoc | undefined,
  run: NoteRun,
  sink: IssueSink,
): ParsedNote | undefined {
  const ctx = new NoteCtx(sink, index, loc?.line, loc?.excerpt ?? safeExcerpt(raw));
  const resolved = resolveNote(raw, ctx, run.doc.defaults.type);
  if (!resolved) return undefined;
  const note = validateNote(resolved.type, sanitizeNote(resolved.note, ctx), ctx);
  if (!note) return undefined;
  const media = checkNote(note, ctx, run.declaredMedia);
  if (note.uid !== undefined) {
    const first = run.uids.get(note.uid);
    if (first === undefined) run.uids.set(note.uid, index);
    else {
      sink.error(
        'duplicate_uid',
        t(
          `uid « ${note.uid} » déjà utilisé par la note ${first + 1}.`,
          `uid "${note.uid}" already used by note ${first + 1}.`,
        ),
        t(
          'Donnez un uid unique à chaque note (ex. suffixe -002, -003…).',
          'Give each note a unique uid (e.g. suffix -002, -003…).',
        ),
        ctx.loc(['uid']),
      );
    }
  }
  if (ctx.hasErrors() || run.parserErrors.has(index)) return undefined;
  const parsed = toParsedNote(note, ctx, run.env, media);
  if (!parsed) return undefined;
  const type = builtinNoteType(parsed.noteTypeId);
  if (type) {
    const content =
      parsed.data === undefined
        ? { fields: parsed.fields }
        : { fields: parsed.fields, data: parsed.data };
    const key = `${parsed.deck}\u0001${noteFingerprintInput(content, type)}`;
    const first = run.fingerprints.get(key);
    if (first !== undefined) {
      sink.warn(
        'duplicate_note',
        t(
          `Doublon de la note ${first + 1} (même texte, même type, même paquet) : ignoré.`,
          `Duplicate of note ${first + 1} (same text, type and deck): skipped.`,
        ),
        t(
          'Supprimez le doublon ou reformulez la question.',
          'Remove the duplicate or rephrase the question.',
        ),
        ctx.loc(),
      );
      return undefined;
    }
    run.fingerprints.set(key, index);
  }
  return parsed;
}

function safeExcerpt(raw: unknown): string | undefined {
  try {
    const json = JSON.stringify(raw) as string | undefined;
    return json?.slice(0, 400);
  } catch {
    return undefined;
  }
}

function run(
  input: string,
  format: ImportFormat,
  options: ParseOptions,
  sink: IssueSink,
): ImportParseResult {
  const maxBytes = options.maxBytes ?? DEFAULT_LIMITS.maxBytes;
  const size = utf8Length(input);
  if (size > maxBytes) {
    sink.error(
      'file_too_large',
      t(
        `Fichier trop volumineux (${size} octets, maximum ${maxBytes}).`,
        `File too large (${size} bytes, maximum ${maxBytes}).`,
      ),
      t('Découpez le contenu en plusieurs fichiers.', 'Split the content into several files.'),
    );
    return emptyResult(format, sink);
  }
  const clean = extractFence(normalizeText(input, sink), sink, format);
  const out = parseFormat(format, clean.text, sink);
  const doc = out.root === undefined ? undefined : readDocument(out.root, sink);
  if (!doc) {
    if (out.truncated === true) reportTruncated(sink, 0, undefined);
    return emptyResult(format, sink);
  }
  const maxNotes = options.maxNotes ?? DEFAULT_LIMITS.maxNotes;
  let rawNotes = doc.notes;
  if (rawNotes.length > maxNotes) {
    sink.error(
      'too_many_notes',
      t(
        `Trop de notes (${rawNotes.length}) : seules les ${maxNotes} premières sont lues.`,
        `Too many notes (${rawNotes.length}): only the first ${maxNotes} are read.`,
      ),
      t('Découpez le fichier en plusieurs imports.', 'Split the file into several imports.'),
      { path: 'notes' },
    );
    rawNotes = rawNotes.slice(0, maxNotes);
  }
  const state: NoteRun = {
    doc,
    env: {
      defaultDeck: normalizeDeck(doc.defaults.deck ?? ''),
      defaultTags: splitTags(doc.defaults.tags),
      customTemplates: new Map(doc.noteTypes.map((nt) => [nt.id, nt.templates.length])),
    },
    declaredMedia: new Set(doc.media.map((m) => m.id)),
    uids: new Map(),
    fingerprints: new Map(),
    parserErrors: new Set(
      sink.issues.flatMap((i) =>
        i.severity === 'error' && i.noteIndex !== undefined ? [i.noteIndex] : [],
      ),
    ),
  };
  const notes: ParsedNote[] = [];
  rawNotes.forEach((raw, i) => {
    const loc = out.locs.length === doc.notes.length ? out.locs[i] : undefined;
    const withOffset =
      loc?.line === undefined ? loc : { ...loc, line: loc.line + clean.lineOffset };
    const parsed = processNote(raw, i, withOffset, state, sink);
    if (parsed) notes.push(parsed);
  });
  let truncated: ImportReport['truncated'];
  if (out.truncated === true) {
    const last = rawNotes[rawNotes.length - 1];
    const lastUid = isPlainObject(last) && typeof last.uid === 'string' ? last.uid : undefined;
    reportTruncated(sink, rawNotes.length, lastUid);
    truncated =
      lastUid === undefined
        ? { recovered: rawNotes.length }
        : { recovered: rawNotes.length, lastUid };
  }
  if (doc.continuation !== undefined) {
    sink.info(
      'continuation',
      t(
        `L’IA indique qu’il reste du contenu à générer : « ${doc.continuation} ».`,
        `The AI says more content remains: "${doc.continuation}".`,
      ),
      t(
        'Demandez à l’IA de continuer (prompt de continuation), puis importez la suite.',
        'Ask the AI to continue (continuation prompt), then import the rest.',
      ),
      { path: 'continuation' },
    );
  }
  const report = buildReport(sink.issues, rawNotes.length, notes);
  if (truncated) report.truncated = truncated;
  if (doc.continuation !== undefined) report.continuation = doc.continuation;
  const result: ImportParseResult = {
    format,
    decks: doc.decks.map((d) => ({ ...d, path: normalizeDeck(d.path) })),
    media: doc.media,
    noteTypes: doc.noteTypes,
    notes,
    report,
  };
  if (doc.meta) result.meta = doc.meta;
  return result;
}

function reportTruncated(sink: IssueSink, recovered: number, lastUid: string | undefined): void {
  const uid = lastUid ?? '—';
  sink.add({
    code: 'truncated',
    severity: sink.strict ? 'error' : 'warning',
    path: 'notes',
    message: t(
      `Fichier coupé (sortie de l’IA interrompue) : ${recovered} notes récupérées, dernière uid : ${uid}.`,
      `File cut off (AI output interrupted): ${recovered} notes recovered, last uid: ${uid}.`,
    ),
    howToFix: t(
      `Demandez à l’IA de reprendre après la note « ${uid} » (sans répéter les notes déjà produites).`,
      `Ask the AI to resume after note "${uid}" (without repeating the notes already produced).`,
    ),
  });
}

/**
 * Parses, cleans up, validates and normalizes an import (JSON, YAML, Mnemo Markdown, CSV/TSV).
 * Synchronous and total: never throws, any internal failure becomes a `parse_error` issue.
 */
export function parseImport(text: string, options: ParseOptions = {}): ImportParseResult {
  const sink = new IssueSink(options.strict ?? false);
  let format: ImportFormat = options.format ?? 'markdown';
  try {
    format = options.format ?? detectFormat(text, options.fileName);
    return run(text, format, options, sink);
  } catch (e) {
    sink.error(
      'parse_error',
      t(
        `Erreur interne de lecture : ${e instanceof Error ? e.message : String(e)}.`,
        `Internal read error: ${e instanceof Error ? e.message : String(e)}.`,
      ),
      t(
        'Vérifiez la syntaxe du fichier ; si le problème persiste, signalez-le.',
        'Check the file syntax; if the problem persists, report it.',
      ),
    );
    return emptyResult(format, sink);
  }
}
