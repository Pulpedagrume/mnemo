/** Identifiers of the AI prompt tasks (see docs/AI_PROMPTS.md). */
export const PROMPT_TASK_IDS = [
  'flashcards',
  'cloze',
  'mcq',
  'course-pack',
  'vocabulary',
  'formulas',
  'code',
  'timeline',
  'convert',
  'audit',
  'fix',
  'continue',
  'plan',
  'batch',
  'images',
] as const;

export type PromptTaskId = (typeof PROMPT_TASK_IDS)[number];
