#!/usr/bin/env node
// Prints the CHANGELOG.md section of a version (Keep a Changelog format):
// `node scripts/changelog-section.mjs 0.1.0`
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Text between `## [version]` and the next `## [` heading, trimmed. */
export function changelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## ['));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const version = process.argv[2];
  const section = version
    ? changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version)
    : undefined;
  if (!section) {
    console.error(`No CHANGELOG.md section for version ${String(version)}`);
    process.exit(1);
  }
  console.log(section);
}
