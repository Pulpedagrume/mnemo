import type { ImportParseResult, ParseOptions } from '@mnemo/importers';
import { parseImport, readApkg, readBundle } from '@mnemo/importers';
import type { MediaPayload } from '@mnemo/services';
import type { ParseRequest, ParseResponse } from '../../workers/import.worker';
import { sqlJsEngine } from '../../lib/sqljs';

let worker: Worker | null = null;
let nextId = 1;

/** Parses in a Web Worker so large AI outputs never freeze the page. */
function parseInWorker(text: string, options: ParseOptions): Promise<ImportParseResult> {
  if (typeof Worker === 'undefined') return Promise.resolve(parseImport(text, options));
  worker ??= new Worker(new URL('../../workers/import.worker.ts', import.meta.url), {
    type: 'module',
  });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<ParseResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Parse failed'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, text, options } satisfies ParseRequest);
  });
}

export interface LoadedImport {
  fileName: string;
  text: string;
  result: ImportParseResult;
  /** Media provided by a .zip bundle, by declared media id. */
  media: Map<string, MediaPayload>;
}

/** Loads pasted text, a text file, a .zip bundle or an Anki .apkg package, and parses it. */
export async function loadImport(
  input: { text: string; fileName?: string } | { file: File },
  options: Omit<ParseOptions, 'fileName'> = {},
): Promise<LoadedImport> {
  if ('text' in input) {
    const fileName = input.fileName ?? 'texte-colle.md';
    const result = await parseInWorker(input.text, { ...options, fileName });
    return { fileName, text: input.text, result, media: new Map() };
  }
  const { file } = input;
  if (/\.apkg$/i.test(file.name)) {
    // Anki packages are SQLite databases: read on the main thread with sql.js (loaded lazily).
    const apkg = await readApkg(new Uint8Array(await file.arrayBuffer()), sqlJsEngine, {
      fileName: file.name,
      ...(options.strict === undefined ? {} : { strict: options.strict }),
      ...(options.maxNotes === undefined ? {} : { maxNotes: options.maxNotes }),
    });
    const { mediaFiles, ...result } = apkg;
    const media = new Map<string, MediaPayload>([...mediaFiles].map(([id, m]) => [id, { ...m }]));
    return { fileName: file.name, text: '', result, media };
  }
  if (/\.zip$/i.test(file.name)) {
    const bundle = await readBundle(new Uint8Array(await file.arrayBuffer()));
    const text = bundle.main?.text ?? '';
    const result = await parseInWorker(text, {
      ...options,
      fileName: bundle.main?.name ?? file.name,
    });
    result.report.issues.unshift(...bundle.issues);
    // Bundle files are referenced by path (media/fig.png); map them to declared media ids.
    const media = new Map<string, MediaPayload>();
    for (const decl of result.media) {
      const entry = decl.file ? bundle.media.get(decl.file.replace(/^\.?\//, '')) : undefined;
      if (entry)
        media.set(decl.id, {
          bytes: entry.bytes,
          mime: entry.mime,
          name: decl.file?.split('/').pop() ?? decl.id,
        });
    }
    return { fileName: file.name, text, result, media };
  }
  const text = await file.text();
  const result = await parseInWorker(text, { ...options, fileName: file.name });
  return { fileName: file.name, text, result, media: new Map() };
}
