/**
 * Real media type from the first bytes (never from the file name). Only image and audio types
 * the app can display or play are recognized; anything else returns undefined.
 * SVG is recognized as text and MUST be sanitized by the app before display.
 */

const startsWith = (bytes: Uint8Array, sig: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)));

/** ISO BMFF (`ftyp` box) brands → MIME. */
const FTYP_BRANDS: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  avis: 'image/avif',
  'M4A ': 'audio/mp4',
  'M4B ': 'audio/mp4',
};

function sniffFtyp(bytes: Uint8Array): string | undefined {
  if (ascii(bytes, 4, 8) !== 'ftyp') return undefined;
  const major = FTYP_BRANDS[ascii(bytes, 8, 12)];
  if (major) return major;
  // Compatible brands follow the minor version (box size is bounded by the header read).
  const boxEnd = Math.min(bytes.length, ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0), 64);
  for (let i = 16; i + 4 <= boxEnd; i += 4) {
    const brand = FTYP_BRANDS[ascii(bytes, i, i + 4)];
    if (brand) return brand;
  }
  return undefined;
}

/** True when the text starts (after BOM, XML declaration, comments, doctype) with `<svg`. */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  let text = ascii(bytes, 0, 4096);
  if (text.startsWith('ï»¿')) text = text.slice(3);
  for (;;) {
    text = text.trimStart();
    const skip =
      /^<\?xml[\s\S]*?\?>/.exec(text) ??
      /^<!--[\s\S]*?-->/.exec(text) ??
      /^<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/i.exec(text);
    if (!skip) break;
    text = text.slice(skip[0].length);
  }
  return /^<svg[\s>/]/i.test(text);
}

export function sniffMime(bytes: Uint8Array): string | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  const head = ascii(bytes, 0, 12);
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return 'audio/wav';
  if (head.startsWith('OggS')) return 'audio/ogg';
  if (head.startsWith('fLaC')) return 'audio/flac';
  if (head.startsWith('ID3')) return 'audio/mpeg';
  // MPEG audio frame sync (11 bits set), layer bits not "reserved".
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe6) > 0xe0)
    return 'audio/mpeg';
  const ftyp = sniffFtyp(bytes);
  if (ftyp) return ftyp;
  if (looksLikeSvg(bytes)) return 'image/svg+xml';
  return undefined;
}

/** Media types accepted in bundles. */
export const ACCEPTED_MEDIA_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/flac',
  'audio/mp4',
];
