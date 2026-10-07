#!/usr/bin/env node
// Fails when a dependency uses a license that is not compatible with distributing Mnemo under MIT.
// Uses `pnpm licenses list`, so no extra dependency is needed.
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Permissive licenses accepted for anything shipped to users. */
const PROD_ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'BlueOak-1.0.0',
  'Zlib',
  'PSF-2.0',
]);

/** Build/test-only tools are not redistributed, so file-level copyleft and data licenses are fine. */
const DEV_ALLOWED = new Set([...PROD_ALLOWED, 'MPL-2.0', 'CC-BY-4.0', 'CC-BY-3.0', 'Python-2.0']);

/** Accepts SPDX expressions such as "(MIT OR Apache-2.0)" or "MIT AND ISC". */
export function isAllowed(expression, allowed) {
  const expr = expression.replace(/[()]/g, '').trim();
  if (/\sOR\s/i.test(expr)) return expr.split(/\s+OR\s+/i).some((e) => isAllowed(e, allowed));
  if (/\sAND\s/i.test(expr)) return expr.split(/\s+AND\s+/i).every((e) => isAllowed(e, allowed));
  return allowed.has(expr);
}

function listLicenses(prodOnly) {
  const cmd = `pnpm licenses list --json${prodOnly ? ' --prod' : ''}`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

function check(prodOnly, allowed) {
  const problems = [];
  for (const [license, pkgs] of Object.entries(listLicenses(prodOnly))) {
    if (isAllowed(license, allowed)) continue;
    for (const pkg of pkgs) problems.push(`${pkg.name}@${pkg.versions.join(',')}: ${license}`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prod = check(true, PROD_ALLOWED);
  const all = check(false, DEV_ALLOWED);
  const problems = [
    ...new Set([...prod.map((p) => `[prod] ${p}`), ...all.map((p) => `[dev] ${p}`)]),
  ];
  if (problems.length > 0) {
    console.error('Incompatible or unknown licenses:\n  ' + problems.join('\n  '));
    console.error(
      'Review them, then extend the allowlist in scripts/check-licenses.mjs with an ADR.',
    );
    process.exit(1);
  }
  console.log('Licenses OK.');
}
