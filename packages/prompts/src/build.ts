import type { Locale } from '@mnemo/core';
import { APP_NAME } from '@mnemo/core';
import { exampleDocument, renderExample } from './format/example';
import { formatSpec } from './format/spec';
import type { PromptOptions, ResolvedOptions } from './options';
import { resolveOptions } from './options';
import {
  DOCUMENT_TYPE_ADVICE,
  EXAMPLE_HEADER,
  EXPLANATION_RULE,
  FORMAT_EXTENSION,
  FORMAT_FENCE,
  HINT_RULE,
  LEVEL_LABELS,
  SELF_CHECK_FORMAT_FRAGMENT,
  SELF_CHECK_FORMAT_VARIANTS,
  densityPhrase,
} from './phrases';
import type { ComposedTaskId, OutputFormat, PromptTask } from './tasks';
import { getPromptTask, typesForFormat } from './tasks';
import type { TemplateName } from './templates.generated';
import { TEMPLATES } from './templates.generated';
import { approxTokens } from './tokens';
import type { TemplateValues } from './variables';
import { fillTemplate } from './variables';

export interface BuildPromptInput {
  task: ComposedTaskId;
  format: OutputFormat;
  locale: Locale;
  options?: PromptOptions;
}

export interface BuiltPrompt {
  /** Full prompt, blocks RÔLE → DOCUMENT separated by blank lines. */
  prompt: string;
  /** FORMAT block (compact spec). */
  specText: string;
  /** Example file in the output format (without code fence). */
  exampleText: string;
  /** ≈ characters / 4 (see tokens.ts). */
  approxTokens: number;
}

export function template(locale: Locale, name: TemplateName): string {
  return TEMPLATES[locale][name];
}

/** Values of every whitelisted variable a composed prompt can use. */
function templateValues(
  o: ResolvedOptions,
  locale: Locale,
  format: OutputFormat,
): TemplateValues {
  return {
    appName: APP_NAME,
    deck: o.deck,
    langue: o.language,
    niveau: LEVEL_LABELS[o.level][locale],
    densite: densityPhrase(o.density, locale),
    nbChoix: o.mcqChoices,
    formatFence: FORMAT_FENCE[format],
    formatExt: FORMAT_EXTENSION[format],
    regleIndices: HINT_RULE[o.hints ? 'on' : 'off'][locale],
    regleExplications: EXPLANATION_RULE[o.explanations ? 'on' : 'off'][locale],
    tailleLot: o.batchSize,
    prefixe: o.uidPrefix,
  };
}

/** Replaces the first line of `text` that starts with `prefix` (variants of numbered items). */
function replaceLine(text: string, prefix: string, replacement: string): string {
  const lines = text.split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) lines[index] = replacement;
  return lines.join('\n');
}

function taskBlock(task: PromptTask, o: ResolvedOptions, locale: Locale): string {
  const advice = o.documentType ? DOCUMENT_TYPE_ADVICE[o.documentType][locale] : undefined;
  const text = template(locale, task.template);
  return advice === undefined ? text : `${text}\n${advice}`;
}

function qualityBlock(o: ResolvedOptions, locale: Locale): string {
  const rules = template(locale, 'quality-rules');
  return o.onlyDocument ? rules : replaceLine(rules, '1. ', template(locale, 'variant-quality-rule1'));
}

function outputBlock(task: PromptTask, o: ResolvedOptions, locale: Locale): string {
  let text = template(locale, 'output-constraints');
  if (task.id === 'audit') text = replaceLine(text, '- ', template(locale, 'variant-output-audit'));
  return o.longDocument ? `${text}\n\n${template(locale, 'long-document')}` : text;
}

function selfCheckBlock(o: ResolvedOptions, locale: Locale, format: OutputFormat): string {
  let text = template(locale, 'self-check');
  const variant = SELF_CHECK_FORMAT_VARIANTS[format];
  if (variant) text = text.replace(SELF_CHECK_FORMAT_FRAGMENT[locale], variant[locale]);
  return o.onlyDocument ? text : replaceLine(text, '5. ', template(locale, 'variant-self-check5'));
}

/** Code fence long enough not to be closed by a fence inside the content. */
export function fence(content: string, info: string): string {
  const longest = Math.max(2, ...[...content.matchAll(/`{3,}/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${info}\n${content}\n${ticks}`;
}

export interface ComposedBlocks {
  specText: string;
  exampleText: string;
  /** Blocks 1 (RÔLE) to 7 (EXEMPLE), variables filled. */
  blocks: string[];
}

/**
 * Blocks 1 to 7 of a composed prompt. `extraTask` (e.g. the batch block T14) is appended to the
 * TÂCHE block and filled with `extraValues`. Templates are filled one by one; the generated
 * spec and example are never scanned for variables.
 */
export function composeBlocks(
  input: BuildPromptInput,
  extraTask?: string,
  extraValues: TemplateValues = {},
): ComposedBlocks {
  const { locale, format } = input;
  const task = getPromptTask(input.task);
  if (task.kind !== 'composed') throw new RangeError(`Task ${task.id} has its own builder`);
  if (!task.formats.includes(format)) {
    throw new RangeError(`Task ${task.id} cannot be expressed in ${format}`);
  }
  const o = resolveOptions(input.options, locale);
  const values = { ...templateValues(o, locale, format), ...extraValues };
  const fill = (text: string): string => fillTemplate(text, values);
  const types = typesForFormat(task.noteTypes, format);
  const specText = formatSpec(format, {
    locale,
    types,
    media: task.media,
    codeBlocks: task.codeBlocks,
    brief: true,
    uidPrefix: o.uidPrefix,
  });
  const exampleText = renderExample(
    exampleDocument({ locale, types, media: task.media, deck: o.deck, uidPrefix: o.uidPrefix }),
    format,
  );
  const taskText = fill(taskBlock(task, o, locale));
  const blocks = [
    fill(template(locale, 'role')),
    extraTask === undefined ? taskText : `${taskText}\n\n${fill(extraTask)}`,
    specText,
    fill(qualityBlock(o, locale)),
    fill(outputBlock(task, o, locale)),
    fill(selfCheckBlock(o, locale, format)),
    `${EXAMPLE_HEADER[locale]}\n${fence(exampleText, FORMAT_FENCE[format])}`,
  ];
  return { specText, exampleText, blocks };
}

/**
 * Composes the prompt of a task: RÔLE, TÂCHE, FORMAT, RÈGLES DE QUALITÉ, CONTRAINTES DE SORTIE,
 * AUTO-VÉRIFICATION, EXEMPLE, DOCUMENT. Pure; throws a RangeError for a special task or a
 * format the task cannot use (see PromptTask.formats).
 */
export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { specText, exampleText, blocks } = composeBlocks(input);
  const prompt = [...blocks, template(input.locale, 'document')].join('\n\n');
  return { prompt, specText, exampleText, approxTokens: approxTokens(prompt) };
}
