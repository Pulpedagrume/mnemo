import { describe, expect, it } from 'vitest';
import { buildPrompt, fence } from './build';
import { recommendFormat } from './recommend';
import type { ComposedTaskId } from './tasks';
import { COMPOSED_TASK_IDS, OUTPUT_FORMATS, PROMPT_TASKS, getPromptTask } from './tasks';
import { TEMPLATES } from './templates.generated';
import { approxTokens } from './tokens';
import { unresolvedPlaceholders } from './variables';

const LOCALES = ['fr', 'en'] as const;

const allCombos = COMPOSED_TASK_IDS.flatMap((task) =>
  getPromptTask(task).formats.flatMap((format) => LOCALES.map((locale) => ({ task, format, locale }))),
);

const HEADERS = {
  fr: ['RÔLE', 'TÂCHE', 'FORMAT : ', 'RÈGLES DE QUALITÉ', 'CONTRAINTES DE SORTIE', 'AUTO-VÉRIFICATION', 'EXEMPLE', 'Voici le document à traiter :'],
  en: ['ROLE', 'TASK', 'FORMAT: ', 'QUALITY RULES', 'OUTPUT CONSTRAINTS', 'SELF-CHECK', 'EXAMPLE', 'Here is the document to process:'],
};

/** Prompt without block 8 (DOCUMENT). */
function withoutDocument(prompt: string, locale: 'fr' | 'en'): string {
  return prompt.slice(0, prompt.lastIndexOf(`\n\n${TEMPLATES[locale].document}`));
}

describe('buildPrompt', () => {
  it.each(allCombos)('$task / $format / $locale has no unresolved variable', (input) => {
    const options = { hints: false, explanations: false, longDocument: true, onlyDocument: false };
    for (const prompt of [buildPrompt(input).prompt, buildPrompt({ ...input, options }).prompt]) {
      expect(unresolvedPlaceholders(prompt)).toEqual([]);
    }
  });

  it.each(LOCALES)('orders the 8 blocks (%s)', (locale) => {
    const { prompt } = buildPrompt({ task: 'flashcards', format: 'markdown', locale });
    const positions = HEADERS[locale].map((h) => prompt.indexOf(h));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(prompt.endsWith(TEMPLATES[locale].document)).toBe(true);
  });

  it('keeps course-pack / markdown / fr within 1 800 tokens without the document', () => {
    const { prompt } = buildPrompt({ task: 'course-pack', format: 'markdown', locale: 'fr' });
    expect(approxTokens(withoutDocument(prompt, 'fr'))).toBeLessThanOrEqual(1800);
  });

  it('embeds only the note types of the task in the FORMAT block', () => {
    const { specText } = buildPrompt({ task: 'cloze', format: 'markdown', locale: 'fr' });
    expect(specText).toMatch(/^- cloze/m);
    expect(specText).not.toMatch(/^- (basic|mcq|typed|list|ordering|matching|truefalse)\b/m);
    const csv = buildPrompt({ task: 'course-pack', format: 'csv', locale: 'fr' }).specText;
    expect(csv).toMatch(/^- mcq/m);
    expect(csv).not.toMatch(/^- (ordering|matching|list|truefalse|typed)\b/m);
  });

  it('applies the options', () => {
    const base = { task: 'mcq', format: 'json', locale: 'fr' } as const;
    const { prompt } = buildPrompt({
      ...base,
      options: {
        deck: 'Réseaux::Ethernet',
        language: 'en-GB',
        level: 'expert',
        density: 'exhaustif',
        hints: false,
        mcqChoices: 9,
        documentType: 'diapositives',
      },
    });
    expect(prompt).toContain('Paquet racine : « Réseaux::Ethernet »');
    expect(prompt).toContain('Niveau : expert');
    expect(prompt).toContain('Densité : exhaustif');
    expect(prompt).toContain('Nombre de propositions : 6.');
    expect(prompt).toContain('N’ajoute pas d’indices.');
    expect(prompt).toContain('rédige les cartes en anglais');
    expect(prompt).toContain('Type de document : diapositives');
    expect(prompt).toContain('"uid": "reseaux-1-001"');
    expect(prompt).toContain('Préfixe des uid : reseaux.');
    const custom = buildPrompt({ ...base, options: { uidPrefix: 'eth', density: 10 } }).prompt;
    expect(custom).toContain('"uid": "eth-1-001"');
    expect(custom).toContain('environ 10 cartes par section');
  });

  it('replaces rule 1 and self-check 5 when general knowledge is allowed', () => {
    const only = buildPrompt({ task: 'flashcards', format: 'yaml', locale: 'fr' }).prompt;
    const open = buildPrompt({
      task: 'flashcards',
      format: 'yaml',
      locale: 'fr',
      options: { onlyDocument: false },
    }).prompt;
    expect(only).toContain('1. Fidélité : n’utilise que les informations du document fourni.');
    expect(open).not.toContain('1. Fidélité : n’utilise que');
    expect(open).toContain(TEMPLATES.fr['variant-quality-rule1']);
    expect(open).toContain(TEMPLATES.fr['variant-self-check5']);
    expect(open).not.toContain('5. Toutes les informations viennent-elles du document ?');
  });

  it('lets the audit task list problems before the file', () => {
    const { prompt } = buildPrompt({ task: 'audit', format: 'markdown', locale: 'en' });
    expect(prompt).not.toContain('Reply ONLY with the file');
    expect(prompt).toContain('Reply first with the list of problems');
    expect(prompt).toContain('```markdown … ```');
    // Only the first constraint changes.
    expect(prompt).toContain('- Follow exactly the format described above');
    expect(prompt.match(/Reply first/g)).toHaveLength(1);
  });

  it('adapts self-check item 1 to the format', () => {
    const md = buildPrompt({ task: 'cloze', format: 'markdown', locale: 'fr' }).prompt;
    expect(md).toContain('guillemets, indentation et lignes ::: fermantes');
    const json = buildPrompt({ task: 'cloze', format: 'json', locale: 'fr' }).prompt;
    expect(json).not.toContain('lignes ::: fermantes');
    expect(json).toContain('y compris guillemets, virgules et crochets ?');
    const csv = buildPrompt({ task: 'cloze', format: 'csv', locale: 'en' }).prompt;
    expect(csv).toContain('including headers, separators and quotes?');
  });

  it('adds the long-document advice', () => {
    const input = { task: 'cloze', format: 'markdown', locale: 'fr' } as const;
    const long = buildPrompt({ ...input, options: { longDocument: true, batchSize: 30 } }).prompt;
    expect(long).toContain('DOCUMENT LONG');
    expect(long).toContain('Produis au plus 30 notes par réponse');
    expect(buildPrompt(input).prompt).not.toContain('DOCUMENT LONG');
  });

  it('handles code blocks inside Markdown files', () => {
    const { prompt } = buildPrompt({ task: 'code', format: 'markdown', locale: 'fr' });
    expect(prompt).toContain('quatre accents graves');
    expect(buildPrompt({ task: 'cloze', format: 'markdown', locale: 'fr' }).prompt).not.toContain(
      'quatre accents graves',
    );
    expect(fence('Q: x\n```js\nf()\n```', 'markdown')).toBe(
      '````markdown\nQ: x\n```js\nf()\n```\n````',
    );
  });

  it('rejects special tasks and impossible formats', () => {
    expect(() =>
      buildPrompt({ task: 'fix' as ComposedTaskId, format: 'markdown', locale: 'fr' }),
    ).toThrow(RangeError);
    expect(() => buildPrompt({ task: 'images', format: 'markdown', locale: 'fr' })).toThrow(
      RangeError,
    );
  });

  it('reports approxTokens as characters / 4', () => {
    const r = buildPrompt({ task: 'mcq', format: 'markdown', locale: 'en' });
    expect(r.approxTokens).toBe(Math.ceil(r.prompt.length / 4));
  });
});

