/**
 * Undo log of a memory transaction: the first write to each (table, key) remembers how to restore
 * the previous state. Rolling back replays the restorers in reverse order.
 */
export class Journal {
  private readonly touched = new Set<string>();
  private readonly undo: (() => void)[] = [];
  private active = true;

  record(scope: string, key: string, restore: () => void): void {
    if (!this.active) throw new Error('Transaction is no longer active');
    const id = `${scope}\u0000${key}`;
    if (this.touched.has(id)) return;
    this.touched.add(id);
    this.undo.push(restore);
  }

  commit(): void {
    this.active = false;
  }

  rollback(): void {
    this.active = false;
    for (let i = this.undo.length - 1; i >= 0; i--) this.undo[i]?.();
  }
}

type IndexFn<T> = (row: T) => readonly string[];

/**
 * A keyed in-memory table with secondary indexes (value -> set of primary keys).
 * Stored rows are never mutated in place: callers store their own copies and replace rows on write.
 */
export class MemTable<T> {
  private readonly rows = new Map<string, T>();
  private readonly indexes = new Map<string, Map<string, Set<string>>>();

  constructor(
    readonly name: string,
    private readonly keyOf: (row: T) => string,
    private readonly indexDefs: Readonly<Record<string, IndexFn<T>>> = {},
  ) {
    for (const index of Object.keys(indexDefs)) this.indexes.set(index, new Map());
  }

  get size(): number {
    return this.rows.size;
  }

  get(key: string): T | undefined {
    return this.rows.get(key);
  }

  values(): IterableIterator<T> {
    return this.rows.values();
  }

  /** Rows whose index `index` contains `value`. */
  lookup(index: string, value: string): T[] {
    const keys = this.indexes.get(index)?.get(value);
    if (keys === undefined) return [];
    const out: T[] = [];
    for (const key of keys) {
      const row = this.rows.get(key);
      if (row !== undefined) out.push(row);
    }
    return out;
  }

  put(row: T, journal?: Journal): void {
    const key = this.keyOf(row);
    this.track(key, journal);
    this.write(key, row);
  }

  delete(key: string, journal?: Journal): void {
    if (!this.rows.has(key)) return;
    this.track(key, journal);
    this.remove(key);
  }

  clear(): void {
    this.rows.clear();
    for (const index of this.indexes.values()) index.clear();
  }

  private track(key: string, journal: Journal | undefined): void {
    if (journal === undefined) return;
    const previous = this.rows.get(key);
    journal.record(this.name, key, () => {
      if (previous === undefined) this.remove(key);
      else this.write(key, previous);
    });
  }

  private write(key: string, row: T): void {
    this.remove(key);
    this.rows.set(key, row);
    for (const [name, fn] of Object.entries(this.indexDefs)) {
      const index = this.indexes.get(name);
      if (index === undefined) continue;
      for (const value of fn(row)) {
        let keys = index.get(value);
        if (keys === undefined) index.set(value, (keys = new Set()));
        keys.add(key);
      }
    }
  }

  private remove(key: string): void {
    const row = this.rows.get(key);
    if (row === undefined) return;
    this.rows.delete(key);
    for (const [name, fn] of Object.entries(this.indexDefs)) {
      const index = this.indexes.get(name);
      for (const value of fn(row)) {
        const keys = index?.get(value);
        keys?.delete(key);
        if (keys?.size === 0) index?.delete(value);
      }
    }
  }
}
