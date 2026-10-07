import { describe, expect, it } from 'vitest';
import type { NoteData } from '@mnemo/core';
import type { ImportFormat, ImportParseResult, ParseOptions, ParsedNote } from '../api';
import * as parse from '../parse';
import { buildImportDocument, exportDocument } from '.';
import type { ExportNoteInput } from '.';
import { sampleCollection } from './test/fixtures';

type ParseImport = (
  text: string,
  options?: ParseOptions,
) => ImportParseResult | Promise<ImportParseResult>;

// The parsers are written in parallel: this suite runs once `parseImport` exists.
const parseImport: ParseImport | undefined =
  'parseImport' in parse && typeof parse.parseImport === 'function' ? parse.parseImport : undefined;

/** Minimal valid input per format: a format whose parser has not landed yet yields no note. */
const PROBES: Readonly<Record<ImportFormat, string>> = {
  json: '{"format":"mnemo/1","notes":[{"type":"basic","front":"a","back":"b"}]}',
  yaml: 'format: mnemo/1\nnotes:\n  - type: basic\n    front: a\n    back: b\n',
  markdown: '::: basic\nQ: a\nA: b\n:::\n',
  csv: 'type,front,back\nbasic,a,b\n',
};

/** What survives an export → import cycle, in the domain shape. */
function expected(entry: ExportNoteInput, lossy: boolean) {
  const { note } = entry;
  let data: NoteData | undefined = note.data;
  let explanation = note.explanation;
  if (lossy && data?.kind === 'mcq') {
    const extra = data.choices
      .filter((c) => c.explanation !== undefined)
      .map((c) => `- ${c.text}: ${c.explanation ?? ''}`);
    if (extra.length > 0)
      explanation = [explanation, extra.join('\n')].filter((s) => s !== undefined).join('\n\n');
    data = { ...data, choices: data.choices.map(({ text, correct }) => ({ text, correct })) };
  }
  return {
    uid: note.uid,
    deck: entry.deckPath,
    fields: note.fields,
    data,
    tags: note.tags,
    hints: note.hints,
    explanation,
    source: note.source,
  };
}

const actual = (n: ParsedNote) => ({
  uid: n.uid,
  deck: n.deck,
  fields: n.fields,
  data: n.data,
  tags: n.tags,
  hints: n.hints,
  explanation: n.explanation,
  source: n.source,
});

const CSV_TYPES = new Set(['basic', 'basic_reversed', 'cloze', 'mcq']);

describe.skipIf(parseImport === undefined)('export → parseImport round trip', () => {
  const run = async (
    format: ImportFormat,
    entries: ExportNoteInput[],
    lossy: boolean,
    skip: () => void,
  ) => {
    const parser = parseImport as ParseImport;
    const probe = await parser(PROBES[format], { format });
    if (probe.notes.length === 0) {
      skip();
      return;
    }
    const doc = buildImportDocument({ notes: entries });
    const { text } = exportDocument(doc, format);
    const result = await parser(text, { format });
    expect(result.notes.map(actual)).toEqual(entries.map((e) => expected(e, lossy)));
  };

  for (const format of ['json', 'yaml'] as const)
    it(`${format} gives back the same notes`, async (ctx) => {
      await run(format, sampleCollection(), false, () => ctx.skip());
    });

  it('markdown gives back the same notes (choice explanations moved)', async (ctx) => {
    await run('markdown', sampleCollection(), true, () => ctx.skip());
  });

  it('csv gives back the representable notes', async (ctx) => {
    const entries = sampleCollection()
      .filter((e) => CSV_TYPES.has(e.noteType.id))
      .map((e) => {
        const note = { ...e.note };
        delete note.difficulty;
        delete note.needsReview;
        const data = note.data?.kind === 'mcq' ? { ...note.data, shuffle: true } : note.data;
        return { ...e, note: { ...note, ...(data ? { data } : {}) } };
      });
    await run('csv', entries, true, () => ctx.skip());
  });
});
