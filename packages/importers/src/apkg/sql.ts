/**
 * Minimal synchronous SQLite surface needed to read and write Anki collections. The importers
 * package stays platform-neutral: apps inject an engine (sql.js in the browser, node:sqlite in
 * Node).
 */
export interface SqlDatabase {
  /** Runs a query and returns every row as a plain object keyed by column name. */
  all(sql: string, params?: unknown[]): Record<string, unknown>[];
  /** Runs a statement (or several, when `params` is omitted) without returning rows. */
  run(sql: string, params?: unknown[]): void;
  /** Serialized database file. */
  export(): Uint8Array;
  close(): void;
}

export interface SqlEngine {
  /** Opens a database from file bytes, or a new empty database when `bytes` is omitted. */
  open(bytes?: Uint8Array): Promise<SqlDatabase>;
}
