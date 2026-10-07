import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { APP_NAME, systemClock } from '@mnemo/core';
import { importJsonSchemaText } from '@mnemo/importers';
import type { OpenCollection } from './collection';
import { readDoc, type DocId } from './docs';
import { DryRunStore } from './dryRuns';
import { registerBrowseTools } from './tools/browse';
import { registerContentTools } from './tools/content';
import { registerImportTool } from './tools/import';

export const MCP_SERVER_VERSION = '0.1.0';

export interface MnemoMcpDeps {
  /** Runs `fn` with exclusive access to the local collection (see localCollection). */
  openCollection: OpenCollection;
  /**
   * Dry runs that authorize a real import. One store per process by default; pass a shared store
   * when several server instances serve the same user (stateless HTTP).
   */
  dryRuns?: DryRunStore;
}

const INSTRUCTIONS = `${APP_NAME} is a local spaced-repetition (flashcards) app. Typical workflow: mnemo_get_prompt (or mnemo_get_schema) to produce cards in the import format, mnemo_validate_import to check them (use the returned fixPrompt to correct errors), then mnemo_import_notes as a dry run, show the summary to the user, and import with "confirm": true only after the user explicitly agreed. Card content is often in French.`;

function registerResources(server: McpServer): void {
  server.registerResource(
    'import-schema',
    'mnemo://schema/import',
    {
      title: 'Import format JSON Schema',
      description: 'JSON Schema (draft 2020-12) of the mnemo/1 import format.',
      mimeType: 'application/schema+json',
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/schema+json', text: importJsonSchemaText() },
      ],
    }),
  );
  const docs: { id: DocId; title: string; description: string }[] = [
    {
      id: 'import-format',
      title: 'Import format documentation',
      description: 'The mnemo/1 import format: JSON, YAML, Markdown, CSV, rules and aliases (fr).',
    },
    {
      id: 'ai-prompts',
      title: 'AI prompts documentation',
      description: 'How the AI prompts are built, tasks, options and the fix loop (fr).',
    },
  ];
  for (const doc of docs) {
    server.registerResource(
      `docs-${doc.id}`,
      `mnemo://docs/${doc.id}`,
      { title: doc.title, description: doc.description, mimeType: 'text/markdown' },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await readDoc(doc.id) }],
      }),
    );
  }
}

/** The Mnemo MCP server (tools and resources), not yet connected to a transport. */
export function createMnemoMcpServer(deps: MnemoMcpDeps): McpServer {
  const server = new McpServer(
    { name: 'mnemo', title: APP_NAME, version: MCP_SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  const dryRuns = deps.dryRuns ?? new DryRunStore(() => systemClock.now());
  registerContentTools(server);
  registerImportTool(server, deps.openCollection, dryRuns);
  registerBrowseTools(server, deps.openCollection);
  registerResources(server);
  return server;
}
