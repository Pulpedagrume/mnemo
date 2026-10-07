import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { systemClock } from '@mnemo/core';
import type { FastifyInstance } from 'fastify';
import { createServer } from './app';
import { loadConfig, type ServerConfig } from './config';

/** Default location of the built web app relative to this file (bundle or sources). */
function defaultWebDist(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'web'),
    join(here, '../../web/dist'),
    join(here, '../../../apps/web/dist'),
  ];
  return candidates.find((p) => existsSync(join(p, 'index.html')));
}

export interface StartOptions {
  /** Overrides applied on top of the environment (CLI flags). */
  overrides?: Partial<ServerConfig>;
  env?: Record<string, string | undefined>;
  print?: (line: string) => void;
}

/** Entry point: reads the environment, builds the app and listens. */
export async function startServer(opts: StartOptions = {}): Promise<FastifyInstance> {
  const print = opts.print ?? ((line: string) => process.stdout.write(`${line}\n`));
  const config: ServerConfig = { ...loadConfig(opts.env ?? process.env), ...opts.overrides };
  config.webDist ??= defaultWebDist();
  const app = await createServer(config, {
    clock: systemClock,
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    onBootstrapInvite: (code) => {
      print(`No account yet. Create the administrator account with this one-time invite: ${code}`);
    },
  });
  const close = () => {
    void app.close().then(() => process.exit(0));
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  await app.listen({ port: config.port, host: config.host });
  const url =
    config.baseUrl ??
    `http://${config.host.includes(':') ? `[${config.host}]` : config.host}:${String(config.port)}`;
  print(`Mnemo server listening on ${url}`);
  return app;
}
