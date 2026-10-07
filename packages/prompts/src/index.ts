/**
 * AI prompt library: templates (prompts/{fr,en}/*.md, embedded in templates.generated.ts) and a
 * pure composer. See docs/AI_PROMPTS.md.
 */
export {
  COMPOSED_TASK_IDS,
  CSV_NOTE_TYPES,
  OUTPUT_FORMATS,
  PROMPT_TASKS,
  PROMPT_TASK_IDS,
  SPECIAL_TASK_IDS,
  getPromptTask,
  typesForFormat,
  type ComposedTaskId,
  type OutputFormat,
  type PromptTask,
  type PromptTaskId,
  type SpecialTaskId,
} from './tasks';
export {
  DEFAULT_PROMPT_OPTIONS,
  DENSITIES,
  DOCUMENT_TYPES,
  LEVELS,
  defaultUidPrefix,
  languageName,
  resolveOptions,
  type Density,
  type DocumentType,
  type Level,
  type PromptOptions,
  type ResolvedOptions,
} from './options';
export {
  DOCUMENT_TYPE_ADVICE,
  EXPLANATION_RULE,
  FIX_SCOPE,
  FORMAT_EXTENSION,
  FORMAT_FENCE,
  HINT_RULE,
  LEVEL_LABELS,
  densityPhrase,
} from './phrases';
export { buildPrompt, type BuildPromptInput, type BuiltPrompt } from './build';
export {
  buildBatchPrompt,
  buildContinuePrompt,
  buildPlanPrompt,
  type BatchPromptInput,
  type ContinuePromptInput,
  type PlanPromptInput,
} from './followups';
export {
  FIX_MAX_ISSUES,
  FIX_WARNING_CODES,
  buildFixPrompt,
  issueLine,
  issuesToFix,
  type FixPromptInput,
} from './fix';
export { recommendFormat, type FormatRecommendation, type RecommendOptions } from './recommend';
export { formatSpec, type SpecOptions } from './format/spec';
export {
  PROMPT_VARIABLES,
  fillTemplate,
  promptVariables,
  unresolvedPlaceholders,
  type PromptVariable,
  type TemplateValues,
} from './variables';
export { TEMPLATES, TEMPLATE_NAMES, type TemplateName } from './templates.generated';
export { approxTokens } from './tokens';
