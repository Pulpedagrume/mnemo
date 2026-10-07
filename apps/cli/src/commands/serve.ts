import type { Command } from 'commander';
import type { StartOptions } from '@mnemo/server';
import type { Io } from '../io';

interface ServeOptions {
  port?: string;
  host?: string;
  dataDir?: string;
  /** commander turns `--no-auth` into `auth: false`. */
  auth?: boolean;
}

export type StartFn = (opts: StartOptions) => Promise<unknown>;

/** Loaded lazily so the other commands never pay for the server dependencies. */
const defaultStart: StartFn = async (opts) => (await import('@mnemo/server')).startServer(opts);

/** Maps CLI flags onto environment variables, which `startServer` validates with the rest. */
export function serveEnv(
  opts: ServeOptions,
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const next = { ...env };
  if (opts.port !== undefined) next.PORT = opts.port;
  if (opts.host !== undefined) next.HOST = opts.host;
  if (opts.dataDir !== undefined) next.DATA_DIR = opts.dataDir;
  if (opts.auth === false) next.NO_AUTH = 'true';
  return next;
}

export async function serveCommand(opts: ServeOptions, io: Io, start: StartFn): Promise<number> {
  try {
    await start({ env: serveEnv(opts, process.env), print: io.out });
    return 0;
  } catch (e) {
    if (e instanceof Error && e.name === 'ConfigError') {
      io.err(e.message);
      return 2;
    }
    throw e;
  }
}

export function registerServe(
  program: Command,
  io: Io,
  setExit: (code: number) => void,
  start: StartFn = defaultStart,
): void {
  program
    .command('serve')
    .description('Start the Mnemo server (web app, API and sync)')
    .option('--port <port>', 'port to listen on (default 8787, env PORT)')
    .option('--host <host>', 'address to bind (default 127.0.0.1, env HOST)')
    .option('--data-dir <dir>', 'where accounts and collections are stored (default ~/.mnemo)')
    .option('--no-auth', 'single-user mode without login (loopback hosts only)')
    .action(async (opts: ServeOptions) => {
      setExit(await serveCommand(opts, io, start));
    });
}
