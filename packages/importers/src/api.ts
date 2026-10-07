import type { NoteData, Source } from '@mnemo/core';
import type { ImportReport } from './report';
import type { z } from 'zod';
import type {
  ImportDeckSchema,
  ImportMediaSchema,
  ImportMetaSchema,
  ImportNoteTypeDefSchema,
} from './format/schema';

export const IMPORT_FORMATS = ['json', 'yaml', 'markdown', 'csv'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const DEFAULT_LIMITS = { maxBytes: 20 * 1024 * 1024, maxNotes: 20_000 } as const;

export interface ParseOptions {
  fileName?: string;
  /** Force a format instead of detecting it. */
  format?: ImportFormat;
  /** Strict mode: no automatic correction; anything that would be fixed is an error. */
  strict?: boolean;
  maxBytes?: number;
  maxNotes?: number;
}

/**
 * A valid note, normalized to the domain shape (lowercase field keys, structured `data`),
 * ready to become a `NoteInput` once its deck is resolved.
 */
export interface ParsedNote {
  /** 0-based position in the file. */
  index: number;
  /** 1-based line of the note in the source, when known (Markdown, YAML, CSV). */
  line?: number;
  uid?: string;
  /** Built-in note type id (`basic`, `cloze`…) or `custom:<id>`. */
  noteTypeId: string;
  /** Full deck path ("A::B"), from the note, the directives or the defaults; '' if none. */
  deck: string;
  fields: Record<string, string>;
  data?: NoteData;
  tags: string[];
  hints: string[];
  explanation?: string;
  source?: Source;
  difficulty?: number;
  needsReview?: boolean;
  media: string[];
  /** Number of cards this note generates. */
  cards: number;
}

export interface ImportParseResult {
  format: ImportFormat;
  meta?: z.infer<typeof ImportMetaSchema>;
  decks: z.infer<typeof ImportDeckSchema>[];
  media: z.infer<typeof ImportMediaSchema>[];
  noteTypes: z.infer<typeof ImportNoteTypeDefSchema>[];
  /** Valid notes only (invalid ones are described in the report). */
  notes: ParsedNote[];
  report: ImportReport;
}