describe('PROMPT_TASKS', () => {
  it('declares T1–T15 with labels in both languages', () => {
    expect(PROMPT_TASKS.map((t) => t.code).sort()).toEqual(
      Array.from({ length: 15 }, (_, i) => `T${String(i + 1)}`).sort(),
    );
    for (const t of PROMPT_TASKS) {
      expect(t.label.fr && t.label.en && t.description.fr && t.description.en).toBeTruthy();
      expect(t.formats).toContain(t.recommendedFormat);
      if (t.kind === 'composed') expect(t.noteTypes.length).toBeGreaterThan(0);
    }
  });
});

describe('recommendFormat', () => {
  it('defaults to Markdown', () => {
    expect(recommendFormat('course-pack').format).toBe('markdown');
    expect(recommendFormat('flashcards').reason.fr).toMatch(/Markdown/);
  });

  it('prefers YAML for formulas, code, LaTeX- or code-heavy content and figures', () => {
    expect(recommendFormat('formulas').format).toBe('yaml');
    expect(recommendFormat('code').format).toBe('yaml');
    expect(recommendFormat('flashcards', { latexHeavy: true }).format).toBe('yaml');
    expect(recommendFormat('cloze', { codeHeavy: true }).format).toBe('yaml');
    expect(recommendFormat('images').format).toBe('yaml');
  });

  it('gives CSV only when asked and possible, JSON for scripts', () => {
    expect(recommendFormat('mcq', { wantsCsv: true }).format).toBe('csv');
    expect(recommendFormat('images', { wantsCsv: true }).format).toBe('yaml');
    expect(recommendFormat('mcq', { forScripts: true })).toEqual({
      format: 'json',
      reason: { fr: 'JSON : le plus strict, pour les scripts.', en: 'JSON: the strictest, for scripts.' },
    });
  });

  it('only recommends formats the task supports', () => {
    for (const t of PROMPT_TASKS) {
      for (const latexHeavy of [false, true]) {
        expect(t.formats).toContain(recommendFormat(t.id, { latexHeavy }).format);
      }
    }
    expect(OUTPUT_FORMATS).toHaveLength(4);
  });
});
