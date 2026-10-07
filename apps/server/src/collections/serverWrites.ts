import type { ImportBatch } from '@mnemo/core';
import type { Change } from '@mnemo/sync';
import type { UserCollection } from './registry';

/**
 * Collects entities written by the server itself (an import through the API) since `since` and
 * appends them to the change log, so the other devices receive them on their next pull.
 */
export async function recordServerWrites(
  c: UserCollection,
  since: number,
  batch?: ImportBatch,
): Promise<number> {
  const r = c.repo;
  const after = since - 1;
  // Media contents written by the import become downloadable by the sync clients.
  for (const m of await r.media.changedSince(after)) {
    const bytes = await r.media.getContent(m.id);
    if (bytes) await c.media.put(m.sha256, bytes);
  }
  const changes: Change[] = [
    ...(await r.noteTypes.changedSince(after)).map((data) => ({ kind: 'noteType' as const, data })),
    ...(await r.presets.changedSince(after)).map((data) => ({ kind: 'preset' as const, data })),
    ...(await r.decks.changedSince(after)).map((data) => ({ kind: 'deck' as const, data })),
    ...(await r.media.changedSince(after)).map((data) => ({ kind: 'media' as const, data })),
    ...(await r.notes.changedSince(after)).map((data) => ({ kind: 'note' as const, data })),
    ...(await r.cards.changedSince(after)).map((data) => ({ kind: 'card' as const, data })),
    ...(await r.settings.all())
      .filter((s) => s.updatedAt >= since)
      .map((data) => ({ kind: 'setting' as const, data })),
  ];
  if (batch) changes.push({ kind: 'importBatch', data: batch });
  if (changes.length === 0) return c.changeLog.lastSeq();
  return c.changeLog.append(changes);
}
