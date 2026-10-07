import type { Repository } from '@mnemo/storage';
import type { SyncTransport } from './protocol';
import {
  applyPush,
  createMemoryBatchRegistry,
  createMemoryChangeLog,
  createMemoryMediaBlobs,
  handleMissingMedia,
  handlePull,
  type BatchRegistry,
  type ChangeLog,
  type MediaBlobStore,
} from './server';

export interface InProcessServer extends SyncTransport {
  repo: Repository;
  log: ChangeLog;
  batches: BatchRegistry;
  blobs: MediaBlobStore;
}

/**
 * A sync server living in the same process, used as a `SyncTransport` by tests and by tools that
 * sync two local collections. Requests and responses are deep-copied, as over a network.
 */
export function createInProcessServer(opts: {
  repo: Repository;
  log?: ChangeLog;
  batches?: BatchRegistry;
  blobs?: MediaBlobStore;
}): InProcessServer {
  const log = opts.log ?? createMemoryChangeLog();
  const batches = opts.batches ?? createMemoryBatchRegistry();
  const blobs = opts.blobs ?? createMemoryMediaBlobs();
  const { repo } = opts;
  return {
    repo,
    log,
    batches,
    blobs,
    pull: async (req) => structuredClone(await handlePull(log, structuredClone(req))),
    push: async (req) => structuredClone(await applyPush(repo, log, batches, structuredClone(req))),
    missingMedia: (sha256) => handleMissingMedia(blobs, sha256),
    uploadMedia: (sha256, bytes) => blobs.put(sha256, bytes),
    downloadMedia: (sha256) => blobs.get(sha256),
  };
}
