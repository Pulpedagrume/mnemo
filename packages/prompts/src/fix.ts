import type { Locale } from '@mnemo/core';
import type { ImportIssue, ImportNoteType, ImportReport, IssueCode } from '@mnemo/importers';
import { IMPORT_NOTE_TYPES, TYPE_ALIASES } from '@mnemo/importers';
import { template } from './build';
import { formatSpec } from './format/spec';
import { FIX_SCOPE } from './phrases';
import type { OutputFormat } from './tasks';
import { CSV_NOTE_TYPES, typesForFormat } from './tasks';
import { fillTemplate } from './variables';

/**
 * Warnings that make the importer drop content (the note, a field or a reference): they are
 * sent to the AI with the errors. Other warnings (automatic cleanups, aliases…) are not.
 */
export const FIX_WARNING_CODES: readonly IssueCode[] = [
  'duplicate_uid',
  'unknown_field',
  'csv_bad_row',
  'media_undeclared',
];

/** At most this many issues are listed; the count still gives the total. */
export const FIX_MAX_ISSUES = 60;
const MAX_EXCERPT_LINES = 15;
const MAX_EXCERPT_CHARS = 800;

export interface FixPromptInput {
  report: ImportReport;
  /** Text that was imported: gives fuller excerpts than ImportIssue.excerpt. */
  sourceText?: string;
  format: OutputFormat;
  locale: Locale;
  /** 'notes' (default): only the corrected notes; 'full': the whole file. */
  scope?: 'notes' | 'full';
}

const W = {
  uid: { fr: 'uid', en: 'uid' },
  note: { fr: 'note n°', en: 'note #' },
  line: { fr: 'ligne', en: 'line' },
  file: { fr: 'fichier', en: 'file' },
  fix: { fr: 'Correction', en: 'Fix' },
  colon: { fr: ' : ', en: ': ' },
  more: {
    fr: (n: number) => `… et ${String(n)} autre(s) erreur(s) du même genre : corrige-les aussi.`,
    en: (n: number) => `… and ${String(n)} more error(s) of the same kind: fix them too.`,
  },
  none: { fr: '(aucun extrait disponible)', en: '(no excerpt available)' },
} as const;

export function issuesToFix(report: ImportReport): ImportIssue[] {
  return report.issues.filter(
    (i) => i.severity === 'error' || (i.severity === 'warning' && FIX_WARNING_CODES.includes(i.code)),
  );
}

function where(issue: ImportIssue, locale: Locale): string {
  const head =
    issue.uid !== undefined
      ? `${W.uid[locale]} ${issue.uid}`
      : issue.noteIndex !== undefined
        ? `${W.note[locale]}${String(issue.noteIndex + 1)}`
        : W.file[locale];
  const details = [
    issue.path !== '' ? issue.path : undefined,
    issue.line !== undefined ? `${W.line[locale]} ${String(issue.line)}` : undefined,
  ].filter((d): d is string => d !== undefined);
  return details.length > 0 ? `${head} (${details.join(', ')})` : head;
}

/** One line per issue: position, message, how to fix. */
export function issueLine(issue: ImportIssue, locale: Locale): string {
  const fix = issue.howToFix[locale].trim();
  const tail = fix === '' ? '' : ` ${W.fix[locale]}${W.colon[locale]}${fix}`;
  return `- ${where(issue, locale)}${W.colon[locale]}${issue.message[locale].trim()}${tail}`;
}

/** Source lines of the note around `line` (whole `::: … :::` block in Markdown). */
function sourceExcerpt(lines: readonly string[], line: number, format: OutputFormat): string {
  let start = Math.max(0, line - 1);
  let end = Math.min(lines.length, start + MAX_EXCERPT_LINES);
  if (format === 'markdown') {
    for (let i = start; i >= 0 && i > start - MAX_EXCERPT_LINES; i--) {
      if (/^\s*:::\s*\S/.test(lines[i] ?? '')) {
        start = i;
        break;
      }
    }
    end = start + 1;
    while (end < lines.length && end - start < MAX_EXCERPT_LINES) {
      end++;
      if (/^\s*:::\s*$/.test(lines[end - 1] ?? '')) break;
    }
  } else if (format === 'csv') {
    end = start + 1;
  }
  return lines.slice(start, end).join('\n').slice(0, MAX_EXCERPT_CHARS);
}

