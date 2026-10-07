import type { I18nString, Locale } from '@mnemo/core';
import { FORMAT_ID } from '@mnemo/core';
import type { FieldDoc, ImportNoteType } from '@mnemo/importers';
import { COMMON_FIELD_DOCS, NOTE_TYPE_DOCS } from '@mnemo/importers';
import { FORMAT_NAMES } from '../phrases';
import type { OutputFormat } from '../tasks';
import type { FieldSyntax } from './syntax';
import { CSV_COMMON, CSV_FIELDS, MARKDOWN_COMMON, MARKDOWN_FIELDS } from './syntax';
import { STRUCTURE } from './structure';

/**
 * Compact format specification embedded in prompts (FORMAT block) and in the fix prompt.
 * Generated from NOTE_TYPE_DOCS / COMMON_FIELD_DOCS (single source of truth) for the note
 * types a task needs, in the syntax of the chosen output format. Card counts are only shown
 * when a note gives more than one card.
 */
export interface SpecOptions {
  locale: Locale;
  types: readonly ImportNoteType[];
  /** Document the root `media` list (figures). JSON and YAML only. */
  media?: boolean;
  /** Mention the uid prefix to use. */
  uidPrefix?: string;
  /** Include the `FORMAT : …` title line (default true). */
  header?: boolean;
  /** Add the advice about code blocks inside a Markdown file. */
  codeBlocks?: boolean;
  /**
   * Leave out the description and card count of each type (fields only). Composed prompts use it:
   * their TÂCHE block already says when to use each type, and the example shows each layout.
   */
  brief?: boolean;
}

const T = {
  colon: { fr: ' : ', en: ': ' },
  sep: { fr: ' ; ', en: '; ' },
  types: { fr: 'Types', en: 'Types' },
  csvOnly: { fr: 'Types (seuls possibles en CSV)', en: 'Types (the only ones in CSV)' },
  common: { fr: 'Clés communes, facultatives', en: 'Common keys, optional' },
  mdCommon: { fr: 'Facultatif', en: 'Optional' },
  optional: { fr: 'facultatif', en: 'optional' },
  prefix: { fr: 'Préfixe des uid', en: 'uid prefix' },
  oneCard: { fr: '1 carte', en: '1 card' },
} as const satisfies Record<string, I18nString>;

const isStructured = (f: OutputFormat): boolean => f === 'json' || f === 'yaml';

/** Markdown / CSV rendering of a type field; undefined when the format cannot express it. */
function syntaxField(
  f: FieldDoc,
  syntax: FieldSyntax | undefined,
  format: OutputFormat,
  locale: Locale,
): string | undefined {
  if (!syntax) return undefined;
  const optional = f.required ? '' : `, ${T.optional[locale]}`;
  switch (syntax.kind) {
    case 'label': {
      const doc = (syntax.syntax ?? f.doc)[locale];
      return format === 'csv'
        ? `${syntax.label} (${doc}${optional})`
        : `${syntax.label}: ${doc}${optional}`;
    }
    case 'lines':
      return `${syntax.syntax[locale]}${optional}`;
    case 'attribute':
      // Option with a non-default sample value: self-explanatory, no description needed.
      return `${f.key}=${syntax.value ?? '…'}`;
  }
}

function fieldsOf(type: ImportNoteType, format: OutputFormat, locale: Locale): string[] {
  const fields = NOTE_TYPE_DOCS[type].fields;
  if (isStructured(format)) {
    return fields.map((f) => `${f.key}${f.required ? '' : '?'} (${f.doc[locale]})`);
  }
  const table = format === 'markdown' ? MARKDOWN_FIELDS[type] : CSV_FIELDS[type];
  return fields.flatMap((f) => syntaxField(f, table?.[f.key], format, locale) ?? []);
}

function typeLine(type: ImportNoteType, format: OutputFormat, locale: Locale, brief: boolean): string {
  const d = NOTE_TYPE_DOCS[type];
  const cards = brief || d.cards[locale] === T.oneCard[locale] ? '' : ` (${d.cards[locale]})`;
  const doc = brief ? '' : ` — ${d.doc[locale]}`;
  const sep = isStructured(format) ? ', ' : T.sep[locale];
  return `- ${type}${doc}${cards}${T.colon[locale]}${fieldsOf(type, format, locale).join(sep)}`;
}

function commonLine(format: OutputFormat, locale: Locale): string {
  if (isStructured(format)) {
    const keys = COMMON_FIELD_DOCS.map((f) => `${f.key} (${f.doc[locale]})`);
    return `${T.common[locale]}${T.colon[locale]}${keys.join(', ')}.`;
  }
  const table = format === 'markdown' ? MARKDOWN_COMMON : CSV_COMMON;
  const attributes: string[] = [];
  const fields: string[] = [];
  for (const f of COMMON_FIELD_DOCS) {
    const s = table[f.key];
    if (s?.kind === 'attribute') attributes.push(`${f.key}=${s.value ?? '…'}`);
    if (s?.kind === 'label') {
      const label = format === 'markdown' ? `${s.label}:` : s.label;
      fields.push(s.syntax ? `${label} (${s.syntax[locale]})` : label);
    }
  }
  if (format === 'csv') return `${T.common[locale]}${T.colon[locale]}${fields.join(', ')}.`;
  return `${T.mdCommon[locale]}${T.colon[locale]}${attributes.join(', ')}${T.sep[locale]}${fields.join(', ')}.`;
}

/** Compact spec of `format` for the given note types (see SpecOptions). */
export function formatSpec(format: OutputFormat, options: SpecOptions): string {
  const { locale, types } = options;
  const colon = T.colon[locale];
  const s = STRUCTURE[format];
  const lines: string[] = [];
  if (options.header !== false) lines.push(`FORMAT${colon}${FORMAT_NAMES[format]} (${FORMAT_ID})`);
  lines.push(...s.lines[locale].map((l) => `- ${l}`));
  if (options.codeBlocks === true && s.codeBlocks) lines.push(`- ${s.codeBlocks[locale]}`);
  if (options.media === true && s.media) lines.push(`- ${s.media[locale]}`);
  lines.push(`${(format === 'csv' ? T.csvOnly : T.types)[locale]}${colon.trimEnd()}`);
  lines.push(...types.map((t) => typeLine(t, format, locale, options.brief === true)));
  lines.push(commonLine(format, locale));
  if (options.uidPrefix !== undefined) {
    lines.push(`${T.prefix[locale]}${colon}${options.uidPrefix}.`);
  }
  return lines.join('\n');
}
