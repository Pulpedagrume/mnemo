import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import * as importers from '@mnemo/importers';
import { IMPORT_NOTE_TYPES, ImportDocumentSchema, NOTE_TYPE_DOCS } from '@mnemo/importers';
import type { ImportParseResult, ParseOptions } from '@mnemo/importers';
import { buildPrompt } from './build';
import { exampleDocument } from './format/example';
import { CSV_FIELDS, MARKDOWN_FIELDS } from './format/syntax';
import type { ComposedTaskId, OutputFormat } from './tasks';
import { COMPOSED_TASK_IDS, CSV_NOTE_TYPES, getPromptTask, typesForFormat } from './tasks';

type ParseImport = (
  text: string,
  options?: ParseOptions,
) => ImportParseResult | Promise<ImportParseResult>;
/** Added by the parser work (src/parse); the Markdown/CSV cases run once it exists. */
const parseImport = (importers as Record<string, unknown>).parseImport as ParseImport | undefined;

const LOCALES = ['fr', 'en'] as const;

function cases(format: OutputFormat): [ComposedTaskId, 'fr' | 'en'][] {
  return COMPOSED_TASK_IDS.filter((t) => getPromptTask(t).formats.includes(format)).flatMap((t) =>
    LOCALES.map((l): [ComposedTaskId, 'fr' | 'en'] => [t, l]),
  );
}

function expectValid(doc: unknown, label: string): void {
  const result = ImportDocumentSchema.safeParse(doc);
  expect(result.success, `${label}: ${JSON.stringify(result.error?.issues ?? [])}`).toBe(true);
}

async function expectImports(text: string, format: OutputFormat, label: string): Promise<void> {
  if (!parseImport) return;
  const result = await parseImport(text, { format, strict: true });
  const errors = result.report.issues.filter((i) => i.severity === 'error');
  expect(errors, label).toEqual([]);
  expect(result.notes.length, label).toBeGreaterThan(0);
}

describe('examples embedded in prompts are valid', () => {
  it.each(cases('json'))('%s / json / %s', async (task, locale) => {
    const { exampleText, prompt } = buildPrompt({ task, format: 'json', locale });
    expect(prompt).toContain(exampleText);
    expectValid(JSON.parse(exampleText), task);
    await expectImports(exampleText, 'json', task);
  });

  it.each(cases('yaml'))('%s / yaml / %s', async (task, locale) => {
    const { exampleText, prompt } = buildPrompt({ task, format: 'yaml', locale });
    expect(prompt).toContain(exampleText);
    const doc: unknown = parseYaml(exampleText);
    expectValid(doc, task);
    // Same document as the JSON example: the YAML emitter loses nothing.
    expect(doc).toEqual(JSON.parse(buildPrompt({ task, format: 'json', locale }).exampleText));
    await expectImports(exampleText, 'yaml', task);
  });

  it.each(cases('markdown'))('%s / markdown / %s: source document', (task, locale) => {
    const t = getPromptTask(task);
    const doc = exampleDocument({ locale, types: t.noteTypes, deck: 'D', uidPrefix: 'p' });
    expectValid(doc, task);
  });

  it.each(cases('csv'))('%s / csv / %s: source document', (task, locale) => {
    const types = typesForFormat(getPromptTask(task).noteTypes, 'csv');
    expectValid(exampleDocument({ locale, types, deck: 'D', uidPrefix: 'p' }), task);
  });

  it.skipIf(!parseImport).each(cases('markdown'))(
    '%s / markdown / %s imports without errors',
    async (task, locale) => {
      const { exampleText } = buildPrompt({ task, format: 'markdown', locale });
      await expectImports(exampleText, 'markdown', task);
    },
  );

  it.skipIf(!parseImport).each(cases('csv'))(
    '%s / csv / %s imports without errors',
    async (task, locale) => {
      const { exampleText } = buildPrompt({ task, format: 'csv', locale });
      await expectImports(exampleText, 'csv', task);
    },
  );
});

describe('format syntax tables cover NOTE_TYPE_DOCS', () => {
  it('every documented field has a Markdown syntax', () => {
    for (const type of IMPORT_NOTE_TYPES) {
      for (const field of NOTE_TYPE_DOCS[type].fields) {
        expect(MARKDOWN_FIELDS[type], `${type}.${field.key}`).toHaveProperty(field.key);
      }
    }
  });

  it('every field of a CSV type is mapped (null = not representable)', () => {
    for (const type of CSV_NOTE_TYPES) {
      for (const field of NOTE_TYPE_DOCS[type].fields) {
        expect(CSV_FIELDS[type], `${type}.${field.key}`).toHaveProperty(field.key);
      }
    }
  });

  it('every task has a non-empty example in each of its formats', () => {
    for (const task of COMPOSED_TASK_IDS) {
      for (const format of getPromptTask(task).formats) {
        expect(buildPrompt({ task, format, locale: 'fr' }).exampleText.length).toBeGreaterThan(20);
      }
    }
  });
});
