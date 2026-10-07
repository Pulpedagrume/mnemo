import type { I18nString, Locale } from '@mnemo/core';
import { FORMAT_ID } from '@mnemo/core';
import type { ImportNoteType } from '@mnemo/importers';
import { NOTE_TYPE_DOCS } from '@mnemo/importers';
import type { OutputFormat } from '../tasks';
import { toCsv } from './csv';
import type { ExampleDocument, ExampleNote } from './example-doc';
import { toMarkdown } from './markdown';
import { toYaml } from './yaml';

export interface ExampleOptions {
  locale: Locale;
  types: readonly ImportNoteType[];
  media?: boolean;
  deck: string;
  uidPrefix: string;
}

/** Figure example for the images task (T15): not a note type, so not in NOTE_TYPE_DOCS. */
const MEDIA_EXAMPLE: { alt: I18nString; front: I18nString; back: I18nString } = {
  alt: {
    fr: 'Schéma d’une trame Ethernet : préambule, adresses, type, données, FCS',
    en: 'Diagram of an Ethernet frame: preamble, addresses, type, data, FCS',
  },
  front: {
    fr: '![Trame Ethernet](media:fig-1)\n\nQuel champ termine la trame ?',
    en: '![Ethernet frame](media:fig-1)\n\nWhich field ends the frame?',
  },
  back: { fr: 'Le FCS (Frame Check Sequence).', en: 'The FCS (Frame Check Sequence).' },
};

/** Field keys of a type: types with the same keys are written the same way. */
function layoutOf(type: ImportNoteType): string {
  return NOTE_TYPE_DOCS[type].fields.map((f) => f.key).join(',');
}

/**
 * Minimal valid example document: one note per field layout (basic_reversed is left out when
 * basic is shown: same fields), taken from NOTE_TYPE_DOCS examples, numbered with the uid
 * convention. With `media`, a declared figure and a note that shows it.
 */
export function exampleDocument(options: ExampleOptions): ExampleDocument {
  const { uidPrefix, locale } = options;
  const uid = (i: number): string => `${uidPrefix}-1-${String(i + 1).padStart(3, '0')}`;
  const notes: ExampleNote[] = [];
  if (options.media === true) {
    notes.push({
      type: 'basic',
      front: MEDIA_EXAMPLE.front[locale],
      back: MEDIA_EXAMPLE.back[locale],
    });
  }
  const layouts = new Set<string>(options.media === true ? [layoutOf('basic')] : []);
  for (const type of options.types) {
    const layout = layoutOf(type);
    if (layouts.has(layout)) continue;
    layouts.add(layout);
    notes.push({ ...NOTE_TYPE_DOCS[type].example });
  }
  const doc: ExampleDocument = {
    format: FORMAT_ID,
    defaults: { deck: options.deck },
    notes: notes.map((n, i) => ({ uid: uid(i), ...n })),
  };
  if (options.media === true) {
    doc.media = [{ id: 'fig-1', file: 'figure-1.png', alt: MEDIA_EXAMPLE.alt[locale] }];
  }
  return doc;
}

/** Serializes an example document in the output format (no trailing newline). */
export function renderExample(doc: ExampleDocument, format: OutputFormat): string {
  const ordered = { format: doc.format, defaults: doc.defaults, media: doc.media, notes: doc.notes };
  switch (format) {
    case 'json':
      return JSON.stringify(ordered, null, 2);
    case 'yaml':
      return toYaml(ordered);
    case 'markdown':
      return toMarkdown(doc);
    case 'csv':
      return toCsv(doc);
  }
}
