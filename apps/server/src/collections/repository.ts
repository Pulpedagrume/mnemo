import type { Repository } from '@mnemo/storage';
import { createSqliteRepository } from '@mnemo/storage/sqlite';

/** Opens the collection repository stored in `path` (SQLite, `node:sqlite`). */
export function openRepository(path: string): Repository {
  return createSqliteRepository({ path });
}
