import { Command } from 'commander';
import { APP_NAME, APP_SLUG } from '@mnemo/core';
import pkg from '../package.json' with { type: 'json' };
import type { Io } from './io';
import { processIo } from './io';
import { registerImport } from './commands/import';
import { registerPrompt } from './commands/prompt';
import { registerSchema } from './commands/schema';
import { registerServe } from './commands/serve';
import { registerValidate } from './commands/validate';

/** Builds the CLI. Commands report their exit code through `setExit`. */
export function buildProgram(
  io: Io = processIo,
  setExit: (code: number) => void = () => undefined,
): Command {
  const program = new Command(APP_SLUG)
    .description(`${APP_NAME} — spaced repetition with AI-friendly import`)
    .version(pkg.version, '-v, --version');
  registerValidate(program, io, setExit);
  registerImport(program, io, setExit);
  registerPrompt(program, io, setExit);
  registerSchema(program, io);
  registerServe(program, io, setExit);
  return program;
}
