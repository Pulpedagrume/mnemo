/**
 * Template variables. Only the names of this whitelist are ever replaced, so cloze syntax such as
 * `{{c1::réponse}}` (or any other `{{…}}` text in a template, a deck name or a document excerpt)
 * is left untouched. The same names are used in French and English templates.
 */
export const PROMPT_VARIABLES = [
  'deck',
  'langue',
  'niveau',
  'densite',
  'nbChoix',
  'appName',
  'formatFence',
  'formatExt',
  'regleIndices',
  'regleExplications',
  'tailleLot',
  'n',
  'sections',
  'prefixe',
  'dernierUid',
  'continuation',
  'portee',
  'nbErreurs',
  'listeErreurs',
  'extraits',
  'specCompacte',
] as const;
export type PromptVariable = (typeof PROMPT_VARIABLES)[number];

export type TemplateValues = Partial<Record<PromptVariable, string | number>>;

/** `{{name}}` where name is a plain identifier: never matches `{{c1::…}}`. */
const PLACEHOLDER = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

function isPromptVariable(name: string): name is PromptVariable {
  return (PROMPT_VARIABLES as readonly string[]).includes(name);
}

/** Whitelisted variables used by a template, without duplicates, in order of appearance. */
export function promptVariables(template: string): PromptVariable[] {
  const found: PromptVariable[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? '';
    if (isPromptVariable(name) && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Every `{{identifier}}` placeholder still present in a text (whitelisted or not). Cloze
 * deletions (`{{c1::…}}`) are not placeholders. Used to check composed prompts.
 */
export function unresolvedPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[0]);
}

/**
 * Replaces whitelisted variables in a single pass: substituted values are never scanned again,
 * so a value containing `{{…}}` stays literal. Variables without a value are left in place.
 */
export function fillTemplate(template: string, values: TemplateValues): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    if (!isPromptVariable(name)) return whole;
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}
