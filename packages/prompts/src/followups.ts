import type { Locale } from '@mnemo/core';
import { APP_NAME } from '@mnemo/core';
import type { BuildPromptInput } from './build';
import { composeBlocks, template } from './build';
import type { DocumentType } from './options';
import { DEFAULT_PROMPT_OPTIONS, resolveOptions } from './options';
import { CONTINUE_FALLBACK, DOCUMENT_TYPE_ADVICE } from './phrases';
import { fillTemplate } from './variables';

export interface ContinuePromptInput {
  /** uid of the last valid note received (ImportReport.truncated.lastUid). */
  lastUid?: string;
  /** Where to resume (ImportReport.continuation). */
  continuation?: string;
  locale: Locale;
}

/** T12: to paste in the same conversation when the file is cut off or announces more. */
export function buildContinuePrompt(input: ContinuePromptInput): string {
  const { locale } = input;
  const lastUid = input.lastUid?.trim();
  const continuation = input.continuation?.trim();
  return fillTemplate(template(locale, 'continue'), {
    dernierUid: lastUid === undefined || lastUid === '' ? CONTINUE_FALLBACK.uid[locale] : lastUid,
    continuation:
      continuation === undefined || continuation === ''
        ? CONTINUE_FALLBACK.continuation[locale]
        : continuation.replace(/\.$/, ''),
  });
}

export interface PlanPromptInput {
  locale: Locale;
  /** Cards per batch (default DEFAULT_PROMPT_OPTIONS.batchSize). */
  batchSize?: number;
  documentType?: DocumentType;
}

/** T13: RÔLE + plan task (no cards) + DOCUMENT. First step of the long-document workflow. */
export function buildPlanPrompt(input: PlanPromptInput): string {
  const { locale } = input;
  const o = resolveOptions({ batchSize: input.batchSize ?? DEFAULT_PROMPT_OPTIONS.batchSize }, locale);
  const values = { appName: APP_NAME, tailleLot: o.batchSize };
  const plan = fillTemplate(template(locale, 'plan'), values);
  const advice = input.documentType ? DOCUMENT_TYPE_ADVICE[input.documentType][locale] : undefined;
  return [
    fillTemplate(template(locale, 'role'), values),
    advice === undefined ? plan : `${plan}\n${advice}`,
    template(locale, 'document'),
  ].join('\n\n');
}

export interface BatchPromptInput {
  /** Batch number (from the plan). */
  n: number;
  /** Sections of the batch: text ("1.1 à 1.4") or list. */
  sections: string | readonly string[];
  /** uid prefix shared by every batch. */
  prefix: string;
  locale: Locale;
  /**
   * Full prompt settings for the first batch (or a new conversation): the batch block is then
   * appended to the TÂCHE block of the composed prompt (blocks 1–7, no DOCUMENT block since the
   * document was given with the plan). Without it, only the short batch block is returned.
   */
  base?: Omit<BuildPromptInput, 'locale'>;
}

/** T14: one batch of sections of a long document. */
export function buildBatchPrompt(input: BatchPromptInput): string {
  const { locale } = input;
  const sections = typeof input.sections === 'string' ? input.sections : input.sections.join(', ');
  const values = { n: input.n, sections, prefixe: input.prefix };
  const batch = template(locale, 'batch');
  if (input.base === undefined) return fillTemplate(batch, values);
  const base = { ...input.base, locale, options: { ...input.base.options, uidPrefix: input.prefix } };
  return composeBlocks(base, batch, values).blocks.join('\n\n');
}
