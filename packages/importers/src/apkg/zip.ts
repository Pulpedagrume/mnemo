import JSZip from 'jszip';
import {
  DEFAULT_BUNDLE_LIMITS,
  isUnsafeZipPath,
  type BundleLimits,
  type BundleMedia,
} from '../bundle/read';
import { bundleIssues } from '../bundle/issues';
import { declaredSize, decodeUtf8, inflateBounded } from '../bundle/inflate';
import { ACCEPTED_MEDIA_TYPES, sniffMime } from '../bundle/sniff';
import type { ImportIssue } from '../report';
import { apkgIssues } from './issues';

/** Anki packages often carry thousands of media files: the entry limit is higher than bundles'. */
export const DEFAULT_APKG_LIMITS: Readonly<BundleLimits> = {
  ...DEFAULT_BUNDLE_LIMITS,
  maxEntries: 50_000,
};

export interface ApkgArchive {
  /** SQLite collection bytes (`collection.anki21`, else `collection.anki2`). */
  collection?: Uint8Array;
  /** Accepted media by their Anki file name (from the `media` map). */
  media: Map<string, BundleMedia>;
  /** Media file names whose content was refused (type, size): references are dropped. */
  refusedMedia: Set<string>;
  issues: ImportIssue[];
}

/** Legacy `media` file: JSON object { "0": "image.png", … }. */
function parseMediaMap(bytes: Uint8Array): Map<string, string> | undefined {
  try {
    const raw: unknown = JSON.parse(decodeUtf8(bytes));
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const map = new Map<string, string>();
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') map.set(k, v);
    return map;
  } catch {
    return undefined;
  }
}

/** Reads an `.apkg` (zip) with the same defenses as bundles: entry count, sizes, paths, types. */
export async function readApkgArchive(
  bytes: Uint8Array,
  limits: Partial<BundleLimits> = {},
): Promise<ApkgArchive> {
  const lim: BundleLimits = { ...DEFAULT_APKG_LIMITS, ...limits };
  const out: ApkgArchive = { media: new Map(), refusedMedia: new Set(), issues: [] };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { createFolders: false });
  } catch {
    out.issues.push(apkgIssues.notAnApkg());
    return out;
  }
  const entries = Object.values(zip.files);
  if (entries.length > lim.maxEntries) {
    out.issues.push(bundleIssues.tooManyEntries(entries.length, lim.maxEntries));
    return out;
  }
  const files = new Map<string, JSZip.JSZipObject>();
  let declaredTotal = 0;
  for (const entry of entries) {
    const path = entry.unsafeOriginalName ?? entry.name;
    if (isUnsafeZipPath(path)) {
      out.issues.push(bundleIssues.unsafePath(path));
      continue;
    }
    if (entry.dir) continue;
    declaredTotal += declaredSize(entry) ?? 0;
    files.set(path, entry);
  }
  if (declaredTotal > lim.maxTotalBytes) {
    out.issues.push(bundleIssues.tooLarge(declaredTotal, lim.maxTotalBytes));
    return out;
  }
  if (files.has('collection.anki21b')) {
    out.issues.push(apkgIssues.newFormat());
    return out;
  }
  const collectionEntry = files.get('collection.anki21') ?? files.get('collection.anki2');
  if (!collectionEntry) {
    out.issues.push(apkgIssues.noCollection());
    return out;
  }
  let remaining = lim.maxTotalBytes;
  const inflated = await inflateBounded(collectionEntry, remaining).catch(() => undefined);
  if (!inflated) {
    out.issues.push(apkgIssues.notAnApkg());
    return out;
  }
  if ('exceeded' in inflated) {
    out.issues.push(bundleIssues.tooLarge(inflated.exceeded, lim.maxTotalBytes));
    return out;
  }
  out.collection = inflated.bytes;
  remaining -= inflated.bytes.length;

  const mediaEntry = files.get('media');
  const mediaMapBytes = mediaEntry
    ? await inflateBounded(mediaEntry, Math.min(remaining, 16 * 1024 * 1024)).catch(() => undefined)
    : undefined;
  const mediaMap =
    mediaMapBytes && 'bytes' in mediaMapBytes ? parseMediaMap(mediaMapBytes.bytes) : undefined;
  if (mediaEntry && !mediaMap) out.issues.push(apkgIssues.badMediaMap());

  for (const [num, name] of mediaMap ?? []) {
    const entry = files.get(num);
    if (!entry) continue;
    const declared = declaredSize(entry) ?? 0;
    if (declared > lim.maxMediaBytes) {
      out.issues.push(bundleIssues.mediaTooLarge(name, declared, lim.maxMediaBytes));
      out.refusedMedia.add(name);
      continue;
    }
    const res = await inflateBounded(entry, Math.min(lim.maxMediaBytes, remaining)).catch(
      () => undefined,
    );
    if (!res) {
      out.refusedMedia.add(name);
      continue;
    }
    if ('exceeded' in res) {
      out.refusedMedia.add(name);
      if (remaining <= lim.maxMediaBytes) {
        out.issues.push(bundleIssues.tooLarge(lim.maxTotalBytes, lim.maxTotalBytes));
        return out;
      }
      out.issues.push(bundleIssues.mediaTooLarge(name, res.exceeded, lim.maxMediaBytes));
      continue;
    }
    remaining -= res.bytes.length;
    const mime = sniffMime(res.bytes);
    // Audio is not supported by Anki imports in v1: only images are kept.
    if (mime === undefined || !ACCEPTED_MEDIA_TYPES.includes(mime) || !mime.startsWith('image/')) {
      out.refusedMedia.add(name);
      continue;
    }
    out.media.set(name, { bytes: res.bytes, mime });
  }
  return out;
}
