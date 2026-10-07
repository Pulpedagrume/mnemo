import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOC_TEMPLATE_ORDER } from '../scripts/docs-sections';
import { PROMPTS_DIR, readTemplateFiles, renderTemplatesModule } from '../scripts/templates-io';
import { buildPrompt, fence } from './build';
import { SELF_CHECK_FORMAT_FRAGMENT } from './phrases';
import { PROMPT_TASKS } from './tasks';
import { TEMPLATE_NAMES, TEMPLATES } from './templates.generated';
import { PROMPT_VARIABLES, fillTemplate, promptVariables, unresolvedPlaceholders } from './variables';

const files = readTemplateFiles();

describe('template files', () => {
  it('prompts/fr and prompts/en contain the same files', () => {
    expect(Object.keys(files.en ?? {})).toEqual(Object.keys(files.fr ?? {}));
    expect(Object.keys(files.fr ?? {}).length).toBeGreaterThan(20);
  });

  it('each French template and its English translation use the same variables', () => {
    for (const [name, fr] of Object.entries(files.fr ?? {})) {
      const en = files.en?.[name] ?? '';
      expect(promptVariables(en), name).toEqual(promptVariables(fr));
      // No placeholder outside the whitelist (typo guard).
      for (const p of [...unresolvedPlaceholders(fr), ...unresolvedPlaceholders(en)]) {
        expect(PROMPT_VARIABLES as readonly string[], `${name}: ${p}`).toContain(p.slice(2, -2));
      }
    }
  });

  it('every task template exists', () => {
    for (const task of PROMPT_TASKS) expect(TEMPLATE_NAMES).toContain(task.template);
  });

  it('templates.generated.ts is up to date (run `pnpm --filter @mnemo/prompts templates`)', () => {
    expect([...TEMPLATE_NAMES]).toEqual(Object.keys(files.fr ?? {}));
    expect({ fr: TEMPLATES.fr, en: TEMPLATES.en }).toEqual(files);
    expect(renderTemplatesModule(files)).toContain('export const TEMPLATES');
  });

  it('never names a specific AI model or vendor', () => {
    const vendors =
      /\b(chatgpt|gpt-?\d|openai|claude|anthropic|gemini|bard|copilot|mistral|llama|deepseek|perplexity|grok)\b/i;
    for (const locale of ['fr', 'en'] as const) {
      for (const [name, text] of Object.entries(TEMPLATES[locale])) {
        expect(vendors.test(text), `${locale}/${name}`).toBe(false);
      }
    }
  });

  it('variant fragments still match the base templates', () => {
    for (const locale of ['fr', 'en'] as const) {
      expect(TEMPLATES[locale]['self-check']).toContain(SELF_CHECK_FORMAT_FRAGMENT[locale]);
      expect(TEMPLATES[locale]['quality-rules']).toMatch(/^1\. /m);
      expect(TEMPLATES[locale]['self-check']).toMatch(/^5\. /m);
      expect(TEMPLATES[locale]['output-constraints']).toMatch(/^- /m);
      expect(TEMPLATES[locale]['variant-quality-rule1']).toMatch(/^1\. /);
      expect(TEMPLATES[locale]['variant-self-check5']).toMatch(/^5\. /);
      expect(TEMPLATES[locale]['variant-output-audit']).toMatch(/^- /);
    }
  });
});

describe('docs/AI_PROMPTS.md (refresh with `pnpm --filter @mnemo/prompts templates`)', () => {
  const doc = readFileSync(join(PROMPTS_DIR, '..', 'docs', 'AI_PROMPTS.md'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );

  it('publishes every template verbatim, in both languages', () => {
    for (const locale of ['fr', 'en'] as const) {
      for (const name of DOC_TEMPLATE_ORDER) {
        expect(doc, `${locale}/${name}`).toContain(fence(TEMPLATES[locale][name], 'text'));
      }
    }
    expect([...DOC_TEMPLATE_ORDER].sort()).toEqual([...TEMPLATE_NAMES].sort());
  });

  it('shows the composed course-pack prompt as the app builds it', () => {
    const { prompt } = buildPrompt({ task: 'course-pack', format: 'markdown', locale: 'fr' });
    expect(doc).toContain(prompt);
  });
});

describe('variables', () => {
  it('lists whitelisted variables only, never cloze deletions', () => {
    expect(promptVariables('{{deck}} {{c1::réponse}} {{c1::a::b}} {{inconnu}} {{deck}} {{n}}')).toEqual([
      'deck',
      'n',
    ]);
  });

  it('fills in a single pass and leaves cloze syntax and unknown names alone', () => {
    const out = fillTemplate('« {{deck}} » {{c1::réponse}} {{inconnu}} {{langue}}', {
      deck: 'A {{langue}} $& B',
    });
    expect(out).toBe('« A {{langue}} $& B » {{c1::réponse}} {{inconnu}} {{langue}}');
  });

  it('detects unresolved placeholders but not cloze deletions', () => {
    expect(unresolvedPlaceholders('{{c1::x}} {{c2::y::z}} {{deck}}')).toEqual(['{{deck}}']);
  });
});
