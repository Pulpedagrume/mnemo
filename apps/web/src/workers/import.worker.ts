import type { ImportParseResult, ParseOptions } from '@mnemo/importers';
import { parseImport } from '@mnemo/importers';

export interface ParseRequest {
  id: number;
  text: string;
  options: ParseOptions;
}

export interface ParseResponse {
  id: number;
  result?: ImportParseResult;
  error?: string;
}

// The app is type-checked with the DOM lib; type only what the worker scope needs.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ParseRequest>) => void) | null;
  postMessage: (message: ParseResponse) => void;
};

scope.onmessage = (e) => {
  try {
    scope.postMessage({ id: e.data.id, result: parseImport(e.data.text, e.data.options) });
  } catch (error) {
    scope.postMessage({
      id: e.data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
