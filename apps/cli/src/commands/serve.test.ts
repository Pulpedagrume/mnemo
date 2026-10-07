import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import type { StartOptions } from '@mnemo/server';
import type { Io } from '../io';
import { registerServe, serveEnv } from './serve';

function harness(start: (opts: StartOptions) => Promise<unknown>) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { out: (t) => out.push(t), err: (t) => err.push(t) };
  let exit = -1;
  const program = new Command('mnemo').exitOverride();
  registerServe(program, io, (c) => (exit = c), start);
  return { program, out, err, exit: () => exit };
}

describe('mnemo serve', () => {
  it('maps flags onto the server environment', () => {
    expect(
      serveEnv({ port: '9000', host: '127.0.0.1', dataDir: '/tmp/m', auth: false }, { PORT: '1' }),
    ).toEqual({ PORT: '9000', HOST: '127.0.0.1', DATA_DIR: '/tmp/m', NO_AUTH: 'true' });
    expect(serveEnv({ auth: true }, {})).toEqual({});
  });

  it('starts the server with the parsed options', async () => {
    let received: StartOptions | undefined;
    const h = harness((opts) => {
      received = opts;
      return Promise.resolve();
    });
    await h.program.parseAsync(['serve', '--port', '9001', '--no-auth'], { from: 'user' });
    expect(received?.env?.PORT).toBe('9001');
    expect(received?.env?.NO_AUTH).toBe('true');
    expect(h.exit()).toBe(0);
  });

  it('reports configuration errors (e.g. --no-auth on a public host) with exit code 2', async () => {
    const h = harness(() => {
      const e = new Error('Refusing to start without authentication on a non-loopback host');
      e.name = 'ConfigError';
      return Promise.reject(e);
    });
    await h.program.parseAsync(['serve', '--host', '0.0.0.0', '--no-auth'], { from: 'user' });
    expect(h.exit()).toBe(2);
    expect(h.err.join('\n')).toMatch(/non-loopback/);
  });
});
