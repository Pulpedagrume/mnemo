import type { Clock, IdGenerator, Media } from '@mnemo/core';
import type { Repository } from '@mnemo/storage';
import { applyChanges } from './apply';
import { compareEncoded, isHlc, ZERO_HLC, type HlcClock } from './hlc';
import { DEFAULT_PULL_LIMIT, MAX_PUSH_BYTES, type Change, type SyncTransport } from './protocol';
import { SYNC_SETTINGS_PREFIX } from './stamp';
import { initialSyncState, type SyncState, type SyncStateStore } from './state';
import { jsonBytes } from './util';

export interface SyncReport {
  /** Changes sent (media metadata included). */
  pushed: number;
  /** Changes received. */
  pulled: number;
  /** Received changes where local data overrode part of the remote version. */
  conflicts: number;
  mediaUploaded: number;
  mediaDownloaded: number;
  durationMs: number;
}

export interface SyncClientOptions {
  /** Raw repository (not stamped): merged remote data must not be re-stamped. */
  repo: Repository;
  transport: SyncTransport;
  hlc: HlcClock;
  deviceId: string;
  state: SyncStateStore;
  /** Batch ids (UUIDv7). */
  ids: IdGenerator;
  clock: Clock;
  pullLimit?: number;
  /** Serialized size limit of a push batch (default: protocol maximum minus an envelope margin). */
  maxBatchBytes?: number;
}

export interface SyncClient {
  /** One full synchronisation: media, push, pull, media download (docs/SYNC.md order). */
  sync(): Promise<SyncReport>;
}

const MAX_CHANGES_PER_BATCH = 20_000;
const ENVELOPE_MARGIN = 4_096;

