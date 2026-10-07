import { createIdGenerator, manualClock, seededRng, type ManualClock } from '@mnemo/core';
import { createMemoryRepository, type Repository } from '@mnemo/storage';
// Tests drive real use cases through @mnemo/services (a dev dependency only).
import { createServiceContext, ensureCollection, type ServiceContext } from '@mnemo/services';
import { createSyncClient, type SyncClient } from '../client';
import { createHlcClock, type HlcClock } from '../hlc';
import { createInProcessServer, type InProcessServer } from '../inProcess';
import type { SyncTransport } from '../protocol';
import { withSyncStamps } from '../stamp';
import {
  createMemorySyncStateStore,
  createSettingsSyncStateStore,
  type SyncStateStore,
} from '../state';

export const T = Date.UTC(2026, 9, 7, 8);

type Op = 'push' | 'pull';

/** Transport wrapper that can fail the next call, before or after the server handled it. */
export interface FaultyTransport extends SyncTransport {
  failNext(op: Op, when: 'before' | 'after', after?: number): void;
  calls: Record<Op, number>;
}

export function faulty(inner: SyncTransport): FaultyTransport {
  const plans: { op: Op; when: 'before' | 'after'; skip: number }[] = [];
  const calls: Record<Op, number> = { push: 0, pull: 0 };
  async function guard<R>(op: Op, run: () => Promise<R>): Promise<R> {
    calls[op] += 1;
    const i = plans.findIndex((p) => p.op === op);
    const plan = plans[i];
    if (!plan || plan.skip-- > 0) return run();
    plans.splice(i, 1);
    if (plan.when === 'before') throw new Error(`network down before ${op}`);
    await run();
    throw new Error(`network down after ${op}`);
  }
  return {
    calls,
    failNext: (op, when, after = 0) => plans.push({ op, when, skip: after }),
    pull: (req) => guard('pull', () => inner.pull(req)),
    push: (req) => guard('push', () => inner.push(req)),
    missingMedia: (sha) => inner.missingMedia(sha),
    uploadMedia: (sha, bytes) => inner.uploadMedia(sha, bytes),
    downloadMedia: (sha) => inner.downloadMedia(sha),
  };
}

export interface Device {
  clock: ManualClock;
  raw: Repository;
  repo: Repository;
  hlc: HlcClock;
  ctx: ServiceContext;
  transport: FaultyTransport;
  state: SyncStateStore;
  client: SyncClient;
}

export function makeDevice(
  server: InProcessServer,
  name: string,
  opts: { start?: number; seed?: number; pullLimit?: number; settingsState?: boolean } = {},
): Device {
  const clock = manualClock(opts.start ?? T);
  const raw = createMemoryRepository();
  const hlc = createHlcClock(clock, name);
  const repo = withSyncStamps(raw, hlc);
  const rng = seededRng(opts.seed ?? name.length);
  const ctx = createServiceContext({ repo, clock, rng, deviceTimeZone: 'Europe/Paris' });
  const transport = faulty(server);
  const state = opts.settingsState
    ? createSettingsSyncStateStore(raw.settings, clock)
    : createMemorySyncStateStore();
  const client = createSyncClient({
    repo: raw,
    transport,
    hlc,
    deviceId: name,
    state,
    ids: createIdGenerator(clock, seededRng((opts.seed ?? 1) + 100)),
    clock,
    ...(opts.pullLimit === undefined ? {} : { pullLimit: opts.pullLimit }),
  });
  return { clock, raw, repo, hlc, ctx, transport, state, client };
}

/** A server and two devices sharing one bootstrapped collection. */
export async function twoDevices(opts: { pullLimit?: number; skewB?: number } = {}) {
  const server = createInProcessServer({ repo: createMemoryRepository() });
  const a = makeDevice(server, 'A', { seed: 1, settingsState: true });
  const b = makeDevice(server, 'B', {
    seed: 2,
    start: T + (opts.skewB ?? 0),
    ...(opts.pullLimit === undefined ? {} : { pullLimit: opts.pullLimit }),
  });
  await ensureCollection(a.ctx, 'fr');
  await a.client.sync();
  await b.client.sync();
  await ensureCollection(b.ctx, 'fr');
  return { server, a, b };
}

/** Advances every clock and syncs devices in order. */
export async function syncAll(...devices: Device[]): Promise<void> {
  for (const d of devices) {
    d.clock.advance(1_000);
    await d.client.sync();
  }
}
