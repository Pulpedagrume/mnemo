import { createHash } from 'node:crypto';

/** How long a dry run authorizes the matching real import. */
export const DRY_RUN_TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 100;

/** Stable key of an import request: the text and every option that changes the outcome. */
export function importKey(text: string, options: Record<string, string | undefined>): string {
  const ordered = Object.keys(options)
    .sort()
    .map((k) => [k, options[k] ?? null]);
  return createHash('sha256')
    .update(JSON.stringify([text, ordered]))
    .digest('hex');
}

/**
 * Remembers the imports that were dry-run (shown to the user) so that a real import is only
 * accepted for exactly the same text and options. Entries expire and are consumed on use.
 */
export class DryRunStore {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly now: () => number,
    private readonly ttlMs = DRY_RUN_TTL_MS,
  ) {}

  remember(key: string): void {
    this.prune();
    this.entries.delete(key);
    this.entries.set(key, this.now() + this.ttlMs);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  /** True (and forgets the key) when `key` was dry-run and has not expired. */
  consume(key: string): boolean {
    this.prune();
    return this.entries.delete(key);
  }

  private prune(): void {
    const now = this.now();
    for (const [key, expires] of this.entries) if (expires <= now) this.entries.delete(key);
  }
}