/** Splits changes into batches under `maxBytes` once serialized (a lone oversized change still goes). */
export function splitBatches(changes: readonly Change[], maxBytes: number): Change[][] {
  const batches: Change[][] = [];
  let current: Change[] = [];
  let size = 0;
  for (const c of changes) {
    const bytes = jsonBytes(c) + 1;
    if (
      current.length > 0 &&
      (size + bytes > maxBytes || current.length >= MAX_CHANGES_PER_BATCH)
    ) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(c);
    size += bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** HLC carried by a change, if any. */
function changeHlc(c: Change): string | undefined {
  return c.kind === 'setting' ? c.data.hlc : c.data.sync?.hlc;
}

/** Local changes since the last successful push, except media metadata (sent first). */
async function collectChanges(repo: Repository, st: SyncState): Promise<Change[]> {
  // `>= marker`: rewriting a change at the marker's millisecond is cheap (merges are idempotent).
  const since = st.lastPushUpdatedAt - 1;
  const hlcMark = st.lastPushHlc ?? ZERO_HLC;
  const newer = (h: string | undefined) => h !== undefined && compareEncoded(h, hlcMark) > 0;
  const out: Change[] = [];
  for (const data of await repo.decks.changedSince(since)) out.push({ kind: 'deck', data });
  for (const data of await repo.presets.changedSince(since)) out.push({ kind: 'preset', data });
  for (const data of await repo.noteTypes.changedSince(since)) out.push({ kind: 'noteType', data });
  for (const data of await repo.notes.changedSince(since)) out.push({ kind: 'note', data });
  for (const data of await repo.cards.changedSince(since)) out.push({ kind: 'card', data });
  for (const data of await repo.importBatches.list()) {
    if (newer(data.sync?.hlc)) out.push({ kind: 'importBatch', data });
  }
  for (const data of await repo.reviewLogs.changedSince(st.lastPushLogTs - 1)) {
    out.push({ kind: 'reviewLog', data });
  }
  for (const data of await repo.settings.all()) {
    if (!data.key.startsWith(SYNC_SETTINGS_PREFIX) && newer(data.hlc)) {
      out.push({ kind: 'setting', data });
    }
  }
  return out;
}

export function createSyncClient(opts: SyncClientOptions): SyncClient {
  const { repo, transport, hlc, deviceId, state, ids, clock } = opts;
  const pullLimit = opts.pullLimit ?? DEFAULT_PULL_LIMIT;
  const maxBytes = opts.maxBatchBytes ?? MAX_PUSH_BYTES - ENVELOPE_MARGIN;

  async function save(st: SyncState): Promise<void> {
    await state.save({ ...st, hlc: hlc.peek() });
  }

  /** Sends `changes` in batches; each batch is persisted first so a retry reuses its id. */
  async function pushAll(st: SyncState, changes: readonly Change[]): Promise<void> {
    for (const batch of splitBatches(changes, maxBytes)) {
      st.pendingBatch = { batchId: ids(), deviceId: st.deviceId, changes: batch };
      await save(st);
      await flushPending(st);
    }
  }

  async function flushPending(st: SyncState): Promise<void> {
    if (!st.pendingBatch) return;
    await transport.push(st.pendingBatch);
    delete st.pendingBatch;
    await save(st);
  }

  async function uploadMedia(media: readonly Media[]): Promise<number> {
    const live = media.filter((m) => m.deletedAt === undefined);
    if (live.length === 0) return 0;
    const missing = new Set(await transport.missingMedia([...new Set(live.map((m) => m.sha256))]));
    let uploaded = 0;
    for (const m of live) {
      if (!missing.has(m.sha256)) continue;
      const bytes = await repo.media.getContent(m.id);
      if (bytes === undefined) continue;
      await transport.uploadMedia(m.sha256, bytes);
      missing.delete(m.sha256);
      uploaded++;
    }
    return uploaded;
  }

  async function pull(st: SyncState, report: SyncReport): Promise<Media[]> {
    const media: Media[] = [];
    for (;;) {
      const page = await transport.pull({ cursor: st.cursor, limit: pullLimit });
      for (const c of page.changes) {
        const h = changeHlc(c);
        if (h !== undefined && isHlc(h)) hlc.receive(h);
        if (c.kind === 'media') media.push(c.data);
      }
      const { conflicts } = await repo.transaction((tx) => applyChanges(tx, page.changes));
      report.pulled += page.changes.length;
      report.conflicts += conflicts;
      st.cursor = Math.max(st.cursor, page.cursor);
      await save(st);
      if (!page.hasMore || page.changes.length === 0) return media;
    }
  }

  async function downloadMedia(media: readonly Media[]): Promise<number> {
    let downloaded = 0;
    for (const m of media) {
      const [local] = await repo.media.getRaw([m.id]);
      if (local?.deletedAt !== undefined) continue;
      if ((await repo.media.getContent(m.id)) !== undefined) continue;
      const bytes = await transport.downloadMedia(m.sha256);
      if (bytes === undefined) continue;
      await repo.media.putContent(m.id, bytes);
      downloaded++;
    }
    return downloaded;
  }

  return {
    async sync() {
      const started = clock.now();
      const report: SyncReport = {
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        mediaUploaded: 0,
        mediaDownloaded: 0,
        durationMs: 0,
      };
      const st = (await state.load()) ?? initialSyncState(deviceId);
      await flushPending(st);

      // Markers are read before collecting: anything written later is sent next time.
      const markMs = clock.now();
      const markHlc = hlc.now();

      // 1. media metadata, then the missing contents.
      const media = await repo.media.changedSince(st.lastPushUpdatedAt - 1);
      await pushAll(
        st,
        media.map((data) => ({ kind: 'media', data })),
      );
      report.mediaUploaded = await uploadMedia(media);

      // 2. everything else.
      const changes = await collectChanges(repo, st);
      await pushAll(st, changes);
      report.pushed = media.length + changes.length;
      st.lastPushUpdatedAt = markMs;
      st.lastPushLogTs = markMs;
      st.lastPushHlc = markHlc;
      await save(st);

      // 3. pull until done, 4. missing media contents.
      const pulledMedia = await pull(st, report);
      report.mediaDownloaded = await downloadMedia(pulledMedia);
      report.durationMs = clock.now() - started;
      return report;
    },
  };
}
