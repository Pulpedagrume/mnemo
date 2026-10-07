import { describe, expect, it } from 'vitest';
import { buildPrompt } from './build';
import { COMPOSED_TASK_IDS, getPromptTask } from './tasks';

/**
 * Golden files of the composed prompts (default options). Review the diff when a template, the
 * spec or an example changes, then update with `pnpm vitest run --project @mnemo/prompts -u`.
 */
const combos = [
  ...COMPOSED_TASK_IDS.flatMap((task) =>
    getPromptTask(task).formats.map((format) => ({ task, format, locale: 'fr' as const })),
  ),
  ...getPromptTask('course-pack').formats.map((format) => ({
    task: 'course-pack' as const,
    format,
    locale: 'en' as const,
  })),
];

describe('golden prompts', () => {
  it.each(combos)('$task.$format.$locale', async ({ task, format, locale }) => {
    const { prompt } = buildPrompt({ task, format, locale });
    await expect(prompt).toMatchFileSnapshot(`./__snapshots__/${task}.${format}.${locale}.txt`);
  });
});
