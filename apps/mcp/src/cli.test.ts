import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, describe, expect, it } from 'vitest';
import { buildMcp, parseCliArgs } from './cli';
import { DryRunStore, importKey } from './dryRuns';
import { HttpConfigError, serveHttp } from './http';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mnemo-mcp-cli-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('mnemo-mcp entry', () => {
  it('parses the command line', () => {
    expect(parseCliArgs([])).toEqual({ http: false, help: false });
    expect(
      parseCliArgs(['--http', '--port', '9000', '--data-dir', 'd', '--user', 'u', '--host', 'h']),
    ).toEqual({ http: true, help: false, port: 9000, dataDir: 'd', user: 'u', host: 'h' });
    expect(() => parseCliArgs(['--port', 'abc'])).toThrow(/port/);
    expect(() => parseCliArgs(['--nope'])).toThrow();
  });

  it('builds the stdio server on the local collection', async () => {
    const { collection, createServer } = buildMcp({ dataDir: tempDir() });
    const server = createServer();
    expect(server.isConnected()).toBe(false);
    await collection.close();
  });
});

describe('dry-run store', () => {
  it('keys on text and options, consumes once and expires', () => {
    let now = 0;
    const store = new DryRunStore(() => now, 1000);
    const key = importKey('text', { mode: 'add', deck: undefined });
    expect(importKey('text', { deck: undefined, mode: 'add' })).toBe(key);
    expect(importKey('text', { mode: 'update' })).not.toBe(key);
    store.remember(key);
    expect(store.consume(key)).toBe(true);
    expect(store.consume(key)).toBe(false);
    store.remember(key);
    now = 1000;
    expect(store.consume(key)).toBe(false);
  });
});

describe('HTTP transport', () => {
  it('requires a token on a non-loopback host', async () => {
    const { collection, createServer } = buildMcp({ dataDir: tempDir() });
    await expect(serveHttp(createServer, { host: '0.0.0.0', port: 0 })).rejects.toBeInstanceOf(
      HttpConfigError,
    );
    await collection.close();
  });

  it('serves MCP over Streamable HTTP with a bearer token', async () => {
    const { collection, createServer } = buildMcp({ dataDir: tempDir() });
    const handle = await serveHttp(createServer, { port: 0, token: 'secret-token' });
    try {
      const url = new URL(handle.url);
      const unauthorized = await fetch(url, { method: 'POST', body: '{}' });
      expect(unauthorized.status).toBe(401);
      const rebinding = await fetch(url, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token', origin: 'https://evil.example' },
        body: '{}',
      });
      expect(rebinding.status).toBe(403);

      const client = new Client({ name: 'test', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(url, {
          requestInit: { headers: { authorization: 'Bearer secret-token' } },
        }),
      );
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toContain('mnemo_import_notes');
      const decks = await client.callTool({ name: 'mnemo_list_decks', arguments: {} });
      expect(decks.isError).toBeFalsy();
      await client.close();
    } finally {
      await handle.close();
      await collection.close();
    }
  });
});
