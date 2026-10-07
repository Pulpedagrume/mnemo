import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Documentation files exposed as MCP resources. */
export const DOC_FILES = {
  'import-format': 'IMPORT_FORMAT.md',
  'ai-prompts': 'AI_PROMPTS.md',
} as const;
export type DocId = keyof typeof DOC_FILES;

const FALLBACK: Record<DocId, string> = {
  'import-format': [
    '# Mnemo import format (`mnemo/1`)',
    '',
    'The full documentation (docs/IMPORT_FORMAT.md, in French) is not bundled with this build.',
    'Use the `mnemo_get_schema` tool or the `mnemo://schema/import` resource for the JSON Schema.',
    '',
    '- Canonical document (JSON or YAML): `format: mnemo/1`, optional `meta`, `defaults`',
    '  (deck, tags), `decks`, `media`, and a `notes` list.',
    '- Every note has a `type` (basic, basic_reversed, typed, cloze, mcq, truefalse, matching,',
    '  ordering, list), a stable `uid` (used for idempotent re-imports), optional `deck`, `tags`,',
    '  `hints`, `explanation`, `source`.',
    '- Mnemo Markdown and CSV/TSV are converted to the same shape.',
    '- Validate with `mnemo_validate_import` before importing.',
  ].join('\n'),
  'ai-prompts': [
    '# Mnemo AI prompts',
    '',
    'The full documentation (docs/AI_PROMPTS.md, in French) is not bundled with this build.',
    'Use the `mnemo_get_prompt` tool to compose a prompt (tasks: flashcards, cloze, mcq,',
    'course-pack, vocabulary, formulas, code, timeline, convert, audit, images), then',
    '`mnemo_validate_import` to check the output: it returns a ready fix prompt on errors.',
  ].join('\n'),
};

/**
 * Where the docs may live: copied next to the bundle (`dist/docs/`, see tsdown.config.ts), or the
 * repository's `docs/` folder (three levels up from both `apps/mcp/src` and `apps/mcp/dist`).
 */
function candidates(file: string): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, 'docs', file), join(here, '..', '..', '..', 'docs', file)];
}

/** The Markdown of a doc, or a short built-in summary when the file is not available. */
export async function readDoc(id: DocId): Promise<string> {
  for (const path of candidates(DOC_FILES[id])) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // Try the next location.
    }
  }
  return FALLBACK[id];
}
