#!/usr/bin/env node
// Generates the PWA PNG icons (indigo rounded square with a white "M") without image libraries.
// Usage: node scripts/generate-icons.mjs  → apps/web/public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance from point p to segment ab. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// "M" path from the SVG favicon (32-unit grid): 8,23 → 8,9 → 16,17 → 24,9 → 24,23
const M = [
  [8, 23, 8, 9],
  [8, 9, 16, 17],
  [16, 17, 24, 9],
  [24, 9, 24, 23],
];

function icon(size, { maskable }) {
  // Maskable icons keep the glyph inside the 80 % safe zone and fill the whole square.
  const scale = maskable ? 0.7 : 1;
  const radius = maskable ? 0 : 7 / 32;
  return png(size, (x, y) => {
    const u = x / size;
    const v = y / size;
    const r = radius;
    const cx = Math.min(Math.max(u, r), 1 - r);
    const cy = Math.min(Math.max(v, r), 1 - r);
    if (r > 0 && Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
    const gx = ((u - 0.5) / scale + 0.5) * 32;
    const gy = ((v - 0.5) / scale + 0.5) * 32;
    const d = Math.min(...M.map(([ax, ay, bx, by]) => segDist(gx, gy, ax, ay, bx, by)));
    const px = 32 / size / scale; // one pixel in grid units
    const ink = Math.max(0, Math.min(1, (1.6 - d) / px + 0.5));
    const bg = [79, 70, 229];
    return [
      Math.round(bg[0] + (255 - bg[0]) * ink),
      Math.round(bg[1] + (255 - bg[1]) * ink),
      Math.round(bg[2] + (255 - bg[2]) * ink),
      255,
    ];
  });
}

const out = new URL('../apps/web/public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon-192.png', out), icon(192, { maskable: false }));
writeFileSync(new URL('icon-512.png', out), icon(512, { maskable: false }));
writeFileSync(new URL('maskable-512.png', out), icon(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', out), icon(180, { maskable: true }));
console.log('Icons written to apps/web/public/icons/');
