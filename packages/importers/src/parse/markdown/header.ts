export interface BlockHeader {
  type: string;
  attrs: Record<string, unknown>;
  /** Unparsed text left in the header. */
  junk: string[];
  /** The header was not written exactly `::: type` (one space). */
  spacing: boolean;
}

const ATTR = /([A-Za-z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|“([^”]*)”|(\S+))/g;
const BOOLEAN_ATTRS = new Set([
  'caseSensitive',
  'ignoreAccents',
  'shuffle',
  'ordered',
  'needsReview',
]);

function convert(key: string, value: string): unknown {
  if (BOOLEAN_ATTRS.has(key) && (value === 'true' || value === 'false')) return value === 'true';
  if (key === 'difficulty' && /^\d+$/.test(value)) return Number(value);
  return value;
}

/** Parses the text after `:::` on a block opening line: `type key=value key="v w"…`. */
export function parseHeader(header: string, defaultType: string | undefined): BlockHeader {
  const spacing = !/^ \S/.test(header);
  const trimmed = header.trim();
  const first = /^\S+/.exec(trimmed)?.[0] ?? '';
  const hasType = first !== '' && !first.includes('=');
  const type = hasType ? first : (defaultType ?? '');
  const rest = hasType ? trimmed.slice(first.length) : trimmed;
  const attrs: Record<string, unknown> = {};
  const leftover = rest.replace(
    ATTR,
    (_m, key: string, dq?: string, sq?: string, smart?: string, bare?: string) => {
      const raw = dq !== undefined ? dq.replace(/\\(.)/g, '$1') : (sq ?? smart ?? bare ?? '');
      attrs[key] = convert(key, raw);
      return ' ';
    },
  );
  const junk = leftover.trim() === '' ? [] : [leftover.trim().replace(/\s+/g, ' ')];
  return { type, attrs, junk, spacing };
}
