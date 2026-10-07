import type { CustomStudy } from '@mnemo/services';

/** Encodes a custom study request into URL search params (selection uses a session key). */
export function encodeCustom(custom: CustomStudy): string {
  const p = new URLSearchParams({ mode: custom.kind });
  if (custom.kind === 'ahead' || custom.kind === 'mistakes') p.set('days', String(custom.days));
  if (custom.kind === 'tag') p.set('tag', custom.tag);
  if (custom.kind === 'selection') p.set('cards', custom.cardIds.join(','));
  return p.toString();
}

export function decodeCustom(params: URLSearchParams): CustomStudy | undefined {
  const days = Math.min(365, Math.max(1, Number(params.get('days')) || 7));
  switch (params.get('mode')) {
    case 'cram':
      return { kind: 'cram' };
    case 'ahead':
      return { kind: 'ahead', days };
    case 'mistakes':
      return { kind: 'mistakes', days };
    case 'tag': {
      const tag = params.get('tag');
      return tag ? { kind: 'tag', tag } : undefined;
    }
    case 'selection': {
      const cardIds = (params.get('cards') ?? '').split(',').filter(Boolean);
      return cardIds.length ? { kind: 'selection', cardIds } : undefined;
    }
    default:
      return undefined;
  }
}
