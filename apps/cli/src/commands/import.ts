import { basename } from 'node:path';
import type { Command } from 'commander';
import type { ImportMode } from '@mnemo/core';
import { IMPORT_MODES, manualClock, seededRng } from '@mnemo/core';
import { parseImport } from '@mnemo/importers';
import { createServiceContext, ensureCollection, planImport } from '@mnemo/services';
import { createMemoryRepository } from '@mnemo/storage';
import type { Io } from '../io';
import { listInputFiles, readText } from '../io';

interface ImportOptions {
  deck?: string;
  mode?: string;
  dryRun?: boolean;
}

/**
 * Parses each file and prints what an import would do. Writing to a collection needs a
 * persistent database, provided by `mnemo serve` (SQLite, phase 3); until then only --dry-run runs.
 */
export async function importCommand(path: string, opts: ImportOptions, io: Io): Promise<number> {
  const mode: ImportMode = IMPORT_MODES.find((m) => m === opts.mode) ?? 'skip-duplicates';
  if (!opts.dryRun) {
    io.err(
      'Only --dry-run is available for now: importing into a collection requires the local database of `mnemo serve`.',
    );
    return 2;
  }
  const ctx = createServiceContext({
    repo: createMemoryRepository(),
    clock: manualClock(0),
    rng: seededRng(1),
    deviceTimeZone: 'UTC',
  });
  await ensureCollection(ctx, 'en');
  let failed = false;
  for (const file of await listInputFiles(path)) {
    const result = parseImport(await readText(file), { fileName: basename(file) });
    const plan = await planImport(ctx, result, { mode, targetDeck: opts.deck ?? 'Import' });
    const c = result.report.counts;
    io.out(
      `${basename(file)} [${result.format}]: ${String(c.valid)}/${String(c.notes)} valid notes, ${String(c.cards)} cards, ` +
        `${String(c.errors)} errors, ${String(c.warnings)} warnings → would create ${String(plan.counts.create)}, ` +
        `update ${String(plan.counts.update)}, skip ${String(plan.counts.skip)}`,
    );
    if (c.errors > 0) failed = true;
  }
  return failed ? 1 : 0;
}

export function registerImport(program: Command, io: Io, setExit: (code: number) => void): void {
  program
    .command('import')
    .description('Check what importing a file (or every file of a folder) would do')
    .argument('<path>', 'file or folder')
    .option('--deck <path>', 'target deck for notes without a deck', 'Import')
    .option('--mode <mode>', `duplicates handling (${IMPORT_MODES.join(', ')})`, 'skip-duplicates')
    .option('--dry-run', 'analyse only, write nothing')
    .action(async (path: string, opts: ImportOptions) => {
      setExit(await importCommand(path, opts, io));
    });
}
