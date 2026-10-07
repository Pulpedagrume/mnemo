import type { Card, ImportBatch } from '@mnemo/core';
import type { ApkgScheduleEntry } from '@mnemo/importers';
import type { ServiceContext } from './context';

/**
 * Applies the scheduling read from an Anki package (`readApkg(…, { withScheduling: true })`)
 * to the cards of the notes CREATED by an import batch. Notes updated by the import keep their
 * own scheduling, like any re-import. Returns the number of cards changed.
 */
export async function applyApkgScheduling(
  ctx: ServiceContext,
  batch: Pick<ImportBatch, 'noteIds' | 'previousVersions'>,
  scheduling: ReadonlyMap<string, readonly ApkgScheduleEntry[]>,
): Promise<number> {
  if (scheduling.size === 0) return 0;
  const updated = new Set(batch.previousVersions.map((n) => n.id));
  const created = batch.noteIds.filter((id) => !updated.has(id));
  if (created.length === 0) return 0;
  return ctx.repo.transaction(async (tx) => {
    const now = ctx.clock.now();
    const notes = (await tx.notes.getMany(created)).filter((n) => n !== undefined);
    const uidByNote = new Map(notes.flatMap((n) => (n.uid ? [[n.id, n.uid] as const] : [])));
    const changed: Card[] = [];
    for (const card of await tx.cards.byNote([...uidByNote.keys()])) {
      const uid = uidByNote.get(card.noteId);
      const entry = uid ? scheduling.get(uid)?.find((e) => e.ord === card.ord) : undefined;
      if (!entry || card.deletedAt !== undefined) continue;
      // A new Anki card only carries its suspension: the card keeps its own new-card memory.
      const memory = entry.memory.state === 'new' ? {} : entry.memory;
      const next: Card = { ...card, ...memory, updatedAt: now };
      if (entry.suspended) next.suspended = true;
      changed.push(next);
    }
    if (changed.length > 0) await tx.cards.putMany(changed);
    return changed.length;
  });
}
