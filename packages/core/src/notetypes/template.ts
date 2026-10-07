import { getField } from './builtins';
import { renderClozeBack, renderClozeFront } from './cloze';
import type { Problem } from './types';

/**
 * Mustache subset for custom card templates:
 * `{{Field}}`, `{{#Field}}…{{/Field}}`, `{{^Field}}…{{/Field}}`, `{{FrontSide}}`,
 * `{{cloze:Field}}`, `{{hint:Field}}` (-> `[[hint:Field]]` marker), `{{type:Field}}`
 * (-> `[[type:Field]]` marker). Field names are case-insensitive. No HTML escaping: fields are
 * Markdown and are sanitized when converted to HTML.
 */
type Node =
  | { t: 'text'; value: string }
  | { t: 'var'; name: string; filter: string }
  | { t: 'section'; name: string; inverted: boolean; children: Node[] };

const TAG_RE = /\{\{([#^/]?)\s*([^{}]*?)\s*\}\}/g;
const FRONT_SIDE = 'frontside';
const KNOWN_FILTERS = new Set(['', 'cloze', 'hint', 'type', 'text']);

interface Parsed {
  nodes: Node[];
  problems: Problem[];
}

function templateProblem(code: string, fr: string, en: string, offset: number): Problem {
  return { code, severity: 'error', message: { fr, en }, offset };
}

function splitFilter(raw: string): { filter: string; name: string } {
  const colon = raw.indexOf(':');
  if (colon < 0) return { filter: '', name: raw };
  return { filter: raw.slice(0, colon).trim().toLowerCase(), name: raw.slice(colon + 1).trim() };
}

function parseTemplate(src: string): Parsed {
  const root: Node[] = [];
  const problems: Problem[] = [];
  const stack: { name: string; parent: Node[]; offset: number }[] = [];
  let out = root;
  let last = 0;
  for (const m of src.matchAll(TAG_RE)) {
    const offset = m.index;
    if (offset > last) out.push({ t: 'text', value: src.slice(last, offset) });
    last = offset + m[0].length;
    const sigil = m[1] ?? '';
    const raw = m[2] ?? '';
    if (raw === '') {
      problems.push(
        templateProblem('empty_tag', 'Balise vide « {{}} ».', 'Empty tag "{{}}".', offset),
      );
      continue;
    }
    if (sigil === '#' || sigil === '^') {
      const children: Node[] = [];
      out.push({ t: 'section', name: raw, inverted: sigil === '^', children });
      stack.push({ name: raw, parent: out, offset });
      out = children;
    } else if (sigil === '/') {
      const top = stack[stack.length - 1];
      if (top?.name.toLowerCase() !== raw.toLowerCase()) {
        problems.push(
          templateProblem(
            'unexpected_close',
            `Fermeture « {{/${raw}}} » sans ouverture correspondante.`,
            `Closing tag "{{/${raw}}}" without a matching opening tag.`,
            offset,
          ),
        );
        continue;
      }
      stack.pop();
      out = top.parent;
    } else {
      const { filter, name } = splitFilter(raw);
      if (!KNOWN_FILTERS.has(filter)) {
        problems.push(
          templateProblem(
            'unknown_filter',
            `Filtre inconnu « ${filter}: » : le champ est affiché tel quel.`,
            `Unknown filter "${filter}:": the field is shown as is.`,
            offset,
          ),
        );
      }
      out.push({ t: 'var', name, filter });
    }
  }
  if (last < src.length) out.push({ t: 'text', value: src.slice(last) });
  for (const open of stack) {
    problems.push(
      templateProblem(
        'unclosed_section',
        `Section « {{#${open.name}}} » non fermée.`,
        `Unclosed section "{{#${open.name}}}".`,
        open.offset,
      ),
    );
  }
  return { nodes: root, problems };
}

export interface TemplateContext {
  /** Note fields (Markdown), looked up case-insensitively. */
  fields: Readonly<Record<string, string>>;
  side: 'front' | 'back';
  /** Rendered front, for `{{FrontSide}}` on the back. */
  frontSide?: string;
  /** Cloze number targeted by `{{cloze:Field}}` (default 1). */
  clozeNumber?: number;
}

function renderNodes(nodes: readonly Node[], ctx: TemplateContext): string {
  let out = '';
  for (const node of nodes) {
    if (node.t === 'text') {
      out += node.value;
    } else if (node.t === 'section') {
      const value =
        node.name.toLowerCase() === FRONT_SIDE
          ? (ctx.frontSide ?? '')
          : getField(ctx.fields, node.name);
      const filled = value.trim() !== '';
      if (filled !== node.inverted) out += renderNodes(node.children, ctx);
    } else {
      out += renderVar(node.name, node.filter, ctx);
    }
  }
  return out;
}

function renderVar(name: string, filter: string, ctx: TemplateContext): string {
  if (filter === '' && name.toLowerCase() === FRONT_SIDE) {
    return ctx.side === 'back' ? (ctx.frontSide ?? '') : '';
  }
  const value = getField(ctx.fields, name);
  switch (filter) {
    case 'cloze': {
      const n = ctx.clozeNumber ?? 1;
      return ctx.side === 'front' ? renderClozeFront(value, n) : renderClozeBack(value, n);
    }
    case 'hint':
      return value.trim() === '' ? '' : `[[hint:${name}]]`;
    case 'type':
      return `[[type:${name}]]`;
    default:
      return value;
  }
}

/** Renders a card template side. Unknown fields render empty. Never throws. */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  return renderNodes(parseTemplate(template).nodes, ctx);
}

export interface TemplateAnalysis {
  /** Field names referenced by the template, as first written, deduplicated case-insensitively. */
  fields: string[];
  /** Referenced fields missing from `knownFields` (empty when `knownFields` is not given). */
  unknown: string[];
  /** Fields used with `{{cloze:…}}`: such a note type yields one card per cloze number. */
  clozeFields: string[];
  usesFrontSide: boolean;
  problems: Problem[];
}

/** Lists the fields a template references and reports syntax problems and unknown fields. */
export function templateFields(
  template: string,
  knownFields?: readonly string[],
): TemplateAnalysis {
  const { nodes, problems } = parseTemplate(template);
  const fields: string[] = [];
  const clozeFields: string[] = [];
  let usesFrontSide = false;
  const add = (list: string[], name: string): void => {
    if (!list.some((f) => f.toLowerCase() === name.toLowerCase())) list.push(name);
  };
  const walk = (list: readonly Node[]): void => {
    for (const node of list) {
      if (node.t === 'text') continue;
      if (node.name.toLowerCase() === FRONT_SIDE && (node.t === 'section' || node.filter === '')) {
        usesFrontSide = true;
      } else {
        add(fields, node.name);
        if (node.t === 'var' && node.filter === 'cloze') add(clozeFields, node.name);
      }
      if (node.t === 'section') walk(node.children);
    }
  };
  walk(nodes);
  const known = knownFields?.map((f) => f.toLowerCase());
  const unknown = known ? fields.filter((f) => !known.includes(f.toLowerCase())) : [];
  return { fields, unknown, clozeFields, usesFrontSide, problems };
}
