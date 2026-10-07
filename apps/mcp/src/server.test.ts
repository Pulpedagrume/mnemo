import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localCollection, type LocalCollection } from './collection';
import { createMnemoMcpServer } from './server';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const WITH_ERRORS = readFileSync(join(ROOT, 'examples', 'ai-outputs', 'with-errors.yaml'), 'utf8');

const NOTES = `format: mnemo/1
defaults:
  deck: Biologie::Cellule
notes:
  - type: basic
    uid: mcp-001
    tags: [organites]
    front: Quel organite réalise la respiration cellulaire ?
    back: La mitochondrie.
  - type: cloze
    uid: mcp-002
    text: Le {{c1::noyau}} contient l’ADN.
  - type: basic
    uid: mcp-003
    deck: Chimie
    front: Symbole du sodium ?
    back: Na
`;

let dataDir: string;
let collection: LocalCollection;
let client: Client;

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = (result as CallToolResult).content[0];
  return content?.type === 'text' ? content.text : '';
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { result, text: textOf(result), json: result.structuredContent ?? {} };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'mnemo-mcp-'));
  collection = localCollection({ dataDir });
  const server = createMnemoMcpServer({ openCollection: collection.open });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
  await collection.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('mnemo MCP server', () => {
  it('lists every tool and resource', async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([
      'mnemo_due_summary',
      'mnemo_get_prompt',
      'mnemo_get_schema',
      'mnemo_import_notes',
      'mnemo_list_decks',
      'mnemo_search_notes',
      'mnemo_validate_import',
    ]);
    const resources = (await client.listResources()).resources.map((r) => r.uri).sort();
    expect(resources).toEqual([
      'mnemo://docs/ai-prompts',
      'mnemo://docs/import-format',
      'mnemo://schema/import',
    ]);
  });

  it('returns the JSON Schema', async () => {
    const { text } = await call('mnemo_get_schema');
    const schema = JSON.parse(text) as { $schema: string; title: string };
    expect(schema.$schema).toContain('2020-12');
    expect(schema.title).toContain('mnemo/1');
  });

  it('composes a prompt and refuses an impossible format', async () => {
    const fr = await call('mnemo_get_prompt', { task: 'flashcards', format: 'yaml', lang: 'fr' });
    expect(fr.text).toContain('mnemo/1');
    const en = await call('mnemo_get_prompt', { task: 'mcq', lang: 'en', deck: 'Bio' });
    expect(en.result.isError).toBeFalsy();
    expect(en.text).toContain('Bio');
    const bad = await call('mnemo_get_prompt', { task: 'images', format: 'csv' });
    expect(bad.result.isError).toBe(true);
  });

  it('validates a file with errors and returns a fix prompt', async () => {
    const { json } = await call('mnemo_validate_import', {
      text: WITH_ERRORS,
      fileName: 'with-errors.yaml',
      lang: 'en',
    });
    const counts = json.counts as { errors: number; valid: number };
    expect(json.ok).toBe(false);
    expect(counts.errors).toBeGreaterThan(0);
    const issues = json.issues as { uid?: string; severity: string; message: string }[];
    expect(issues.some((i) => i.uid === 'bio-9-004' && i.severity === 'error')).toBe(true);
    expect(typeof json.fixPrompt).toBe('string');
    expect(json.fixPrompt).toContain('bio-9-004');
  });

  it('validates a clean file without a fix prompt', async () => {
    const { json } = await call('mnemo_validate_import', { text: NOTES, fileName: 'n.yaml' });
    expect(json.ok).toBe(true);
    expect(json.fixPrompt).toBeUndefined();
    expect((json.counts as { valid: number }).valid).toBe(3);
  });

  it('refuses a real import without a dry run', async () => {
    const { result, text } = await call('mnemo_import_notes', { text: NOTES, confirm: true });
    expect(result.isError).toBe(true);
    expect(text).toContain('dry-run');
  });

  it('dry-runs, then imports only with confirm and the same text', async () => {
    const dry = await call('mnemo_import_notes', { text: NOTES, fileName: 'n.yaml' });
    expect(dry.json.dryRun).toBe(true);
    expect(dry.json.instruction).toContain('confirm');
    expect(dry.json.plan).toMatchObject({ create: 3, update: 0, skip: 0 });
    expect(dry.json.plan).toHaveProperty('decksToCreate');

    // Different options than the dry run: refused.
    const other = await call('mnemo_import_notes', {
      text: NOTES,
      fileName: 'n.yaml',
      mode: 'add',
      confirm: true,
    });
    expect(other.result.isError).toBe(true);
    // A dry run without confirm writes nothing.
    expect((await call('mnemo_search_notes', {})).json.total).toBe(0);

    const real = await call('mnemo_import_notes', {
      text: NOTES,
      fileName: 'n.yaml',
      confirm: true,
    });
    expect(real.result.isError).toBeFalsy();
    expect(real.json).toMatchObject({ imported: true, created: 3, skipped: 0 });
    expect(typeof real.json.importBatchId).toBe('string');

    // The dry run is consumed by the import.
    const again = await call('mnemo_import_notes', {
      text: NOTES,
      fileName: 'n.yaml',
      confirm: true,
    });
    expect(again.result.isError).toBe(true);
  });

  it('skips duplicates on a second import', async () => {
    const dry = await call('mnemo_import_notes', { text: NOTES, fileName: 'n.yaml' });
    expect(dry.json.plan).toMatchObject({ create: 0, skip: 3 });
    const real = await call('mnemo_import_notes', {
      text: NOTES,
      fileName: 'n.yaml',
      confirm: true,
    });
    expect(real.json).toMatchObject({ created: 0, skipped: 3 });
  });

  it('lists decks with counts', async () => {
    const { json } = await call('mnemo_list_decks');
    const decks = json.decks as { path: string; new: number; children?: { path: string }[] }[];
    const bio = decks.find((d) => d.path === 'Biologie');
    expect(bio?.children?.map((c) => c.path)).toContain('Biologie::Cellule');
    expect(bio?.new).toBe(2);
    expect(decks.find((d) => d.path === 'Chimie')?.new).toBe(1);
  });

  it('searches notes by text, deck and tag', async () => {
    const byText = await call('mnemo_search_notes', { text: 'mitochondrie' });
    expect(byText.json.notes).toEqual([
      expect.objectContaining({ uid: 'mcp-001', deck: 'Biologie::Cellule', type: 'basic' }),
    ]);
    const byDeck = await call('mnemo_search_notes', { deck: 'biologie' });
    expect(byDeck.json.total).toBe(2);
    const byTag = await call('mnemo_search_notes', { tag: 'organites', limit: 5 });
    expect(byTag.json.total).toBe(1);
    const unknown = await call('mnemo_search_notes', { deck: 'Nope' });
    expect(unknown.result.isError).toBe(true);
    const tooMany = await call('mnemo_search_notes', { limit: 51 });
    expect(tooMany.result.isError).toBe(true);
  });

  it('summarizes due cards with a 7-day forecast', async () => {
    const { json } = await call('mnemo_due_summary');
    expect(json.total).toEqual({ new: 3, learning: 0, review: 0 });
    expect(json.forecast).toHaveLength(7);
    expect(json.totalCards).toBe(3);
    expect(json.decks).toEqual(
      expect.arrayContaining([expect.objectContaining({ deck: 'Chimie', new: 1 })]),
    );
  });

  it('reads the resources', async () => {
    const read = async (uri: string) => {
      const content = (await client.readResource({ uri })).contents[0];
      return content && 'text' in content ? content.text : '';
    };
    expect(JSON.parse(await read('mnemo://schema/import'))).toHaveProperty('$id');
    expect(await read('mnemo://docs/import-format')).toContain('mnemo/1');
    expect(await read('mnemo://docs/ai-prompts')).toContain('Prompts');
  });
});
