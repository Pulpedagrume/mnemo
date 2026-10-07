import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Plain-text tool result. */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/** JSON tool result: pretty-printed text plus the same object as structured content. */
export function jsonResult(value: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

/** A tool-level error the assistant can read and act on (not a protocol error). */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}
