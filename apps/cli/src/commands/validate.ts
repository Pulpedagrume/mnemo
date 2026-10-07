import { basename } from 'node:path';
import type { Command } from 'commander';
import { resolveLocale } from '@mnemo/core';
import type { ImportFormat } from '@mnemo/importers';
import { IMPORT_FORMATS, formatReportText, parseImport, reportToJson } from '@mnemo/importers';
import { buildFixPrompt } from '@mnemo/prompts';
import type { Io } from '../io';
import { readText } from '../io';

interface ValidateOptions {
  strict?: boolean;
  json?: boolean;
  aiPrompt?: boolean;
  format?: string;
  lang?: string;
}

/** Validates a file; exit code 1 when it contains errors. */
export async function validateCommand(
  file: string,
  opts: ValidateOptions,
  io: Io,
): Promise<number> {
  const text = await readText(file);
  const format: ImportFormat | undefined = IMPORT_FORMATS.find((f) => f === opts.format);
  const result = parseImport(text, {
    fileName: basename(file),
    ...(format ? { format } : {}),
    ...(opts.strict ? { strict: true } : {}),
  });
  const locale = resolveLocale(opts.lang ?? process.env.LANG);
  if (opts.aiPrompt) {
    io.out(
      buildFixPrompt({
        report: result.report,
        sourceText: text,
        format: result.format,
        locale,
        scope: 'notes',
      }),
    );
  } else if (opts.json) {
    io.out(reportToJson(result.report));
  } else {
    io.out(formatReportText(result.report, locale));
  }
  return result.report.counts.errors > 0 ? 1 : 0;
}

export function registerValidate(program: Command, io: Io, setExit: (code: number) => void): void {
  program
    .command('validate')
    .description('Validate an import file and print the report')
    .argument('<file>', 'file to validate (.md, .yaml, .json, .csv)')
    .option('--strict', 'refuse any automatic correction')
    .option('--json', 'print the report as JSON')
    .option('--ai-prompt', 'print the correction prompt to paste back into the AI')
    .option('--format <format>', `force the format (${IMPORT_FORMATS.join(', ')})`)
    .option('--lang <lang>', 'report language (fr or en)')
    .action(async (file: string, opts: ValidateOptions) => {
      setExit(await validateCommand(file, opts, io));
    });
}
