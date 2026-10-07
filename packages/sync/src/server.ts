import type { Repository } from '@mnemo/storage';
import { applyChanges } from './apply';
import { changeKey } from './merge';
import {
  PullRequestSchema,
  PushRequestSchema,
  type Change,
  type PullRequest,
  type PullResponse,
  type PushRequest,
  type PushResponse,
} from './protocol';

/**
 * Server side of docs/SYNC.md, independent of the storage engine. A real server implements
 * `ChangeLog` and `BatchRegistry` in the same database as the repository so that `applyPush`
 * (run inside `repo.transaction`) commits data, log entries and the batch id atomically.
 */

/** Numbered journal of merged changes (one per account). */
export interface ChangeLog {
  /** Appends changes and returns the sequence number of the last one. */
  append(changes: readonly Change[]): Promise<number>;
  /** Changes with `seq > cursor`, at most `limit`; `cursor` is the last seq returned. */
  since(cursor: number, limit: number): Promise<PullResponse>;
  /** Highest sequence number ever assigned (0 when empty). */
  lastSeq(): Promise<number>;
}

/** Responses of already applied push batches, for idempotent retries. */
export interface BatchRegistry {
  get(batchId: string): Promise<PushResponse | undefined>;
  put(batchId: string, res: PushResponse): Promise<void>;
}

/** Content-addressed media files. */
export interface MediaBlobStore {
  has(sha256: string): Promise<boolean>;
  get(sha256: string): Promise<Uint8Array | undefined>;
  put(sha256: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Applies a push: merges every change with the stored state, stores the result and appends the
 * merged versions that changed something to the change log. A batch id already seen returns the
 * recorded response without applying anything. `applied` counts the changes that modified state.
 */
export async function applyPush(
  repo: Repository,
  log: ChangeLog,
  batches: BatchRegistry,
  req: PushRequest,
): Promise<PushResponse> {
  const valid = PushRequestSchema.parse(req);
  return repo.transaction(async (tx) => {
    const prior = await batches.get(valid.batchId);
    if (prior) return prior;
    const { changed } = await applyChanges(tx, valid.changes);
    const cursor = changed.length > 0 ? await log.append(changed) : await log.lastSeq();
    const res: PushResponse = { applied: changed.length, cursor };
    await batches.put(valid.batchId, res);
    return res;
  });
}

export async function handlePull(log: ChangeLog, req: PullRequest): Promise<PullResponse> {
  const { cursor, limit } = PullRequestSchema.parse(req);
  return log.since(cursor, limit);
}

export async function handleMissingMedia(
  blobs: MediaBlobStore,
  sha256: readonly string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (const sha of new Set(sha256)) if (!(await blobs.has(sha))) missing.push(sha);
  return missing;
}

/**
 * In-memory change log. Entries are merged states, so a newer entry for the same entity supersedes
 * the older one: it is dropped (log compaction), which never loses information.
 */
export function createMemoryChangeLog(): ChangeLog & { size(): number } {
  let seq = 0;
  let entries: { seq: number; key: string; change: Change }[] = [];
  return {
    append(changes) {
      for (const change of changes) {
        const key = changeKey(change);
        entries = entries.filter((e) => e.key !== key);
        seq += 1;
        entries.push({ seq, key, change: structuredClone(change) });
      }
      return Promise.resolve(seq);
    },
    since(cursor, limit) {
      const after = entries.filter((e) => e.seq > cursor);
      const page = after.slice(0, Math.max(1, limit));
      const last = page[page.length - 1];
      return Promise.resolve({
        changes: page.map((e) => structuredClone(e.change)),
        cursor: last ? last.seq : Math.max(cursor, 0),
        hasMore: after.length > page.length,
      });
    },
    lastSeq: () => Promise.resolve(seq),
    size: () => entries.length,
  };
}

export function createMemoryBatchRegistry(): BatchRegistry {
  const map = new Map<string, PushResponse>();
  return {
    get: (id) => Promise.resolve(map.get(id)),
    put: (id, res) => {
      map.set(id, res);
      return Promise.resolve();
    },
  };
}

export function createMemoryMediaBlobs(): MediaBlobStore {
  const map = new Map<string, Uint8Array>();
  return {
    has: (sha) => Promise.resolve(map.has(sha)),
    get: (sha) => Promise.resolve(map.get(sha)?.slice()),
    put: (sha, bytes) => {
      map.set(sha, bytes.slice());
      return Promise.resolve();
    },
  };
}
