import { Command } from 'commander';
import { APP_NAME, APP_SLUG } from '@mnemo/core';
import pkg from '../package.json' with { type: 'json' };

export function buildProgram(): Command {
  return new Command(APP_SLUG)
    .description(`${APP_NAME} — spaced repetition with AI-friendly import`)
    .version(pkg.version, '-v, --version');
}
