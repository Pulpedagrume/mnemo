/**
 * Minimal YAML emitter for the prompt examples (block style, 2-space indentation). Strings stay
 * plain when unambiguous, otherwise single-quoted (backslashes, e.g. LaTeX) or JSON-quoted.
 * The library code avoids a YAML dependency; tests parse the output with the `yaml` package.
 */

const RESERVED = /^(?:true|false|yes|no|on|off|null|~|[-+]?(?:\d[\d_]*)?\.?\d+(?:e[-+]?\d+)?|\.inf|\.nan)$/i;
/** Indicators that cannot start a plain scalar. */
const BAD_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/;

export function yamlString(value: string): string {
  const plain =
    value !== '' &&
    !BAD_START.test(value) &&
    !/\s$/.test(value) &&
    !value.includes(': ') &&
    !value.includes(' #') &&
    !value.endsWith(':') &&
    !/[\n\t\\"]/.test(value) &&
    !RESERVED.test(value);
  if (plain) return value;
  if (value.includes('\\') && !/[\n\t]/.test(value)) return `'${value.replace(/'/g, "''")}'`;
  return JSON.stringify(value);
}

function scalar(value: unknown): string {
  if (typeof value === 'string') return yamlString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'null';
}

/** Leading/trailing spaces, spaces before a line break, tabs or CR: not kept by a `|-` block. */
const BLOCK_UNSAFE = /^\s|[ \t]\n|\s$|[\t\r]/;

/** Multi-line text written as a literal block (`|-`): kept verbatim, no escaping. */
function isBlockText(value: string): boolean {
  return value.includes('\n') && !BLOCK_UNSAFE.test(value);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function emit(value: unknown, indent: string, lines: string[], firstPrefix?: string): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isObject(item) && Object.keys(item).length > 0) {
        emit(item, `${indent}  `, lines, `${indent}- `);
      } else if (Array.isArray(item)) {
        lines.push(`${indent}-`);
        emit(item, `${indent}  `, lines);
      } else {
        lines.push(`${indent}- ${scalar(item)}`);
      }
    }
    return;
  }
  if (!isObject(value)) return;
  let prefix = firstPrefix ?? indent;
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    if (Array.isArray(child) && child.length > 0) {
      lines.push(`${prefix}${key}:`);
      emit(child, `${indent}  `, lines);
    } else if (isObject(child) && Object.keys(child).length > 0) {
      lines.push(`${prefix}${key}:`);
      emit(child, `${indent}  `, lines);
    } else if (Array.isArray(child)) {
      lines.push(`${prefix}${key}: []`);
    } else if (isObject(child)) {
      lines.push(`${prefix}${key}: {}`);
    } else if (typeof child === 'string' && isBlockText(child)) {
      lines.push(`${prefix}${key}: |-`);
      for (const line of child.split('\n')) lines.push(line === '' ? '' : `${indent}  ${line}`);
    } else {
      lines.push(`${prefix}${key}: ${scalar(child)}`);
    }
    prefix = indent;
  }
}

/** YAML document for a JSON-like object. */
export function toYaml(value: Record<string, unknown>): string {
  const lines: string[] = [];
  emit(value, '', lines);
  return lines.join('\n');
}
