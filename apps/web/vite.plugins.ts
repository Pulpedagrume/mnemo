import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Content Security Policy of the static build. Static hosts such as GitHub Pages cannot send
 * headers, so the policy ships as a `<meta>` tag; it mirrors `CSP_DIRECTIVES` of the server
 * (apps/server/src/security.ts). `connect-src` also allows any HTTPS origin (and a local server)
 * because users may sync with a server of their own. `frame-ancestors` cannot be set from a
 * `<meta>` tag; the self-hosted server sends it as a header.
 */
const META_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Adds the CSP and a strict referrer policy to the built index.html (not in dev: HMR needs inline scripts). */
export function securityHeadersPlugin(): Plugin {
  return {
    name: 'mnemo:security-meta',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
        injectTo: 'head-prepend',
      },
      { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head' },
    ],
  };
}

interface LicenseEntry {
  name: string;
  versions: string[];
  paths: string[];
  license: string;
  homepage?: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.[a-z]+)?$/i;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

function licenseTexts(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => LICENSE_FILE.test(f))
      .sort()
      .map((f) => readFileSync(join(dir, f), 'utf8').trim());
  } catch {
    return [];
  }
}

/** Full license texts of the app and of every production dependency it bundles (workspace ones included). */
export function thirdPartyNotices(): string {
  const out = execSync('pnpm --filter "@mnemo/web..." licenses list --json --prod', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(out) as Record<string, LicenseEntry[]>;
  const entries = Object.values(byLicense)
    .flat()
    .sort((a, b) => a.name.localeCompare(b.name));
  const rule = '='.repeat(78);
  const sections = entries.map((e) => {
    const texts = licenseTexts(e.paths[0] ?? '');
    const header = `${e.name}@${e.versions.join(', ')} — ${e.license}${e.homepage ? `\n${e.homepage}` : ''}`;
    const body = texts.length > 0 ? texts.join('\n\n') : `(${e.license}; no license file shipped)`;
    return `${rule}\n${header}\n${rule}\n\n${body}\n`;
  });
  const own = readFileSync(join(ROOT, 'LICENSE'), 'utf8').trim();
  return [
    `This application is free software under the MIT license:\n\n${own}\n`,
    `It bundles the following third-party components (${String(entries.length)}):\n`,
    ...sections,
  ].join('\n');
}

/** Emits third-party-licenses.txt next to the app (MIT and BSD require shipping the notices). */
export function thirdPartyNoticesPlugin(): Plugin {
  return {
    name: 'mnemo:third-party-notices',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'third-party-licenses.txt',
        source: thirdPartyNotices(),
      });
    },
  };
}
