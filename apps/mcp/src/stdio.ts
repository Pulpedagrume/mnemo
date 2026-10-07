import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Serves `server` over stdin/stdout (the default transport of MCP clients). */
export async function serveStdio(server: McpServer): Promise<{ close(): Promise<void> }> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { close: () => server.close() };
}
