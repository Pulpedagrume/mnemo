import type { I18nString } from '@mnemo/core';
import type { OutputFormat, PromptTaskId } from './tasks';
import { getPromptTask, typesForFormat } from './tasks';

export interface RecommendOptions {
  /** Lots of formulas (LaTeX) in the document. */
  latexHeavy?: boolean;
  /** Lots of code in the document. */
  codeHeavy?: boolean;
  /** The user explicitly wants a spreadsheet (CSV). */
  wantsCsv?: boolean;
  /** The file is meant for scripts (strictest format). */
  forScripts?: boolean;
}

export interface FormatRecommendation {
  format: OutputFormat;
  reason: I18nString;
}

const REASONS = {
  markdown: {
    fr: 'Markdown : lisible, peu d’erreurs, recommandé par défaut.',
    en: 'Markdown: readable, few errors, recommended by default.',
  },
  yamlHeavy: {
    fr: 'YAML : avec beaucoup de LaTeX ou de code, les blocs « | » gardent le texte tel quel, sans échappement ni conflit avec les blocs de code.',
    en: 'YAML: with lots of LaTeX or code, "|" blocks keep the text as is, with no escaping and no clash with code blocks.',
  },
  yamlMedia: {
    fr: 'YAML : les figures se déclarent dans une liste media, que seuls YAML et JSON savent décrire.',
    en: 'YAML: figures are declared in a media list, which only YAML and JSON can describe.',
  },
  json: {
    fr: 'JSON : le plus strict, pour les scripts.',
    en: 'JSON: the strictest, for scripts.',
  },
  csv: {
    fr: 'CSV : pour un tableur ; seuls les types basic, basic_reversed, cloze et mcq sont possibles.',
    en: 'CSV: for a spreadsheet; only the basic, basic_reversed, cloze and mcq types are possible.',
  },
} as const satisfies Record<string, I18nString>;

/**
 * Recommends an output format for a task: Markdown by default; YAML for formula- or code-heavy
 * content (and figures); CSV only when asked (and possible); JSON for scripts.
 */
export function recommendFormat(
  taskId: PromptTaskId,
  options: RecommendOptions = {},
): FormatRecommendation {
  const task = getPromptTask(taskId);
  const allowed = (f: OutputFormat): boolean =>
    task.formats.includes(f) && (task.kind === 'special' || typesForFormat(task.noteTypes, f).length > 0);
  if (options.wantsCsv === true && allowed('csv')) return { format: 'csv', reason: REASONS.csv };
  if (options.forScripts === true && allowed('json')) return { format: 'json', reason: REASONS.json };
  if (task.media) return { format: 'yaml', reason: REASONS.yamlMedia };
  if (options.latexHeavy === true || options.codeHeavy === true || task.recommendedFormat === 'yaml') {
    return { format: 'yaml', reason: REASONS.yamlHeavy };
  }
  return { format: 'markdown', reason: REASONS.markdown };
}
