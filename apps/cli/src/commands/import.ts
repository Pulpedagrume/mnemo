import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Command } from 'commander';
import type { ImportMode } from '@mnemo/core';
import { IMPORT_MODES } from '@mnemo/core';
import { parseImport, readApkg, type ApkgParseResult } from '@mnemo/importers';
import { recordServerWrites } from '@mnemo/server';
import { applyApkgScheduling, applyImport, planImport, type MediaPayload } from '@mnemo/services';
import type { Io } from '../io';
import { listInputFiles, readText } from '../io';
import { nodeSqlEngine } from '../sqlite-engine';
import { withCollection, type CollectionOptions } from './collection';

interface ImportOptions extends CollectionOptions {
  deck?: string;
  mode?: string;
  dryRun?: boolean;
  withScheduling?: boolean;
}

const isApkg = (file: string): boolean => /\.apkg$/i.test(file);

async function readApkgFile(file: string, withScheduling: boolean): Promise<ApkgParseResult> {
  return readApkg(new Uint8Array(await readFile(file)), nodeSqlEngine, {
    fileName: basename(file),
    withScheduling,
  });
}

function apkgMedia(result: ApkgParseResult): Map<string, MediaPayload> {
  return new Map([...result.mediaFiles].map(([id, m]) => [id, { ...m }] as const));
}

/**
 * Imports a file (or every file of a folder) into the local collection — the one served by
 * `mnemo serve`. With --dry-run, only prints what would happen. Files with errors import their
 * valid notes (partial import) and make the exit code 1.
 */
export async function importCommand(path: string, opts: ImportOptions, io: Io): Promise<number> {
  const mode: ImportMode = IMPORT_MODES.find((m) => m === opts.mode) ?? 'skip-duplicates';
  const targetDeck = opts.deck ?? 'Import';
  const files = await listInputFiles(path);
  const outcome = { failed: false };
  await withCollection(opts, async (c) => {
    for (const file of files) {
      const apkg = isApkg(file)
        ? await readApkgFile(file, opts.withScheduling === true)
        : undefined;
      const result = apkg ?? parseImport(await readText(file), { fileName: basename(file) });
      const counts = result.report.counts;
      if (counts.errors > 0) outcome.failed = true;
      const summary = `${basename(file)} [${apkg ? 'apkg' : result.format}]: ${String(counts.valid)}/${String(counts.notes)} valid notes, ${String(counts.errors)} errors, ${String(counts.warnings)} warnings`;
      if (opts.dryRun) {
        const plan = await planImport(c.ctx, result, { mode, targetDeck });
        io.out(
          `${summary} → would create ${String(plan.counts.create)}, update ${String(plan.counts.update)}, skip ${String(plan.counts.skip)}`,
        );
        continue;
      }
      const since = c.ctx.clock.now();
      const batch = await applyImport(c.ctx, result, {
        mode,
        targetDeck,
        fileName: basename(file),
        ...(apkg ? { media: apkgMedia(apkg) } : {}),
      });
      const scheduled = apkg ? await applyApkgScheduling(c.ctx, batch, apkg.scheduling) : 0;
      if (scheduled > 0) io.out(`${String(scheduled)} cards keep their Anki scheduling`);
      // Devices synced with this collection receive the imported notes on their next pull.
      await recordServerWrites(c, since, batch);
      io.out(
        `${summary} → created ${String(batch.counts.created ?? 0)}, updated ${String(batch.counts.updated ?? 0)}, skipped ${String(batch.counts.skipped ?? 0)} (import ${batch.id})`,
      );
    }
  });
  return outcome.failed ? 1 : 0;
}

export function registerImport(program: Command, io: Io, setExit: (code: number) => void): void {
  program
    .command('import')
    .description('Import a file (or every file of a folder) into the local collection')
    .argument('<path>', 'file or folder')
    .option('--deck <path>', 'target deck for notes without a deck', 'Import')
    .option('--mode <mode>', `duplicates handling (${IMPORT_MODES.join(', ')})`, 'skip-duplicates')
    .option('--dry-run', 'analyse only, write nothing')
    .option('--with-scheduling', 'Anki packages (.apkg): keep the Anki scheduling of the cards')
    .option('--data-dir <dir>', 'data directory (default: $DATA_DIR or ~/.mnemo)')
    .option('--user <id>', 'collection owner on a multi-user server', 'local')
    .action(async (path: string, opts: ImportOptions) => {
      setExit(await importCommand(path, opts, io));
    });
}
