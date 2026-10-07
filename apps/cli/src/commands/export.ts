import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import type { ExportFormat } from '@mnemo/services';
import { exportNotes } from '@mnemo/services';
import type { Io } from '../io';
import { withCollection, type CollectionOptions } from './collection';

const FORMATS: readonly ExportFormat[] = ['markdown', 'yaml', 'json', 'csv', 'zip'];

interface ExportOptions extends CollectionOptions {
  format: string;
  out?: string;
}

/** Exports a deck (by full name, e.g. "Réseaux::Ethernet") or, with "all", the whole collection. */
export async function exportCommand(deck: string, opts: ExportOptions, io: Io): Promise<number> {
  const wanted = opts.format === 'md' ? 'markdown' : opts.format;
  const format = FORMATS.find((f) => f === wanted);
  if (!format) {
    io.err(`Unknown format "${opts.format}" (md, yaml, json, csv, zip).`);
    return 2;
  }
  return withCollection(opts, async (c) => {
    let deckId: string | undefined;
    if (deck !== 'all') {
      deckId = (await c.repo.decks.list()).find((d) => d.name === deck)?.id;
      if (!deckId) {
        io.err(`Deck not found: ${deck}`);
        return 2;
      }
    }
    const res = await exportNotes(c.ctx, { format, ...(deckId ? { deckId } : {}) });
    const target = resolve(opts.out ?? join(process.cwd(), res.fileName));
    await writeFile(target, res.content);
    io.out(`${String(res.notes)} notes → ${target}`);
    for (const w of res.warnings) io.err(`warning: ${w}`);
    return 0;
  });
}

export function registerExport(program: Command, io: Io, setExit: (code: number) => void): void {
  program
    .command('export')
    .description('Export a deck (full name) or "all" to md, yaml, json, csv or zip')
    .argument('<deck>', 'deck full name, e.g. "Réseaux::Ethernet", or "all"')
    .requiredOption('--format <format>', 'md, yaml, json, csv or zip')
    .option('--out <file>', 'output file (default: a name derived from the deck)')
    .option('--data-dir <dir>', 'data directory (default: $DATA_DIR or ~/.mnemo)')
    .option('--user <id>', 'collection owner on a multi-user server', 'local')
    .action(async (deck: string, opts: ExportOptions) => {
      setExit(await exportCommand(deck, opts, io));
    });
}
