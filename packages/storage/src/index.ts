import { APP_SLUG } from '@mnemo/core';

export type * from './repository';
export { createMemoryRepository } from './memory';

/** Name of the IndexedDB database (browser) and default SQLite file stem (server). */
export const DB_NAME = APP_SLUG;
