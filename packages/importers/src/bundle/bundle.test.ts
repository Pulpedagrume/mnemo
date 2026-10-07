import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { isUnsafeZipPath, looksLikeSvg, readBundle, sniffMime, writeBundle } from '.';
import { declaredSize, decodeUtf8 } from './inflate';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const bytesOf = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const utf8 = (s: string): Uint8Array => {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return Uint8Array.from(out);
};

async function zipOf(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files))
    zip.file(name, content, { createFolders: false });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Rewrites the declared uncompressed size of every entry (local and central headers). */
function lieAboutSizes(zip: Uint8Array, size: number): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  for (let i = 0; i + 4 <= out.length; i++) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) view.setUint32(i + 22, size, true);
    if (sig === 0x02014b50) view.setUint32(i + 24, size, true);
  }
  return out;
}

const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

describe('sniffMime', () => {
  it('detects images and audio from magic bytes', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(JPEG)).toBe('image/jpeg');
    expect(sniffMime(bytesOf('GIF89a....'))).toBe('image/gif');
    expect(sniffMime(bytesOf('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(bytesOf('RIFF\0\0\0\0WAVEfmt '))).toBe('audio/wav');
    expect(sniffMime(bytesOf('OggS\0'))).toBe('audio/ogg');
    expect(sniffMime(bytesOf('fLaC\0'))).toBe('audio/flac');
    expect(sniffMime(bytesOf('ID3\x04\0'))).toBe('audio/mpeg');
    expect(sniffMime(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBe('audio/mpeg');
    expect(sniffMime(bytesOf('\0\0\0\x1cftypavif\0\0\0\0avifmif1'))).toBe('image/avif');
    expect(sniffMime(bytesOf('\0\0\0\x20ftypisom\0\0\0\0isomM4A mp42'))).toBe('audio/mp4');
    expect(sniffMime(bytesOf('\0\0\0\x18ftypisom\0\0\0\0isommp42'))).toBeUndefined();
    expect(sniffMime(bytesOf('<html><script>alert(1)</script>'))).toBeUndefined();
    expect(sniffMime(new Uint8Array())).toBeUndefined();
  });

  it('recognizes SVG after a BOM, XML declaration, comments and doctype', () => {
    const svg =
      '\u00ef\u00bb\u00bf<?xml version="1.0"?>\n<!-- c -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect(sniffMime(bytesOf(svg))).toBe('image/svg+xml');
    expect(looksLikeSvg(bytesOf('<svgfoo>'))).toBe(false);
    expect(looksLikeSvg(bytesOf('<html><svg>'))).toBe(false);
  });
});

describe('isUnsafeZipPath', () => {
  it.each(['../evil.png', 'media/../../x', '/etc/passwd', 'C:/x', 'media\\x.png', 'a\u0000b', ''])(
    'refuses %j',
    (p) => {
      expect(isUnsafeZipPath(p)).toBe(true);
    },
  );
  it.each(['deck.json', 'media/a..b.png', 'media/sub/x.png'])('accepts %j', (p) => {
    expect(isUnsafeZipPath(p)).toBe(false);
  });
});

describe('readBundle', () => {
  it('round-trips writeBundle → readBundle', async () => {
    const text = '{"format":"mnemo/1","notes":[{"type":"basic","front":"é ∑ 𝄞","back":"b"}]}';
    const bytes = await writeBundle({
      mainName: 'deck.json',
      mainText: text,
      media: [
        { name: 'fig.png', bytes: PNG },
        { name: 'photo.jpg', bytes: JPEG },
      ],
    });
    const again = await writeBundle({
      mainName: 'deck.json',
      mainText: text,
      media: [
        { name: 'fig.png', bytes: PNG },
        { name: 'photo.jpg', bytes: JPEG },
      ],
    });
    expect(again).toEqual(bytes);
    const r = await readBundle(bytes);
    expect(r.issues).toEqual([]);
    expect(r.main).toEqual({ name: 'deck.json', text });
    expect([...r.media.keys()]).toEqual(['media/fig.png', 'media/photo.jpg']);
    expect(r.media.get('media/fig.png')).toEqual({ bytes: PNG, mime: 'image/png' });
  });

  it('refuses zip-slip, absolute and backslash paths', async () => {
    const r = await readBundle(
      await zipOf({
        'deck.md': '::: basic\nQ: a\nA: b\n:::\n',
        '../evil.png': PNG,
        '/abs.png': PNG,
        'media\\win.png': PNG,
      }),
    );
    expect(codes(r).filter((c) => c === 'zip_unsafe_path')).toHaveLength(3);
    expect(r.main?.name).toBe('deck.md');
    expect(r.media.size).toBe(0);
  });

  it('refuses too many entries before reading anything', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`media/${i}.png`, PNG] as const),
    );
    const r = await readBundle(await zipOf({ 'deck.json': '{}', ...files }), { maxEntries: 5 });
    expect(codes(r)).toEqual(['zip_too_large']);
    expect(r.main).toBeUndefined();
  });

  it('refuses a declared total size over the limit', async () => {
    const big = new Uint8Array(4096);
    const r = await readBundle(await zipOf({ 'deck.json': big }), { maxTotalBytes: 1000 });
    expect(codes(r)).toEqual(['zip_too_large']);
  });

  it('catches a lying declared size while inflating (zip bomb)', async () => {
    const bomb = lieAboutSizes(await zipOf({ 'deck.json': new Uint8Array(1 << 20) }), 10);
    const r = await readBundle(bomb, { maxTotalBytes: 64 * 1024 });
    expect(codes(r)).toEqual(['zip_too_large']);
    expect(r.main).toBeUndefined();
  });

  it('refuses oversized media, declared or real', async () => {
    const big = new Uint8Array(2048);
    big.set(PNG);
    const declared = await readBundle(await zipOf({ 'deck.json': '{}', 'media/big.png': big }), {
      maxMediaBytes: 1024,
    });
    expect(codes(declared)).toEqual(['media_too_large']);
    const lying = lieAboutSizes(await zipOf({ 'media/big.png': big }), 8);
    const real = await readBundle(lying, { maxMediaBytes: 1024 });
    expect(codes(real)).toContain('media_too_large');
  });

  it('uses the real type: JPEG behind .png is accepted as JPEG, HTML is refused', async () => {
    const r = await readBundle(
      await zipOf({
        'deck.yaml': 'format: mnemo/1\n',
        'media/fake.png': JPEG,
        'media/page.png': '<html><script>alert(1)</script></html>',
      }),
    );
    expect(r.media.get('media/fake.png')?.mime).toBe('image/jpeg');
    expect(r.media.has('media/page.png')).toBe(false);
    expect(codes(r)).toEqual(['media_bad_type']);
  });

  it('reports a missing main file and several candidates', async () => {
    const none = await readBundle(await zipOf({ 'media/a.png': PNG, 'notes.txt': 'x' }));
    expect(codes(none)).toEqual(['not_a_document', 'media_undeclared']);
    expect(none.media.size).toBe(1);
    const several = await readBundle(await zipOf({ 'a.json': '{}', 'b.md': 'x' }));
    expect(codes(several)).toContain('not_a_document');
    expect(several.main).toBeUndefined();
    const single = await readBundle(await zipOf({ 'cards.yml': 'a: 1', 'sub/c.json': '{}' }));
    expect(single.main?.name).toBe('cards.yml');
    const preferred = await readBundle(await zipOf({ 'deck.md': 'x', 'README.md': 'y' }));
    expect(preferred.main?.name).toBe('deck.md');
  });

  it('reports a file that is not a zip', async () => {
    const r = await readBundle(bytesOf('not a zip at all'));
    expect(codes(r)).toEqual(['parse_error']);
    expect(r.issues[0]?.message.fr).toBeTruthy();
  });
});

describe('JSZip internals used for bounded inflating', () => {
  it('still exposes declared sizes and internalStream', async () => {
    const zip = await JSZip.loadAsync(await zipOf({ 'a.txt': 'hello' }));
    const entry = zip.files['a.txt']!;
    expect(declaredSize(entry)).toBe(5);
    expect(typeof (entry as unknown as Record<string, unknown>).internalStream).toBe('function');
  });
});

describe('decodeUtf8', () => {
  it('decodes valid UTF-8, strips the BOM and replaces invalid bytes', () => {
    const s = 'aé€𝄞';
    expect(decodeUtf8(utf8(s))).toBe(s);
    expect(decodeUtf8(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
    expect(decodeUtf8(Uint8Array.from([0x41, 0xff, 0xc3]))).toBe('A\ufffd\ufffd');
    expect(decodeUtf8(Uint8Array.from([0xed, 0xa0, 0x80]))).toBe('\ufffd\ufffd\ufffd');
    expect(decodeUtf8(utf8('x'.repeat(10_000)))).toHaveLength(10_000);
  });
});
