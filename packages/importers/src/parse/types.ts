/** Internal types shared by the format parsers and the validation pipeline. */

export interface NoteLoc {
  /** 1-based line in the cleaned text (the pipeline adds the cleanup line offset). */
  line?: number;
  excerpt?: string;
}

export interface FormatOutput {
  /** Parsed document (object or bare array of notes); undefined when nothing could be read. */
  root: unknown;
  /** Locations aligned with the notes array of `root` (may be shorter). */
  locs: NoteLoc[];
  /** The text was cut off; the incomplete last note was dropped. */
  truncated?: boolean;
}
