import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  // Workspace packages ship TypeScript sources: bundle them (with the server collections used by
  // `mnemo serve`). argon2 is a native addon and stays external.
  deps: { alwaysBundle: [/^@mnemo\//], neverBundle: ['@node-rs/argon2'] },
  // The MCP server never hashes passwords: drop the bare side-effect import of argon2 left by the
  // server package, so the binary does not need the native addon.
  treeshake: { moduleSideEffects: 'no-external' },
  // Served as the mnemo://docs/* resources (see src/docs.ts).
  copy: [{ from: ['../../docs/IMPORT_FORMAT.md', '../../docs/AI_PROMPTS.md'], to: 'dist/docs' }],
});
