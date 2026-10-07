import type { Note } from '@mnemo/core';

const UID_RE = /^[A-Za-z0-9._:-]{1,64}$/;
/** Prefix of the guids written by the Mnemo exporter for notes that have a uid. */
export const MNEMO_GUID_PREFIX = 'mnemo:';

/**
 * Stable uid from an Anki guid: `anki-<guid>` (hex-encoded when the guid has characters a uid
 * cannot hold). Guids written by the Mnemo exporter give back the original uid.
 */
export function uidFromGuid(guid: string): string {
  const own = guid.slice(MNEMO_GUID_PREFIX.length);
  if (guid.startsWith(MNEMO_GUID_PREFIX) && UID_RE.test(own)) return own;
  const plain = `anki-${guid}`;
  if (UID_RE.test(plain)) return plain;
  const hex = Array.from(guid, (c) => (c.codePointAt(0) ?? 0).toString(16).padStart(4, '0'));
  return `anki-x${hex.join('')}`.slice(0, 64);
}

/** Anki guid of an exported note: the original guid for Anki-imported notes, else from the uid/id. */
export function guidFor(note: Pick<Note, 'id' | 'uid'>): string {
  const uid = note.uid;
  if (uid === undefined) return note.id;
  if (/^anki-x([0-9a-f]{4})+$/.test(uid))
    return (uid.slice(6).match(/.{4}/g) ?? [])
      .map((h) => String.fromCodePoint(parseInt(h, 16)))
      .join('');
  if (uid.startsWith('anki-')) return uid.slice(5);
  return `${MNEMO_GUID_PREFIX}${uid}`;
}
