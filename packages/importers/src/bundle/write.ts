import JSZip from 'jszip';
import { BUNDLE_MEDIA_DIR, safeFileName } from '../export/buildDocument';

export interface WriteBundleInput {
  /** Main file name at the root, e.g. `deck.json`. */
  mainName: string;
  mainText: string;
  /** Media files, written as `media/<name>` (names are sanitized). */
  media: readonly { name: string; bytes: Uint8Array }[];
}

/** Fixed entry date so that the same input always produces the same bytes. */
const ENTRY_DATE = new Date(Date.UTC(2020, 0, 1));

/** Writes a `.zip` bundle (DEFLATE) readable by `readBundle`. */
export async function writeBundle(input: WriteBundleInput): Promise<Uint8Array> {
  const zip = new JSZip();
  const options = { date: ENTRY_DATE, createFolders: false };
  zip.file(safeFileName(input.mainName), input.mainText, options);
  for (const m of input.media)
    zip.file(`${BUNDLE_MEDIA_DIR}/${safeFileName(m.name)}`, m.bytes, { ...options, binary: true });
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
