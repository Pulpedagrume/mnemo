import JSZip from 'jszip';
import type { ImportIssue } from '../report';
import { bundleIssues } from './issues';
import { declaredSize, decodeUtf8, inflateBounded } from './inflate';
import { ACCEPTED_MEDIA_TYPES, sniffMime } from './sniff';

export interface BundleLimits {
  /** Maximum number of entries (files and folders). Default 2 000. */
  maxEntries: number;
  /** Maximum total uncompressed size, declared and real. Default 200 MB. */
  maxTotalBytes: number;
  /** Maximum size of one media file. Default 5 MB. */
  maxMediaBytes: number;
}

export const DEFAULT_BUNDLE_LIMITS: Readonly<BundleLimits> = {
  maxEntries: 2_000,
  maxTotalBytes: 200 * 1024 * 1024,
  maxMediaBytes: 5 * 1024 * 1024,
};

export interface BundleMedia {
  bytes: Uint8Array;
  /** MIME type detected from the content (never from the extension). */
  mime: string;
}

export interface ReadBundleResult {
  /** Main notes file, when exactly one was found. */
  main?: { name: string; text: string };
  /** Accepted media, keyed by their path in the archive (`media/fig.png`). */
  media: Map<string, BundleMedia>;
  issues: ImportIssue[];
}

/** Preferred names of the main file, at the root of the archive. */
export const BUNDLE_MAIN_NAMES: readonly string[] = [
  'deck.json',
  'deck.yaml',
  'deck.yml',
  'deck.md',
];
const MAIN_EXTENSIONS = /\.(json|ya?ml|md)$/i;

/** `..` segments, absolute paths (`/x`, `C:`), backslashes and control characters are refused. */
export function isUnsafeZipPath(path: string): boolean {
  if (path === '' || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path))
    return true;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what we refuse
  if (/[\u0000-\u001f]/.test(path)) return true;
  return path.split('/').some((segment) => segment === '..');
}

function pickMain(rootFiles: readonly string[], issues: ImportIssue[]): string | undefined {
  const preferred = rootFiles.filter((n) => BUNDLE_MAIN_NAMES.includes(n.toLowerCase()));
  const candidates =
    preferred.length > 0 ? preferred : rootFiles.filter((n) => MAIN_EXTENSIONS.test(n));
  if (candidates.length === 1) return candidates[0];
  issues.push(
    candidates.length === 0 ? bundleIssues.noMain() : bundleIssues.severalMains(candidates),
  );
  return undefined;
}

/**
 * Reads a `.zip` bundle: one main notes file at the root and media under `media/`. Everything
 * is untrusted: entry count, declared and real sizes, paths and media types are checked, and
 * nothing is inflated past the limits.
 */
export async function readBundle(
  bytes: Uint8Array,
  limits: Partial<BundleLimits> = {},
): Promise<ReadBundleResult> {
  const lim: BundleLimits = { ...DEFAULT_BUNDLE_LIMITS, ...limits };
  const media = new Map<string, BundleMedia>();
  const issues: ImportIssue[] = [];
  const result = (main?: ReadBundleResult['main']): ReadBundleResult =>
    main ? { main, media, issues } : { media, issues };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { createFolders: false });
  } catch {
    issues.push(bundleIssues.notAZip());
    return result();
  }
  const entries = Object.values(zip.files);
  if (entries.length > lim.maxEntries) {
    issues.push(bundleIssues.tooManyEntries(entries.length, lim.maxEntries));
    return result();
  }

  const files: { path: string; entry: JSZip.JSZipObject }[] = [];
  let declaredTotal = 0;
  for (const entry of entries) {
    const path = entry.unsafeOriginalName ?? entry.name;
    if (isUnsafeZipPath(path)) {
      issues.push(bundleIssues.unsafePath(path));
      continue;
    }
    if (entry.dir) continue;
    declaredTotal += declaredSize(entry) ?? 0;
    files.push({ path, entry });
  }
  if (declaredTotal > lim.maxTotalBytes) {
    issues.push(bundleIssues.tooLarge(declaredTotal, lim.maxTotalBytes));
    return result();
  }

  const rootFiles = files.filter((f) => !f.path.includes('/')).map((f) => f.path);
  const mainName = pickMain(rootFiles, issues);
  let remaining = lim.maxTotalBytes;
  let main: ReadBundleResult['main'];

  for (const { path, entry } of files) {
    const isMedia = path.startsWith('media/');
    if (path !== mainName && !isMedia) {
      issues.push(bundleIssues.ignored(path));
      continue;
    }
    const declared = declaredSize(entry) ?? 0;
    if (isMedia && declared > lim.maxMediaBytes) {
      issues.push(bundleIssues.mediaTooLarge(path, declared, lim.maxMediaBytes));
      continue;
    }
    const limit = isMedia ? Math.min(lim.maxMediaBytes, remaining) : remaining;
    let inflated;
    try {
      inflated = await inflateBounded(entry, limit);
    } catch {
      issues.push(isMedia ? bundleIssues.mediaBadType(path) : bundleIssues.notAZip());
      continue;
    }
    if ('exceeded' in inflated) {
      if (isMedia && limit === lim.maxMediaBytes) {
        issues.push(bundleIssues.mediaTooLarge(path, inflated.exceeded, lim.maxMediaBytes));
        continue;
      }
      issues.push(
        bundleIssues.tooLarge(lim.maxTotalBytes - remaining + inflated.exceeded, lim.maxTotalBytes),
      );
      return result(main);
    }
    remaining -= inflated.bytes.length;
    if (!isMedia) {
      main = { name: path, text: decodeUtf8(inflated.bytes) };
      continue;
    }
    const mime = sniffMime(inflated.bytes);
    if (mime === undefined || !ACCEPTED_MEDIA_TYPES.includes(mime)) {
      issues.push(bundleIssues.mediaBadType(path));
      continue;
    }
    media.set(path, { bytes: inflated.bytes, mime });
  }
  return result(main);
}
