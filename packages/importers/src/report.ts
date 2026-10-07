import type { I18nString } from '@mnemo/core';

export type IssueSeverity = 'error' | 'warning' | 'info';

/**
 * Stable issue codes. Tests, fixtures and the correction prompt rely on them.
 * Cleanup (automatic fixes) always reports a warning so nothing changes silently.
 */
export const ISSUE_CODES = [
  // Document / parsing
  'file_too_large',
  'too_many_notes',
  'parse_error',
  'not_a_document',
  'wrong_format_id',
  'truncated',
  'continuation',
  // Cleanup (warnings)
  'bom_removed',
  'code_fence_extracted',
  'prose_removed',
  'smart_quotes_fixed',
  'trailing_commas_removed',
  'comments_removed',
  'json_repaired',
  'yaml_tabs_converted',
  'markdown_spacing_fixed',
  'alias',
  'answers_normalized',
  // Markdown structure
  'unclosed_block',
  'orphan_block_end',
  'unknown_field',
  // CSV
  'csv_no_headers',
  'csv_bad_row',
  // Notes
  'unknown_type',
  'missing_field',
  'invalid_value',
  'unknown_key',
  'invalid_uid',
  'duplicate_uid',
  'duplicate_note',
  'cloze_no_hole',
  'cloze_empty',
  'cloze_unbalanced',
  'cloze_nested',
  'cloze_invalid_number',
  'cloze_skipped_number',
  'mcq_no_correct',
  'mcq_choice_count',
  'mcq_duplicate_choice',
  'mcq_bad_answer_ref',
  'field_too_long',
  'question_too_short',
  'hint_contains_answer',
  'html_sanitized',
  // Decks, presets, media
  'deck_created',
  'unknown_preset',
  'media_undeclared',
  'media_missing_file',
  'media_remote',
  'media_too_large',
  'media_bad_type',
  'zip_unsafe_path',
  'zip_too_large',
  'unknown_note_type_def',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface ImportIssue {
  code: IssueCode;
  severity: IssueSeverity;
  /** JSON-path-like location, e.g. `notes[12].choices`. */
  path: string;
  /** 1-based line and column in the source text, when known. */
  line?: number;
  column?: number;
  /** Index of the note in the file (0-based) and its uid, when the issue concerns a note. */
  noteIndex?: number;
  uid?: string;
  message: I18nString;
  howToFix: I18nString;
  /** Automatic correction that was applied (tolerant mode) or can be applied. */
  suggestion?: I18nString;
  /** Up to 200 characters of the offending source. */
  excerpt?: string;
}

export interface ImportCounts {
  /** Notes found in the file. */
  notes: number;
  /** Notes that passed validation (may still carry warnings). */
  valid: number;
  invalid: number;
  /** Cards the valid notes will generate. */
  cards: number;
  byType: Record<string, number>;
  errors: number;
  warnings: number;
  infos: number;
}

export interface ImportReport {
  issues: ImportIssue[];
  counts: ImportCounts;
  /** Output was cut off: notes before the cut were recovered. */
  truncated?: { recovered: number; lastUid?: string };
  /** Non-empty `continuation` / `@continuation`: the AI has more to generate. */
  continuation?: string;
}