interface Excerpt {
  title: string;
  text: string;
}

function excerptsOf(issues: readonly ImportIssue[], input: FixPromptInput): Excerpt[] {
  const lines = input.sourceText?.replace(/\r\n?/g, '\n').split('\n');
  const seen = new Set<string>();
  const out: Excerpt[] = [];
  for (const issue of issues) {
    const key =
      issue.uid ??
      (issue.noteIndex !== undefined ? `#${String(issue.noteIndex)}` : `L${String(issue.line)}`);
    if (seen.has(key)) continue;
    const text =
      lines !== undefined && issue.line !== undefined
        ? sourceExcerpt(lines, issue.line, input.format)
        : issue.excerpt;
    if (text === undefined || text.trim() === '') continue;
    seen.add(key);
    out.push({ title: `[${where(issue, input.locale)}]`, text });
  }
  return out;
}

/** Issue codes that name the type of the faulty note. */
const CODE_TYPES: readonly (readonly [string, ImportNoteType])[] = [
  ['cloze_', 'cloze'],
  ['mcq_', 'mcq'],
];

const TYPE_NAME = '([A-Za-z_-]+)';
const TYPE_IN_EXCERPT: Readonly<Record<OutputFormat, RegExp>> = {
  markdown: new RegExp(`^\\s*:::\\s*${TYPE_NAME}`, 'gm'),
  json: new RegExp(`"type"\\s*:\\s*"${TYPE_NAME}"`, 'g'),
  yaml: new RegExp(`\\btype\\s*:\\s*["']?${TYPE_NAME}`, 'g'),
  csv: new RegExp(`^"?${TYPE_NAME}"?[,;\\t]`, 'gm'),
};

function asNoteType(name: string): ImportNoteType | undefined {
  const lower = name.toLowerCase();
  const canonical = TYPE_ALIASES[lower] ?? lower;
  return IMPORT_NOTE_TYPES.find((t) => t === canonical);
}

/**
 * Note types to remind: those of the faulty notes (issue codes, types written in the excerpts),
 * or every type the format knows when they cannot be told or a type is unknown.
 */
function typesConcerned(
  issues: readonly ImportIssue[],
  excerpts: readonly Excerpt[],
  format: OutputFormat,
): ImportNoteType[] {
  const all = format === 'csv' ? [...CSV_NOTE_TYPES] : [...IMPORT_NOTE_TYPES];
  if (issues.some((i) => i.code === 'unknown_type')) return all;
  const found = new Set<ImportNoteType>();
  for (const issue of issues) {
    for (const [prefix, type] of CODE_TYPES) if (issue.code.startsWith(prefix)) found.add(type);
  }
  for (const { text } of excerpts) {
    for (const m of text.matchAll(TYPE_IN_EXCERPT[format])) {
      const type = asNoteType(m[1] ?? '');
      if (type) found.add(type);
    }
  }
  const types = typesForFormat(
    IMPORT_NOTE_TYPES.filter((t) => found.has(t)),
    format,
  );
  return types.length > 0 ? types : all;
}

/**
 * T11: correction prompt built from an import report, to paste in the SAME conversation. Lists
 * the errors (and the warnings that drop content), the excerpts concerned and a compact format
 * reminder for the note types concerned. Valid notes are not resent.
 */
export function buildFixPrompt(input: FixPromptInput): string {
  const { report, locale, format } = input;
  const issues = issuesToFix(report);
  const listed = issues.slice(0, FIX_MAX_ISSUES);
  const lines = listed.map((i) => issueLine(i, locale));
  if (issues.length > listed.length) lines.push(W.more[locale](issues.length - listed.length));
  const excerpts = excerptsOf(listed, input);
  const media = issues.some((i) => i.code.startsWith('media_'));
  return fillTemplate(template(locale, 'fix'), {
    portee: FIX_SCOPE[input.scope ?? 'notes'][locale],
    nbErreurs: issues.length,
    listeErreurs: lines.join('\n'),
    extraits:
      excerpts.length > 0
        ? excerpts.map((e) => `${e.title}\n${e.text}`).join('\n\n')
        : W.none[locale],
    specCompacte: formatSpec(format, {
      locale,
      types: typesConcerned(issues, excerpts, format),
      media,
      header: false,
    }),
  });
}
