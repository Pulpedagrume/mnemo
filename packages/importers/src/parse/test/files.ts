/**
 * Test inputs loaded through Vite's `import.meta.glob` (raw text, byte-exact) so that tests need
 * no Node API: `src` is type-checked without Node types.
 */

interface RawGlobOptions {
  query: '?raw';
  import: 'default';
  eager: true;
}

declare global {
  interface ImportMeta {
    glob: (pattern: string | string[], options: RawGlobOptions) => Record<string, string>;
  }
}

const FIXTURES = import.meta.glob('../../../fixtures/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const EXAMPLES = import.meta.glob('../../../../../examples/ai-outputs/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const SCHEMA = import.meta.glob('../../../../../schema/mnemo-import.schema.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function strip(files: Record<string, string>, marker: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, text] of Object.entries(files))
    out.set(path.slice(path.indexOf(marker) + marker.length), text);
  return out;
}

/** Fixture files by path relative to `packages/importers/fixtures/` (e.g. `valid/x.md`). */
export const fixtures = strip(FIXTURES, '/fixtures/');
/** Example AI outputs by file name (`examples/ai-outputs/<name>`). */
export const examples = strip(EXAMPLES, '/ai-outputs/');

export function readFixture(path: string): string {
  const text = fixtures.get(path);
  if (text === undefined) throw new Error(`Missing fixture ${path}`);
  return text;
}

export function readExample(name: string): string {
  const text = examples.get(name);
  if (text === undefined) throw new Error(`Missing example ${name}`);
  return text;
}

/** The committed JSON Schema text, if any. */
export const committedSchema: string | undefined = Object.values(SCHEMA)[0];
