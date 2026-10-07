import { create } from 'zustand';
import type { Clock, IdGenerator } from '@mnemo/core';
import type { Repository } from '@mnemo/storage';
import type { HlcClock, SyncReport } from '@mnemo/sync';
import { createSettingsSyncStateStore, createSyncClient } from '@mnemo/sync';
import { useDataVersion } from '../app/services';
import { api, createHttpTransport, HttpError, type ServerAuth } from './httpTransport';

/** Connection settings, stored locally (never synced). */
export interface SyncConfig {
  url: string;
  auth: 'cookie' | 'bearer';
  token?: string;
  email?: string;
}

export interface SyncDeps {
  /** Raw (unstamped) repository: merged remote data must not be re-stamped. */
  raw: Repository;
  hlc: HlcClock;
  deviceId: string;
  clock: Clock;
  ids: IdGenerator;
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

interface SyncStore {
  config: SyncConfig | null;
  status: SyncStatus;
  lastSync?: number;
  lastReport?: SyncReport;
  error?: string;
  setState: (patch: Partial<Omit<SyncStore, 'setState'>>) => void;
}

export const useSync = create<SyncStore>((set) => ({
  config: null,
  status: 'off',
  setState: (patch) => {
    set(patch);
  },
}));

const CONFIG_KEY = 'sync.config';
const AUTO_INTERVAL_MS = 5 * 60_000;
const AFTER_CHANGE_DELAY_MS = 10_000;

let deps: SyncDeps | null = null;
let csrfToken: string | null = null;
let running: Promise<void> | null = null;

async function saveConfig(config: SyncConfig | null): Promise<void> {
  if (!deps) return;
  await deps.raw.settings.put({ key: CONFIG_KEY, value: config, updatedAt: deps.clock.now() });
  useSync.getState().setState({ config, status: config ? 'idle' : 'off' });
}

function authOf(config: SyncConfig): ServerAuth {
  return config.auth === 'bearer' && config.token
    ? { kind: 'bearer', token: config.token }
    : { kind: 'cookie', csrfToken };
}

interface Me {
  user: { email: string };
  csrfToken: string | null;
  mode: 'single-user' | 'accounts';
}

/** Checks the session (or single-user server) and refreshes the CSRF token. */
async function checkCookieSession(url: string): Promise<Me> {
  const me = await api<Me>(url, '/auth/me', { kind: 'cookie', csrfToken: null });
  csrfToken = me.csrfToken;
  return me;
}

/** Runs one synchronisation unless one is already running. */
export function syncNow(): Promise<void> {
  const { config } = useSync.getState();
  if (!deps || !config) return Promise.resolve();
  if (running) return running;
  const d = deps;
  const store = useSync.getState();
  running = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      store.setState({ status: 'offline' });
      return;
    }
    store.setState({ status: 'syncing' });
    try {
      if (config.auth === 'cookie') await checkCookieSession(config.url);
      const client = createSyncClient({
        repo: d.raw,
        transport: createHttpTransport(config.url, authOf(config)),
        hlc: d.hlc,
        deviceId: d.deviceId,
        state: createSettingsSyncStateStore(d.raw.settings, d.clock),
        ids: d.ids,
        clock: d.clock,
      });
      const report = await client.sync();
      store.setState({
        status: 'idle',
        lastSync: d.clock.now(),
        lastReport: report,
        error: undefined,
      });
      if (report.pulled > 0) useDataVersion.getState().bump();
    } catch (e) {
      const message = e instanceof HttpError ? e.code : e instanceof Error ? e.message : String(e);
      store.setState({ status: navigator.onLine ? 'error' : 'offline', error: message });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Same-origin (or CORS) connection with the browser's session cookie, or a single-user server. */
export async function connectWithSession(url: string): Promise<Me> {
  const me = await checkCookieSession(url);
  await saveConfig({ url, auth: 'cookie', email: me.user.email });
  void syncNow();
  return me;
}

export async function login(url: string, email: string, password: string): Promise<void> {
  const res = await api<{ csrfToken: string }>(url, '/auth/login', null, {
    body: { email, password },
  });
  csrfToken = res.csrfToken;
  await saveConfig({ url, auth: 'cookie', email });
  void syncNow();
}

export async function connectWithToken(url: string, token: string): Promise<void> {
  // A cheap authenticated read validates the token before saving it.
  await api(url, '/decks', { kind: 'bearer', token });
  await saveConfig({ url, auth: 'bearer', token });
  void syncNow();
}

export async function disconnect(): Promise<void> {
  const { config } = useSync.getState();
  if (config?.auth === 'cookie') {
    try {
      await api(
        config.url,
        '/auth/logout',
        { kind: 'cookie', csrfToken },
        { method: 'POST', body: {} },
      );
    } catch {
      // Already logged out or offline: forgetting the configuration is enough.
    }
  }
  await saveConfig(null);
}

/**
 * Starts automatic synchronisation: at startup, when the network comes back, every 5 minutes,
 * and a few seconds after local changes.
 */
export async function startSync(d: SyncDeps): Promise<void> {
  deps = d;
  const row = await d.raw.settings.get(CONFIG_KEY);
  const config = (row?.value ?? null) as SyncConfig | null;
  useSync.getState().setState({ config, status: config ? 'idle' : 'off' });
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => {
    void syncNow();
  });
  setInterval(() => {
    void syncNow();
  }, AUTO_INTERVAL_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  useDataVersion.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void syncNow();
    }, AFTER_CHANGE_DELAY_MS);
  });
  if (config) void syncNow();
}
