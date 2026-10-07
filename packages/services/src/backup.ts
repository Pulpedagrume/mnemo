import JSZip from 'jszip';
import { z } from 'zod';
import {
  APP_NAME,
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
import type { ServiceContext } from './context';

export const BACKUP_FORMAT = 'mnemo-backup/1';

const BackupDataSchema = z.object({
  decks: z.array(DeckSchema),
  presets: z.array(PresetSchema),
  noteTypes: z.array(NoteTypeSchema),
  notes: z.array(NoteSchema),
  cards: z.array(CardSchema),
  reviewLogs: z.array(ReviewLogSchema),
  media: z.array(MediaSchema),
  settings: z.array(SettingRowSchema),
  importBatches: z.array(ImportBatchSchema),
});
export type BackupData = z.infer<typeof BackupDataSchema>;

const BackupManifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  app: z.string(),
  createdAt: z.number().int(),
  data: BackupDataSchema,
});

/** Every record of the collection, tombstones included, for a full backup. */
export async function collectBackupData(ctx: ServiceContext): Promise<BackupData> {
  const r = ctx.repo;
  return {
    decks: await r.decks.changedSince(-1),
    presets: await r.presets.changedSince(-1),
    noteTypes: await r.noteTypes.changedSince(-1),
    notes: await r.notes.changedSince(-1),
    cards: await r.cards.changedSince(-1),
    reviewLogs: await r.reviewLogs.between(0, Number.MAX_SAFE_INTEGER),
    media: await r.media.changedSince(-1),
    settings: await r.settings.all(),
    importBatches: await r.importBatches.list(),
  };
}

/** Full backup as a zip: `backup.json` plus `media/<id>` files. */
export async function createBackupZip(ctx: ServiceContext): Promise<Uint8Array> {
  const data = await collectBackupData(ctx);
  const zip = new JSZip();
  zip.file(
    'backup.json',
    JSON.stringify({ format: BACKUP_FORMAT, app: APP_NAME, createdAt: ctx.clock.now(), data }),
  );
  for (const m of data.media) {
    const content = await ctx.repo.media.getContent(m.id);
    if (content) zip.file(`media/${m.id}`, content);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  await ctx.repo.settings.put({
    key: 'lastBackupAt',
    value: ctx.clock.now(),
    updatedAt: ctx.clock.now(),
  });
  return bytes;
}

export class BackupError extends Error {
  constructor(
    readonly code: 'not-a-zip' | 'missing-manifest' | 'invalid-manifest' | 'too-large',
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

const MAX_ENTRIES = 100_000;
const MAX_UNCOMPRESSED = 2 * 1024 ** 3;

/** Reads and validates a backup zip without touching the collection. */
export async function readBackupZip(
  bytes: Uint8Array,
): Promise<{ data: BackupData; createdAt: number; media: Map<string, Uint8Array> }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new BackupError('not-a-zip', 'The file is not a valid zip archive');
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRIES) throw new BackupError('too-large', 'Too many files in backup');
  const manifestFile = zip.file('backup.json');
  if (!manifestFile) throw new BackupError('missing-manifest', 'backup.json not found');
  const parsed = BackupManifestSchema.safeParse(JSON.parse(await manifestFile.async('string')));
  if (!parsed.success) throw new BackupError('invalid-manifest', parsed.error.message);
  const media = new Map<string, Uint8Array>();
  let total = 0;
  for (const m of parsed.data.data.media) {
    const file = zip.file(`media/${m.id}`);
    if (!file) continue;
    const content = await file.async('uint8array');
    total += content.byteLength;
    if (total > MAX_UNCOMPRESSED) throw new BackupError('too-large', 'Backup media too large');
    media.set(m.id, content);
  }
  return { data: parsed.data.data, createdAt: parsed.data.createdAt, media };
}

/** Replaces the whole collection with the backup's content, atomically. */
export async function restoreBackupZip(
  ctx: ServiceContext,
  bytes: Uint8Array,
): Promise<BackupData> {
  const { data, media } = await readBackupZip(bytes);
  await ctx.repo.clear();
  await ctx.repo.transaction(async (tx) => {
    await tx.decks.putMany(data.decks);
    await tx.presets.putMany(data.presets);
    await tx.noteTypes.putMany(data.noteTypes);
    await tx.notes.putMany(data.notes);
    await tx.cards.putMany(data.cards);
    await tx.reviewLogs.addMany(data.reviewLogs);
    await tx.media.putMany(data.media);
    for (const [id, content] of media) await tx.media.putContent(id, content);
    // Sync state (device id, cursor) belongs to the device that made the backup: never restore it.
    for (const row of data.settings) if (!row.key.startsWith('sync.')) await tx.settings.put(row);
    for (const batch of data.importBatches) await tx.importBatches.put(batch);
  });
  return data;
}
