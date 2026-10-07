#!/usr/bin/env node
// Renames the application everywhere: `pnpm rename-app <Name> [--dry-run]`.
// - "Mnemo" (display name) becomes <Name>; "mnemo" (slug: CLI, scope, data dir) becomes <slug>.
// - The file format identifier `mnemo/1` and the published schema name stay unchanged,
//   so files produced before the rename keep importing.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TEXT_EXT =
  /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|html|css|txt|toml|svg)$|(^|\/)(Dockerfile|LICENSE|NOTICE|\.env\.example)$/;
const SKIP = /(^|\/)(pnpm-lock\.yaml|CHANGELOG\.md)$|(^|\/)(fixtures|ai-outputs)\//;

export function toSlug(name) {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Pure text transform, exported for tests. */
export function renameInText(text, name, slug) {
  return text
    .replace(/\bMnemo\b/g, name)
    .replace(/\bMNEMO\b/g, slug.toUpperCase().replace(/-/g, '_'))
    .replace(/\bmnemo\b(?!\/\d|-import\.schema)/g, slug);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    console.error('Usage: pnpm rename-app <Name> [--dry-run]');
    process.exit(1);
  }
  const slug = toSlug(name);
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    console.error(`Cannot derive a valid slug from "${name}".`);
    process.exit(1);
  }
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f && TEXT_EXT.test(f) && !SKIP.test(f) && !f.startsWith('scripts/rename-app'));

  const changed = [];
  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    const after = renameInText(before, name, slug);
    if (after !== before) {
      changed.push(file);
      if (!dryRun) writeFileSync(file, after);
    }
  }
  console.log(
    `${dryRun ? '[dry-run] ' : ''}${changed.length} file(s) updated -> ${name} (${slug})`,
  );
  for (const f of changed) console.log(`  ${f}`);
  if (!dryRun)
    console.log('\nNext: run `pnpm install` to refresh the lockfile, then `pnpm check`.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
