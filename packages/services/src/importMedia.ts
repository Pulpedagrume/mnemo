import type { Id, Media } from '@mnemo/core';
import type { ImportParseResult } from '@mnemo/importers';
import type { Stores } from '@mnemo/storage';
import type { ServiceContext } from './context';
import type { NoteInput } from './notes';

export interface MediaPayload {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}

// Available in browsers and Node ≥ 20; typed locally because services do not use the DOM lib.
declare const crypto: { subtle: { digest(alg: string, data: Uint8Array): Promise<ArrayBuffer> } };
declare function atob(data: string): string;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decodes a `data:<mime>;base64,<payload>` URI. */
export function decodeDataUri(uri: string): MediaPayload | undefined {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(uri);
  if (!m?.[1] || !m[2]) return undefined;
  const bin = atob(m[2].replace(/\s+/g, ''));
  return { mime: m[1], bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
}

/**
 * Stores the declared media for which content is available (bundle files or data: URIs),
 * deduplicated by SHA-256. Returns import id → stored media id, used to rewrite references.
 */
export async function importMedia(
  ctx: ServiceContext,
  tx: Stores,
  declared: ImportParseResult['media'],
  provided: ReadonlyMap<string, MediaPayload>,
): Promise<Map<string, Id>> {
  const ids = new Map<string, Id>();
  for (const decl of declared) {
    const payload = provided.get(decl.id) ?? (decl.data ? decodeDataUri(decl.data) : undefined);
    if (!payload) continue;
    const sha = await sha256Hex(payload.bytes);
    const existing = await tx.media.getBySha(sha);
    if (existing) {
      ids.set(decl.id, existing.id);
      continue;
    }
    const now = ctx.clock.now();
    const media: Media = {
      id: ctx.newId(),
      sha256: sha,
      mime: payload.mime,
      size: payload.bytes.byteLength,
      name: payload.name ?? decl.file?.split('/').pop() ?? decl.id,
      createdAt: now,
      updatedAt: now,
    };
    if (decl.alt) media.alt = decl.alt;
    await tx.media.put(media);
    await tx.media.putContent(media.id, payload.bytes);
    ids.set(decl.id, media.id);
  }
  return ids;
}

const MEDIA_REF = /media:([A-Za-z0-9._-]{1,64})/g;

/** Rewrites `media:<importId>` references in every text of a note to the stored media ids. */
export function rewriteMediaRefs(input: NoteInput, ids: ReadonlyMap<string, Id>): NoteInput {
  if (ids.size === 0) return input;
  const fix = (s: string) =>
    s.replace(MEDIA_REF, (all, id: string) => {
      const stored = ids.get(id);
      return stored ? `media:${stored}` : all;
    });
  const out: NoteInput = {
    ...input,
    fields: Object.fromEntries(Object.entries(input.fields).map(([k, v]) => [k, fix(v)])),
    hints: input.hints.map(fix),
  };
  if (input.explanation) out.explanation = fix(input.explanation);
  return out;
}
