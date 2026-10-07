import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

/** Where command output goes; injectable for tests. */
export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

export const processIo: Io = {
  out: (text) => {
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  },
  err: (text) => {
    process.stderr.write(text.endsWith('\n') ? text : `${text}\n`);
  },
};

const IMPORTABLE = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.tsv',
  '.apkg',
]);

/** A file, or every importable file of a directory (sorted, non-recursive). */
export async function listInputFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (!info.isDirectory()) return [path];
  const names = await readdir(path);
  return names
    .filter((n) => IMPORTABLE.has(extname(n).toLowerCase()))
    .sort()
    .map((n) => join(path, n));
}

export function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}
