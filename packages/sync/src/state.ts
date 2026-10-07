import type { Clock } from '@mnemo/core';
import type { SettingsStore } from '@mnemo/storage';
import { ZERO_HLC } from './hlc';
import type { PushRequest } from './protocol';
import { SYNC_SETTINGS_PREFIX } from './stamp';

/** Client-side sync progress, persisted between runs. */
export interface SyncState {
  deviceId: string;
  /** Last change-log sequence number applied locally. */
  cursor: number;
  /** Local clock reading taken before the last fully successful push (entities' `updatedAt`). */
  lastPushUpdatedAt: number;
  /** Same, for review log change times. */
  lastPushLogTs: number;
  /** HLC taken before the last fully successful push (settings and import batches). */
  lastPushHlc?: string;
  /** Batch sent but not acknowledged: resent with the same `batchId`. */
  pendingBatch?: PushRequest;
  /** Last HLC issued, to resume the clock after a restart. */
  hlc?: string;
}

export interface SyncStateStore {
  load(): Promise<SyncState | undefined>;
  save(state: SyncState): Promise<void>;
}

export function initialSyncState(deviceId: string): SyncState {
  return { deviceId, cursor: 0, lastPushUpdatedAt: -1, lastPushLogTs: -1, lastPushHlc: ZERO_HLC };
}

export function createMemorySyncStateStore(initial?: SyncState): SyncStateStore & {
  current(): SyncState | undefined;
} {
  let state = initial === undefined ? undefined : structuredClone(initial);
  return {
    load: () => Promise.resolve(state === undefined ? undefined : structuredClone(state)),
    save: (s) => {
      state = structuredClone(s);
      return Promise.resolve();
    },
    current: () => state,
  };
}

/** Settings key holding the sync state (reserved prefix: ignored by the app settings parser). */
export const SYNC_STATE_KEY = `${SYNC_SETTINGS_PREFIX}state`;

/** Sync state stored in the repository settings table under `sync.state` (use the raw repo). */
export function createSettingsSyncStateStore(
  settings: SettingsStore,
  clock: Clock,
): SyncStateStore {
  return {
    load: async () => {
      const row = await settings.get(SYNC_STATE_KEY);
      return row === undefined ? undefined : (structuredClone(row.value) as SyncState);
    },
    save: (state) =>
      settings.put({ key: SYNC_STATE_KEY, value: structuredClone(state), updatedAt: clock.now() }),
  };
}
