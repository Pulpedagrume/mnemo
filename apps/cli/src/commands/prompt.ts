import type { Command } from 'commander';
import { resolveLocale } from '@mnemo/core';
import type { ComposedTaskId, Density, Level, OutputFormat } from '@mnemo/prompts';
import { COMPOSED_TASK_IDS, OUTPUT_FORMATS, buildPrompt } from '@mnemo/prompts';
import type { Io } from '../io';

interface PromptCliOptions {
  task: string;
  format: string;
  lang: string;
  deck?: string;
  level?: string;
  density?: string;
  hints: boolean;
  explanations: boolean;
  choices?: string;
  uidPrefix?: string;
  long?: boolean;
}

const FORMAT_ALIASES: Record<string, OutputFormat> = { md: 'markdown', yml: 'yaml' };

/** Prints a composed prompt on stdout (pipe it to a file or the clipboard). */
export function promptCommand(opts: PromptCliOptions, io: Io): number {
  const task: ComposedTaskId | undefined = COMPOSED_TASK_IDS.find((t) => t === opts.task);
  const format = FORMAT_ALIASES[opts.format] ?? OUTPUT_FORMATS.find((f) => f === opts.format);
  if (!task || !format) {
    io.err(
      `Unknown task or format. Tasks: ${COMPOSED_TASK_IDS.join(', ')}. Formats: ${OUTPUT_FORMATS.join(', ')}, md, yml.`,
    );
    return 2;
  }
  const density =
    opts.density === 'exhaustif'
      ? 'exhaustif'
      : opts.density
        ? (Number(opts.density) as Density)
        : undefined;
  const options = {
    hints: opts.hints,
    explanations: opts.explanations,
    ...(opts.deck ? { deck: opts.deck } : {}),
    ...(opts.level ? { level: opts.level as Level } : {}),
    ...(density ? { density } : {}),
    ...(opts.choices ? { mcqChoices: Number(opts.choices) } : {}),
    ...(opts.uidPrefix ? { uidPrefix: opts.uidPrefix } : {}),
    ...(opts.long ? { longDocument: true } : {}),
  };
  const { prompt } = buildPrompt({ task, format, locale: resolveLocale(opts.lang), options });
  io.out(prompt);
  return 0;
}

export function registerPrompt(program: Command, io: Io, setExit: (code: number) => void): void {
  program
    .command('prompt')
    .description('Print a ready-to-paste AI prompt that produces an import file')
    .option('--task <task>', `what to generate (${COMPOSED_TASK_IDS.join(', ')})`, 'course-pack')
    .option('--format <format>', 'file format the AI must produce (md, yaml, json, csv)', 'md')
    .option('--lang <lang>', 'prompt language (fr or en)', 'fr')
    .option('--deck <path>', 'root deck')
    .option('--level <level>', 'debutant, intermediaire or expert')
    .option('--density <n>', '3, 5, 10 or exhaustif')
    .option('--hints', 'ask for hints', true)
    .option('--no-hints', 'no hints')
    .option('--explanations', 'ask for explanations', true)
    .option('--no-explanations', 'no explanations')
    .option('--choices <n>', 'MCQ choices (3 to 6)')
    .option('--uid-prefix <prefix>', 'uid prefix')
    .option('--long', 'long document workflow')
    .action((opts: PromptCliOptions) => {
      setExit(promptCommand(opts, io));
    });
}
