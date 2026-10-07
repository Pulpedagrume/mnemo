import { parseArgs } from 'node:util';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { systemClock } from '@mnemo/core';
import { localCollection, type LocalCollection } from './collection';
import { DryRunStore } from './dryRuns';
import { DEFAULT_MCP_HOST, DEFAULT_MCP_PORT, TOKEN_ENV, serveHttp } from './http';
import { createMnemoMcpServer } from './server';
import { serveStdio } from './stdio';

export const USAGE = `Usage: mnemo-mcp [--http] [--host <host>] [--port <port>] [--data-dir <dir>] [--user <id>]

MCP server of Mnemo, on the local collection of \`mnemo serve\`.
  --http             Streamable HTTP on http://${DEFAULT_MCP_HOST}:${String(DEFAULT_MCP_PORT)}/mcp instead of stdio
  --host <host>      HTTP bind address (default ${DEFAULT_MCP_HOST}; another host requires ${TOKEN_ENV})
  --port <port>      HTTP port (default ${String(DEFAULT_MCP_PORT)})
  --data-dir <dir>   data directory (default: $DATA_DIR or ~/.mnemo)
  --user <id>        collection owner (default: local)
Environment: ${TOKEN_ENV} = bearer token required by the HTTP transport.`;

export interface McpCliOptions {
  http: boolean;
  host?: string;
  port?: number;
  dataDir?: string;
  user?: string;
  help: boolean;
}

export function parseCliArgs(argv: readonly string[]): McpCliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      http: { type: 'boolean', default: false },
      host: { type: 'string' },
      port: { type: 'string' },
      'data-dir': { type: 'string' },
      user: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
      throw new Error(`Invalid port: ${values.port}`);
    }
  }
  return {
    http: values.http,
    help: values.help,
    ...(values.host !== undefined ? { host: values.host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(values['data-dir'] !== undefined ? { dataDir: values['data-dir'] } : {}),
    ...(values.user !== undefined ? { user: values.user } : {}),
  };
}

/** The collection and a factory of servers sharing it (and one dry-run store). */
export function buildMcp(opts: Pick<McpCliOptions, 'dataDir' | 'user'>): {
  collection: LocalCollection;
  createServer: () => McpServer;
} {
  const collection = localCollection({
    ...(opts.dataDir !== undefined ? { dataDir: opts.dataDir } : {}),
    ...(opts.user !== undefined ? { user: opts.user } : {}),
  });
  const dryRuns = new DryRunStore(() => systemClock.now());
  return {
    collection,
    createServer: () => createMnemoMcpServer({ openCollection: collection.open, dryRuns }),
  };
}

export interface RunningMcp {
  transport: 'stdio' | 'http';
  stop(): Promise<void>;
}

/** Starts the requested transport; resolves with a handle stopping everything. */
export async function runMcp(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<RunningMcp | undefined> {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    log(USAGE);
    return undefined;
  }
  const { collection, createServer } = buildMcp(opts);
  if (opts.http) {
    const token = env[TOKEN_ENV];
    const handle = await serveHttp(createServer, {
      ...(opts.host !== undefined ? { host: opts.host } : {}),
      ...(opts.port !== undefined ? { port: opts.port } : {}),
      ...(token !== undefined ? { token } : {}),
    });
    log(`Mnemo MCP server on ${handle.url} (data: ${collection.dataDir})`);
    return {
      transport: 'http',
      stop: async () => {
        await handle.close();
        await collection.close();
      },
    };
  }
  const handle = await serveStdio(createServer());
  return {
    transport: 'stdio',
    stop: async () => {
      await handle.close();
      await collection.close();
    },
  };
}
