/**
 * Serialises access to the single synchronous SQLite connection.
 *
 * `node:sqlite` runs every statement synchronously, so a plain call can never interleave with
 * another one. Transactions are the exception: `fn` awaits between statements, and anything else
 * running on the connection meanwhile would join (and share the fate of) the open transaction.
 *
 * - `run(body)`: executes immediately when the connection is free, otherwise queues behind the
 *   current transaction (FIFO with queued transactions, so call order is preserved).
 * - `acquire()` / `release()`: exclusive ownership for a transaction; queued work resumes on release.
 *
 * Consequence: awaiting a call on the *repository* (instead of the transaction stores) inside a
 * transaction callback deadlocks, as documented on `Repository.transaction`.
 */
export class SqliteScheduler {
  private owned = false;
  /** Queued work; returns true when it took ownership (a transaction), false when it is done. */
  private readonly waiters: (() => boolean)[] = [];

  get idle(): boolean {
    return !this.owned && this.waiters.length === 0;
  }

  run<T>(body: () => T): Promise<T> {
    if (this.idle) return settle(body);
    return new Promise<T>((resolve, reject) => {
      this.waiters.push(() => {
        try {
          resolve(body());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        return false;
      });
    });
  }

  acquire(): Promise<void> {
    if (this.idle) {
      this.owned = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        resolve();
        return true;
      });
    });
  }

  release(): void {
    this.owned = false;
    while (!this.owned) {
      const next = this.waiters.shift();
      if (next === undefined) break;
      if (next()) this.owned = true;
    }
  }
}

/** Runs a synchronous body as a promise; a thrown error becomes a rejection. */
export function settle<T>(body: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    resolve(body());
  });
}
