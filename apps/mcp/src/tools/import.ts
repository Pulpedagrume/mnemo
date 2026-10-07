import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { IMPORT_MODES } from '@mnemo/core';
import { parseImport } from '@mnemo/importers';
import { recordServerWrites } from '@mnemo/server';
import { applyImport, planImport } from '@mnemo/services';
import type { OpenCollection } from '../collection';
import { importKey, type DryRunStore } from '../dryRuns';
import { errorResult, jsonResult } from '../results';
import { importTextShape, langSchema, validationView } from './content';

const DEFAULT_TARGET_DECK = 'Import';
const DEFAULT_FILE_NAME = 'mcp-import';

const CONFIRM_INSTRUCTION =
  'DRY RUN — nothing was written. Show this summary to the user (notes to create, update and skip, decks to create, errors) and ask for explicit confirmation. Only if the user agrees, call mnemo_import_notes again with exactly the same text and options plus "confirm": true.';

const NOT_DRY_RUN =
  'Import refused: this exact text and these options have not been dry-run in this session (or the dry run expired, or was already used). Call mnemo_import_notes without "confirm" first, show the summary to the user, and ask for confirmation.';

export function registerImportTool(
  server: McpServer,
  openCollection: OpenCollection,
  dryRuns: DryRunStore,
): void {
  server.registerTool(
    'mnemo_import_notes',
    {
      title: 'Import flashcards into the collection',
      description:
        'Imports a file in the Mnemo import format into the local collection. Two steps: (1) call WITHOUT "confirm" for a dry run that writes nothing and returns the plan; show it to the user and ask for confirmation; (2) only after the user agreed, call again with the SAME text and options and "confirm": true. A real import without a prior dry run of the same text is refused. Imports can be undone from the import history of the app.',
      inputSchema: {
        text: importTextShape.text,
        fileName: importTextShape.fileName,
        format: importTextShape.format,
        mode: z
          .enum(IMPORT_MODES)
          .default('skip-duplicates')
          .describe(
            'Duplicates handling: skip-duplicates (default), update (existing notes with the same uid or content), add (always create), replace-deck (delete the notes of the target decks first).',
          ),
        targetDeck: z
          .string()
          .min(1)
          .max(500)
          .default(DEFAULT_TARGET_DECK)
          .describe('Deck for notes that do not declare one (default "Import").'),
        confirm: z
          .boolean()
          .optional()
          .describe(
            'true performs the import. Only set it after the user confirmed the dry-run summary.',
          ),
        lang: langSchema,
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      const fileName = args.fileName ?? DEFAULT_FILE_NAME;
      const key = importKey(args.text, {
        fileName: args.fileName,
        format: args.format,
        mode: args.mode,
        targetDeck: args.targetDeck,
      });
      const parsed = parseImport(args.text, {
        fileName,
        ...(args.format !== undefined ? { format: args.format } : {}),
      });
      const report = validationView(parsed, args.lang);
      const options = { mode: args.mode, targetDeck: args.targetDeck, fileName };

      if (args.confirm !== true) {
        const plan = await openCollection((c) => planImport(c.ctx, parsed, options));
        if (parsed.notes.length > 0) dryRuns.remember(key);
        return jsonResult({
          dryRun: true,
          instruction:
            parsed.notes.length > 0
              ? CONFIRM_INSTRUCTION
              : 'Nothing to import: the file has no valid note. Fix it first (see mnemo_validate_import).',
          plan: {
            create: plan.counts.create,
            update: plan.counts.update,
            skip: plan.counts.skip,
            replaced: plan.replaced,
            decksToCreate: plan.decksToCreate,
          },
          mode: args.mode,
          targetDeck: args.targetDeck,
          report,
        });
      }

      if (!dryRuns.consume(key)) return errorResult(NOT_DRY_RUN);
      if (parsed.notes.length === 0) return errorResult('Nothing to import: no valid note.');
      const batch = await openCollection(async (c) => {
        const since = c.ctx.clock.now();
        const b = await applyImport(c.ctx, parsed, options);
        // Devices synced with this collection receive the imported notes on their next pull.
        await recordServerWrites(c, since, b);
        return b;
      });
      return jsonResult({
        dryRun: false,
        imported: true,
        importBatchId: batch.id,
        created: batch.counts.created ?? 0,
        updated: batch.counts.updated ?? 0,
        skipped: batch.counts.skipped ?? 0,
        decksCreated: batch.counts.decksCreated ?? 0,
        errors: report.counts.errors,
        undo: 'The import can be undone from the import history of the Mnemo app.',
      });
    },
  );
}
