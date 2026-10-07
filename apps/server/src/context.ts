import type { Clock } from '@mnemo/core';
import type { AccountStore } from './accounts/store';
import type { CollectionRegistry } from './collections/registry';
import type { ServerConfig } from './config';

/** Shared state handed to every route module. */
export interface AppContext {
  config: ServerConfig;
  clock: Clock;
  accounts: AccountStore;
  collections: CollectionRegistry;
  singleUser: boolean;
  localCsrf: string;
  cookieName: string;
}

/** Rate limits (requests per window), stricter on sensitive routes. */
export interface RateLimits {
  global: number;
  login: number;
  register: number;
  import: number;
  sync: number;
  /** Window of every limit, in milliseconds. */
  windowMs: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = {
  global: 600,
  login: 10,
  register: 5,
  import: 30,
  sync: 240,
  windowMs: 5 * 60 * 1000,
};
