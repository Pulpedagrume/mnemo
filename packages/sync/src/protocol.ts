import { z } from 'zod';
import {
  CardSchema,
  DeckSchema,
  ImportBatchSchema,
  MediaSchema,
  NoteSchema,
  NoteTypeSchema,
  PresetSchema,
  ReviewLogSchema,
  SettingRowSchema,
} from '@mnemo/core';

/** Wire protocol of docs/SYNC.md. Validated with the same Zod schemas on both sides. */

export const SYNC_PROTOCOL_VERSION = 1;
export const MAX_PUSH_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PULL_LIMIT = 1_000;

export const ChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('deck'), data: DeckSchema }),
  z.object({ kind: z.literal('preset'), data: PresetSchema }),
  z.object({ kind: z.literal('noteType'), data: NoteTypeSchema }),
  z.object({ kind: z.literal('note'), data: NoteSchema }),
  z.object({ kind: z.literal('card'), data: CardSchema }),
  z.object({ kind: z.literal('reviewLog'), data: ReviewLogSchema }),
  z.object({ kind: z.literal('media'), data: MediaSchema }),
  z.object({ kind: z.literal('setting'), data: SettingRowSchema }),
  z.object({ kind: z.literal('importBatch'), data: ImportBatchSchema }),
]);
export type Change = z.infer<typeof ChangeSchema>;
export type ChangeKind = Change['kind'];

export const PullRequestSchema = z.object({
  cursor: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(5_000).default(DEFAULT_PULL_LIMIT),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

export interface PullResponse {
  changes: Change[];
  /** Last change sequence number included (pass it back as `cursor`). */
  cursor: number;
  hasMore: boolean;
}

export const PushRequestSchema = z.object({
  batchId: z.string().min(1).max(64),
  deviceId: z.string().min(1).max(64),
  changes: z.array(ChangeSchema).max(20_000),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

export interface PushResponse {
  applied: number;
  cursor: number;
}

export const MediaMissingRequestSchema = z.object({
  sha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(10_000),
});

/** How a client talks to a server; HTTP in apps, in-process in tests. */
export interface SyncTransport {
  pull(req: PullRequest): Promise<PullResponse>;
  push(req: PushRequest): Promise<PushResponse>;
  missingMedia(sha256: string[]): Promise<string[]>;
  uploadMedia(sha256: string, bytes: Uint8Array): Promise<void>;
  downloadMedia(sha256: string): Promise<Uint8Array | undefined>;
}
