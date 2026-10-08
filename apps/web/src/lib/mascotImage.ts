import { MascotImageSchema } from '@mnemo/core';

/** Longest side of a stored mascot picture, in pixels. */
const MASCOT_SIZE = 256;

/**
 * Turns a picture chosen by the user into a small raster data URL (WebP, or PNG where the browser
 * cannot encode WebP). Re-encoding through a canvas drops metadata (EXIF, location) and any
 * non-image content; the result is validated before it is stored.
 */
export async function mascotDataUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MASCOT_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.85);
  const url = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  return MascotImageSchema.parse(url);
}
