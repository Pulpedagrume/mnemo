/**
 * Generated parts of docs/AI_PROMPTS.md (templates verbatim, variable values, a composed
 * prompt), between `<!-- generated:<name>:start -->` and `<!-- generated:<name>:end -->`
 * markers. Refreshed by `pnpm --filter @mnemo/prompts templates`; a test checks the content.
 */
import type { Locale } from '@mnemo/core';
import { buildPrompt, fence } from '../src/build';
import { DENSITIES, DOCUMENT_TYPES, LEVELS } from '../src/options';
import {
  DOCUMENT_TYPE_ADVICE,
  EXPLANATION_RULE,
  FIX_SCOPE,
  HINT_RULE,
  LEVEL_LABELS,
  densityPhrase,
} from '../src/phrases';
import { PROMPT_TASKS } from '../src/tasks';
import type { TemplateName } from '../src/templates.generated';
import { TEMPLATES } from '../src/templates.generated';

/** Reading order of the templates in the documentation. */
export const DOC_TEMPLATE_ORDER: readonly TemplateName[] = [
  'role',
  ...PROMPT_TASKS.filter((t) => t.kind === 'composed').map((t) => t.template),
  'quality-rules',
  'output-constraints',
  'self-check',
  'long-document',
  'document',
  'variant-quality-rule1',
  'variant-self-check5',
  'variant-output-audit',
  'plan',
  'batch',
  'continue',
  'fix',
];

const TITLES: Partial<Record<TemplateName, Readonly<Record<Locale, string>>>> = {
  role: { fr: 'Bloc 1 · RÔLE', en: 'Block 1 · ROLE' },
  'quality-rules': { fr: 'Bloc 4 · RÈGLES DE QUALITÉ', en: 'Block 4 · QUALITY RULES' },
  'output-constraints': { fr: 'Bloc 5 · CONTRAINTES DE SORTIE', en: 'Block 5 · OUTPUT CONSTRAINTS' },
  'self-check': { fr: 'Bloc 6 · AUTO-VÉRIFICATION', en: 'Block 6 · SELF-CHECK' },
  'long-document': {
    fr: 'Ajout au bloc 5 si « Mon document est long »',
    en: 'Added to block 5 for "My document is long"',
  },
  document: { fr: 'Bloc 8 · DOCUMENT', en: 'Block 8 · DOCUMENT' },
  'variant-quality-rule1': {
    fr: 'Variante de la règle 1 (« n’utiliser que le document » décoché)',
    en: 'Variant of rule 1 ("use only the document" unchecked)',
  },
  'variant-self-check5': {
    fr: 'Variante de l’auto-vérification 5 (même option)',
    en: 'Variant of self-check 5 (same option)',
  },
  'variant-output-audit': {
    fr: 'Variante de la 1re contrainte de sortie pour T10',
    en: 'Variant of the 1st output constraint for T10',
  },
};

function titleOf(name: TemplateName, locale: Locale): string {
  const task = PROMPT_TASKS.find((t) => t.template === name);
  if (task) {
    const block = task.kind === 'composed' ? (locale === 'fr' ? 'Bloc 2 · ' : 'Block 2 · ') : '';
    return `${block}${task.code} · ${task.id} — ${task.label[locale]}`;
  }
  return TITLES[name]?.[locale] ?? name;
}

const textFence = (text: string): string => fence(text, 'text');

export function templatesSection(locale: Locale): string {
  return DOC_TEMPLATE_ORDER.map(
    (name) =>
      `#### ${titleOf(name, locale)}\n\n\`prompts/${locale}/${name}.md\`\n\n${textFence(TEMPLATES[locale][name])}`,
  ).join('\n\n');
}

export function valuesSection(): string {
  const row = (variable: string, fr: string, en: string): string =>
    `| \`{{${variable}}}\` | ${fr} | ${en} |`;
  const rows = [
    '| Variable | Français | English |',
    '| --- | --- | --- |',
    ...LEVELS.map((l) => row('niveau', LEVEL_LABELS[l].fr, LEVEL_LABELS[l].en)),
    ...DENSITIES.map((d) => row('densite', densityPhrase(d, 'fr'), densityPhrase(d, 'en'))),
    row('regleIndices', HINT_RULE.on.fr, HINT_RULE.on.en),
    row('regleIndices', HINT_RULE.off.fr, HINT_RULE.off.en),
    row('regleExplications', EXPLANATION_RULE.on.fr, EXPLANATION_RULE.on.en),
    row('regleExplications', EXPLANATION_RULE.off.fr, EXPLANATION_RULE.off.en),
    row('portee', FIX_SCOPE.notes.fr, FIX_SCOPE.notes.en),
    row('portee', FIX_SCOPE.full.fr, FIX_SCOPE.full.en),
  ];
  const advice = [
    '| Type de document | Ligne ajoutée au bloc TÂCHE | Line added to the TASK block |',
    '| --- | --- | --- |',
    ...DOCUMENT_TYPES.map(
      (d) => `| \`${d}\` | ${DOCUMENT_TYPE_ADVICE[d].fr} | ${DOCUMENT_TYPE_ADVICE[d].en} |`,
    ),
  ];
  return `${rows.join('\n')}\n\n${advice.join('\n')}`;
}

export function exampleSection(): string {
  const { prompt, approxTokens } = buildPrompt({
    task: 'course-pack',
    format: 'markdown',
    locale: 'fr',
  });
  return `Taille : ${String(prompt.length)} caractères, environ ${String(approxTokens)} tokens.\n\n${textFence(prompt)}`;
}

export const DOC_SECTIONS: Readonly<Record<string, () => string>> = {
  'templates-fr': () => templatesSection('fr'),
  'templates-en': () => templatesSection('en'),
  values: valuesSection,
  example: exampleSection,
};

/** Replaces every generated region of the document. */
export function refreshDoc(doc: string): string {
  let out = doc;
  for (const [name, render] of Object.entries(DOC_SECTIONS)) {
    const start = `<!-- generated:${name}:start -->`;
    const end = `<!-- generated:${name}:end -->`;
    const i = out.indexOf(start);
    const j = out.indexOf(end);
    if (i < 0 || j < i) continue;
    out = `${out.slice(0, i + start.length)}\n\n${render()}\n\n${out.slice(j)}`;
  }
  return out;
}
