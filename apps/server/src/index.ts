import { APP_NAME } from '@mnemo/core';
import { DB_NAME } from '@mnemo/storage';
import { SYNC_PROTOCOL_VERSION } from '@mnemo/sync';

/** Default port of `mnemo serve` (phase 3). */
export const DEFAULT_PORT = 8787;

export function serverInfo() {
  return { name: APP_NAME, db: DB_NAME, syncProtocol: SYNC_PROTOCOL_VERSION, port: DEFAULT_PORT };
}
