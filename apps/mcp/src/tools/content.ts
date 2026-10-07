import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LOCALES } from '@mnemo/core';
import { IMPORT_FORMATS, importJsonSchemaText, parseImport } from '@mnemo/importers';
import type { ImportIssue, ImportParseResult } from '@mnemo/importers';
import {
  COMPOSED_TASK_IDS,
  DENSITIES,
  LEVELS,
  OUTPUT_FORMATS,
  buildFixPrompt,
  buildPrompt,
  getPromptTask,
  issuesToFix,
} from '@mnemo/prompts';
import type { Locale } from '@mnemo/core';
import { errorResult, jsonResult, textResult } from '../results';

/** Issues listed in a validation result; the counts still give the totals. */
const MAX_LISTED_ISSUES = 100;

export const langSchema = z
  .enum(LOCALES)
  .default('fr')
  .describe('Language of messages and prompts: "fr" (default) or "en".');

export const importTextShape = {
  text: z
    .string()
    .min(1)
    .describe('Content of the file to import (JSON, YAML, Mnemo Markdown or CSV/TSV), verbatim.'),
  fileName: z
    .string()
    .max(255)
    .optional()
    .describe('Original file name; its extension helps format detection (e.g. "cours.yaml").'),
  format: z.enum(IMPORT_FORMATS).optional().describe('Force the format instead of detecting it.'),
};

function issueView(issue: ImportIssue, lang: Locale) {
  return {
    code: issue.code,
    severity: issue.severity,
    ...(issue.uid !== undefined ? { uid: issue.uid } : {}),
    ...(issue.line !== undefined ? { line: issue.line } : {}),
    path: issue.path,
    message: issue.message[lang],
    howToFix: issue.howToFix[lang],
  };
}

/** Counts and issue list of a parse result, in the requested language. */
export function validationView(result: ImportParseResult, lang: Locale) {
  const { counts, issues } = result.report;
  return {
    format: result.format,
    counts: {
      notes: counts.notes,
      valid: counts.valid,
      invalid: counts.invalid,
      cards: counts.cards,
      byType: counts.byType,
      errors: counts.errors,
      warnings: counts.warnings,
      infos: counts.infos,
    },
    ...(result.report.truncated ? { truncated: result.report.truncated } : {}),
    ...(result.report.continuation !== undefined
      ? { continuation: result.report.continuation }
      : {}),
    issues: issues.slice(0, MAX_LISTED_ISSUES).map((i) => issueView(i, lang)),
    ...(issues.length > MAX_LISTED_ISSUES ? { moreIssues: issues.length - MAX_LISTED_ISSUES } : {}),
  };
}

export function registerContentTools(server: McpServer): void {
  server.registerTool(
    'mnemo_get_schema',
    {
      title: 'Get the Mnemo import JSON Schema',
      description:
        'Returns the JSON Schema (draft 2020-12) of the Mnemo import format `mnemo/1`. Use it to produce JSON or YAML flashcard files that Mnemo can import. Read-only.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => textResult(importJsonSchemaText()),
  );

  server.registerTool(
    'mnemo_get_prompt',
    {
      title: 'Compose a flashcard-generation prompt',
      description: `Composes Mnemo's prompt for turning a course document into flashcards in an importable format. Follow it yourself (paste the document at the end) or give it to the user. Tasks: ${COMPOSED_TASK_IDS.join(', ')}. Prompts exist in French (default) and English. Read-only.`,
      inputSchema: {
        task: z.enum(COMPOSED_TASK_IDS).describe('Kind of cards to generate.'),
        format: z
          .enum(OUTPUT_FORMATS)
          .optional()
          .describe('Output format; defaults to the format recommended for the task.'),
        lang: langSchema,
        deck: z.string().max(500).optional().describe('Root deck, e.g. "Biologie::Cellule".'),
        level: z.enum(LEVELS).optional().describe('Learner level.'),
        density: z
          .union([z.literal(3), z.literal(5), z.literal(10), z.literal('exhaustif')])
          .optional()
          .describe(`Cards per key idea or section: ${DENSITIES.join(', ')}.`),
        hints: z.boolean().optional().describe('Ask for progressive hints (default true).'),
        explanations: z.boolean().optional().describe('Ask for explanations (default true).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => {
      const format = args.format ?? getPromptTask(args.task).recommendedFormat;
      try {
        const built = buildPrompt({
          task: args.task,
          format,
          locale: args.lang,
          options: {
            ...(args.deck !== undefined ? { deck: args.deck } : {}),
            ...(args.level !== undefined ? { level: args.level } : {}),
            ...(args.density !== undefined ? { density: args.density } : {}),
            ...(args.hints !== undefined ? { hints: args.hints } : {}),
            ...(args.explanations !== undefined ? { explanations: args.explanations } : {}),
          },
        });
        return textResult(built.prompt);
      } catch (e) {
        if (e instanceof RangeError) {
          const formats = getPromptTask(args.task).formats.join(', ');
          return errorResult(`Task "${args.task}" cannot use format "${format}". Use: ${formats}.`);
        }
        throw e;
      }
    },
  );

  server.registerTool(
    'mnemo_validate_import',
    {
      title: 'Validate a flashcard file',
      description:
        'Parses and validates a file in the Mnemo import format without writing anything. Returns counts, the issues (code, severity, uid, line, message, how to fix) and, when there are errors, a ready "fix prompt" to correct the file. Read-only.',
      inputSchema: {
        ...importTextShape,
        strict: z
          .boolean()
          .optional()
          .describe('Strict mode: no automatic correction, anything fixable becomes an error.'),
        lang: langSchema,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => {
      const result = parseImport(args.text, {
        ...(args.fileName !== undefined ? { fileName: args.fileName } : {}),
        ...(args.format !== undefined ? { format: args.format } : {}),
        ...(args.strict !== undefined ? { strict: args.strict } : {}),
      });
      const view = validationView(result, args.lang);
      const needsFix = issuesToFix(result.report).length > 0;
      const fixPrompt = needsFix
        ? buildFixPrompt({
            report: result.report,
            sourceText: args.text,
            format: result.format,
            locale: args.lang,
          })
        : undefined;
      return jsonResult({
        ok: result.report.counts.errors === 0,
        ...view,
        ...(fixPrompt !== undefined ? { fixPrompt } : {}),
      });
    },
  );
}
