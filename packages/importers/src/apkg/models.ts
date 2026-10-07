import { fieldKey } from '@mnemo/core';
import { ankiHtmlToMarkdown } from './html';

/** Anki note type ("model") as stored in `col.models` (only the keys we read). */
export interface AnkiModel {
  id: string;
  name: string;
  /** 0 = standard, 1 = cloze. */
  type: number;
  fields: string[];
  templates: { name: string; qfmt: string; afmt: string }[];
  css: string;
}

export type ModelKind = 'basic' | 'basic_reversed' | 'typed' | 'cloze' | 'custom';

export interface ClassifiedModel {
  model: AnkiModel;
  kind: ModelKind;
  /** Custom type id (without `custom:`), for `custom` models. */
  customId?: string;
  /** Converted templates, for `custom` models. */
  templates?: { name: string; front: string; back: string }[];
  /** Filters and special fields removed from the templates. */
  removedFilters: string[];
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const byOrd = (a: Record<string, unknown>, b: Record<string, unknown>): number =>
  Number(a.ord ?? 0) - Number(b.ord ?? 0);

/** Parses `col.models` (JSON object keyed by model id). Malformed models are skipped. */
export function parseModels(json: string): Map<string, AnkiModel> {
  const out = new Map<string, AnkiModel>();
  const raw: unknown = JSON.parse(json);
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value) || !Array.isArray(value.flds) || !Array.isArray(value.tmpls)) continue;
    const flds = value.flds.filter(isRecord).sort(byOrd);
    const tmpls = value.tmpls.filter(isRecord).sort(byOrd);
    const id = String(
      typeof value.id === 'number' || typeof value.id === 'string' ? value.id : key,
    );
    out.set(id, {
      id,
      name: str(value.name, `Anki ${id}`).trim() || `Anki ${id}`,
      type: Number(value.type ?? 0),
      fields: flds.map((f, i) => str(f.name).trim() || `Field ${i + 1}`),
      templates: tmpls.map((t, i) => ({
        name: str(t.name).trim() || `Card ${i + 1}`,
        qfmt: str(t.qfmt),
        afmt: str(t.afmt),
      })),
      css: str(value.css),
    });
  }
  return out;
}

const TAG = /\{\{([#^/]?)\s*([^{}]*?)\s*\}\}/g;

interface VarRef {
  filters: string[];
  name: string;
}

function refs(fmt: string): VarRef[] {
  const out: VarRef[] = [];
  for (const m of fmt.matchAll(TAG)) {
    if (m[1] !== '') continue;
    const parts = (m[2] ?? '').split(':');
    const name = (parts.pop() ?? '').trim();
    out.push({ filters: parts.map((p) => p.trim().toLowerCase()), name });
  }
  return out;
}

const same = (a: string, b: string | undefined): boolean =>
  b !== undefined && a.toLowerCase() === b.toLowerCase();

/** True when `fmt` only displays `field` (plus FrontSide), without filters. */
function onlyShows(fmt: string, field: string | undefined, allowFrontSide: boolean): boolean {
  const r = refs(fmt).filter((x) => !(allowFrontSide && same(x.name, 'FrontSide')));
  return r.length > 0 && r.every((x) => x.filters.length === 0 && same(x.name, field));
}

function classifyStandard(m: AnkiModel): ModelKind | undefined {
  if (m.fields.length !== 2) return undefined;
  const [f0, f1] = m.fields;
  const [t0, t1] = m.templates;
  if (!t0 || !onlyShows(t0.qfmt, f0, false)) {
    // "Basic (type in the answer)": {{Front}} {{type:Back}} / {{FrontSide}} … {{Back}}
    const q = t0 ? refs(t0.qfmt) : [];
    const typed =
      m.templates.length === 1 &&
      q.length === 2 &&
      q.some((x) => x.filters.length === 0 && same(x.name, f0)) &&
      q.some((x) => x.filters.join(':') === 'type' && same(x.name, f1));
    return typed ? 'typed' : undefined;
  }
  if (!onlyShows(t0.afmt, f1, true)) return undefined;
  if (m.templates.length === 1) return 'basic';
  if (m.templates.length === 2 && t1 && onlyShows(t1.qfmt, f1, false)) return 'basic_reversed';
  return undefined;
}

const SUPPORTED_FILTERS = ['cloze', 'type', 'hint', 'text'] as const;
const SPECIAL_FIELDS = new Set(['tags', 'deck', 'subdeck', 'card', 'type', 'cardflag', 'cardid']);

/** Anki template → Mnemo template (Mustache subset, Markdown body). */
export function convertTemplate(
  fmt: string,
  fields: readonly string[],
  removed: Set<string>,
): string {
  const known = new Set(fields.map(fieldKey));
  const placeholders: string[] = [];
  const protect = (tag: string): string => {
    placeholders.push(tag);
    return `${placeholders.length - 1}`;
  };
  const masked = fmt.replace(TAG, (_all, sigil: string, body: string) => {
    if (sigil !== '') return protect(`{{${sigil}${body}}}`);
    const parts = body.split(':');
    const name = (parts.pop() ?? '').trim();
    const filters = parts.map((p) => p.trim().toLowerCase()).filter((f) => f !== '');
    if (same(name, 'FrontSide')) return protect('{{FrontSide}}');
    if (!known.has(fieldKey(name)) && SPECIAL_FIELDS.has(name.toLowerCase())) {
      removed.add(`{{${name}}}`);
      return '';
    }
    const kept = SUPPORTED_FILTERS.find((f) => filters.includes(f));
    for (const f of filters) if (f !== kept) removed.add(`${f}:`);
    return protect(kept ? `{{${kept}:${name}}}` : `{{${name}}}`);
  });
  const md = ankiHtmlToMarkdown(masked, () => undefined).text;
  return md.replace(/(\d+)/g, (_all, i: string) => placeholders[Number(i)] ?? '');
}

/** Stable custom type id from the Anki model: `anki-<name-slug>-<modelId>` (≤ 64 chars). */
export function customTypeId(m: AnkiModel): string {
  const slugged = m.name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 30);
  const id = m.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  return ['anki', slugged, id].filter((p) => p !== '').join('-');
}

export function classifyModel(m: AnkiModel): ClassifiedModel {
  if (m.type === 1) return { model: m, kind: 'cloze', removedFilters: [] };
  const kind = classifyStandard(m);
  if (kind) return { model: m, kind, removedFilters: [] };
  const removed = new Set<string>();
  const templates = (
    m.templates.length > 0
      ? m.templates
      : [{ name: 'Card 1', qfmt: `{{${m.fields[0] ?? ''}}}`, afmt: '{{FrontSide}}' }]
  ).map((t) => ({
    name: t.name,
    front: convertTemplate(t.qfmt, m.fields, removed),
    back: convertTemplate(t.afmt, m.fields, removed),
  }));
  return {
    model: m,
    kind: 'custom',
    customId: customTypeId(m),
    templates,
    removedFilters: [...removed],
  };
}
