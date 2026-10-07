import type JSZip from 'jszip';

/**
 * Size-bounded access to zip entries. JSZip only exposes these through undocumented members:
 * they are read defensively and the code falls back to the public API when they are missing.
 */

interface StreamHelper {
  on(event: 'data', cb: (chunk: Uint8Array) => void): StreamHelper;
  on(event: 'error', cb: (err: unknown) => void): StreamHelper;
  on(event: 'end', cb: () => void): StreamHelper;
  resume(): StreamHelper;
  pause(): StreamHelper;
}

interface EntryInternals {
  _data?: { uncompressedSize?: unknown };
  internalStream?: (type: 'uint8array') => StreamHelper;
}

const internals = (entry: JSZip.JSZipObject): EntryInternals => entry as unknown as EntryInternals;

/** Uncompressed size declared in the central directory, or undefined when unknown. */
export function declaredSize(entry: JSZip.JSZipObject): number | undefined {
  const size = internals(entry)._data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : undefined;
}

export type InflateResult = { bytes: Uint8Array } | { exceeded: number };

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Inflates an entry, stopping as soon as more than `limit` bytes came out (the declared size
 * can lie: a zip bomb is caught while inflating, not after).
 */
export async function inflateBounded(
  entry: JSZip.JSZipObject,
  limit: number,
): Promise<InflateResult> {
  const { internalStream } = internals(entry);
  if (typeof internalStream !== 'function') {
    const bytes = await entry.async('uint8array');
    return bytes.length > limit ? { exceeded: bytes.length } : { bytes };
  }
  return new Promise<InflateResult>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let done = false;
    const helper = internalStream.call(entry, 'uint8array');
    helper
      .on('data', (chunk) => {
        if (done) return;
        size += chunk.length;
        if (size > limit) {
          done = true;
          helper.pause();
          resolve({ exceeded: size });
          return;
        }
        chunks.push(chunk);
      })
      .on('error', (err) => {
        if (done) return;
        done = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      })
      .on('end', () => {
        if (done) return;
        done = true;
        resolve({ bytes: concat(chunks, size) });
      })
      .resume();
  });
}

/** UTF-8 decoder (no TextDecoder: the package targets plain ES2023). Invalid bytes → U+FFFD. */
export function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  const parts: string[] = [];
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const cont = (k: number): number => {
    const b = bytes[k];
    return b !== undefined && (b & 0xc0) === 0x80 ? b & 0x3f : -1;
  };
  while (i < bytes.length) {
    const b = bytes[i] ?? 0;
    let cp = -1;
    let len = 1;
    if (b < 0x80) cp = b;
    else if (b >= 0xc2 && b < 0xe0) {
      const c1 = cont(i + 1);
      if (c1 >= 0) [cp, len] = [((b & 0x1f) << 6) | c1, 2];
    } else if (b >= 0xe0 && b < 0xf0) {
      const [c1, c2] = [cont(i + 1), cont(i + 2)];
      const v = ((b & 0x0f) << 12) | (c1 << 6) | c2;
      if (c1 >= 0 && c2 >= 0 && v >= 0x800 && (v < 0xd800 || v > 0xdfff)) [cp, len] = [v, 3];
    } else if (b >= 0xf0 && b < 0xf5) {
      const [c1, c2, c3] = [cont(i + 1), cont(i + 2), cont(i + 3)];
      const v = ((b & 0x07) << 18) | (c1 << 12) | (c2 << 6) | c3;
      if (c1 >= 0 && c2 >= 0 && c3 >= 0 && v >= 0x10000 && v <= 0x10ffff) [cp, len] = [v, 4];
    }
    out += String.fromCodePoint(cp < 0 ? 0xfffd : cp);
    i += len;
    if (out.length >= 8192) {
      parts.push(out);
      out = '';
    }
  }
  parts.push(out);
  return parts.join('');
}
