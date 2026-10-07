import { describe, expect, it } from 'vitest';
import * as importers from '@mnemo/importers';
import type { ImportIssue, ImportParseResult, ImportReport, ParseOptions } from '@mnemo/importers';
import { buildPrompt } from './build';
import { buildBatchPrompt, buildContinuePrompt, buildPlanPrompt } from './followups';
import { buildFixPrompt, issuesToFix } from './fix';
import { TEMPLATES } from './templates.generated';
import { unresolvedPlaceholders } from './variables';

const issue = (i: Partial<ImportIssue> & Pick<ImportIssue, 'code' | 'severity'>): ImportIssue => ({
  path: '',
  message: { fr: `message ${i.code}`, en: `message ${i.code} en` },
  howToFix: { fr: `corriger ${i.code}`, en: `fix ${i.code}` },
  ...i,
});

const SOURCE = [
  '---',
  'format: mnemo/1',
  '---',
  '',
  '::: basic uid=net-1-001',
  'Q: Rôle du FCS ?',
  'A: Détecter les erreurs.',
  ':::',
  '',
  '::: mcq uid=net-1-002',
  'Q: Quel support résiste aux EMI ?',
  '- [ ] UTP',
  '- [ ] STP',
  ':::',
  '',
  '::: cloze uid=net-1-003',
  'Text: Un commutateur lit l’adresse source.',
  ':::',
].join('\n');

const report: ImportReport = {
  issues: [
    issue({
      code: 'mcq_no_correct',
      severity: 'error',
      path: 'notes[1].choices',
      line: 12,
      noteIndex: 1,
      uid: 'net-1-002',
      message: { fr: 'Le QCM n’a aucune bonne réponse.', en: 'The MCQ has no correct answer.' },
      howToFix: { fr: 'Marque au moins une proposition avec [x].', en: 'Mark at least one choice with [x].' },
    }),
    issue({
      code: 'cloze_no_hole',
      severity: 'error',
      path: 'notes[2].text',
      line: 17,
      noteIndex: 2,
      uid: 'net-1-003',
      message: { fr: 'Le texte à trous ne contient aucun trou.', en: 'The cloze has no blank.' },
      howToFix: { fr: 'Ajoute au moins un {{c1::…}}.', en: 'Add at least one {{c1::…}}.' },
    }),
    issue({ code: 'parse_error', severity: 'error', path: 'notes[3]', noteIndex: 3, excerpt: '::: qcm' }),
    issue({ code: 'duplicate_uid', severity: 'warning', path: 'notes[4].uid', uid: 'net-1-001' }),
    issue({ code: 'alias', severity: 'warning', path: 'notes[0].type', uid: 'net-1-001' }),
    issue({ code: 'deck_created', severity: 'info', path: 'notes[0].deck' }),
  ],
  counts: {
    notes: 5,
    valid: 1,
    invalid: 4,
    cards: 1,
    byType: { basic: 1, mcq: 1, cloze: 1 },
    errors: 3,
    warnings: 2,
    infos: 1,
  },
};

describe('buildFixPrompt', () => {
  it('mentions every error with its uid or path and its message', () => {
    const prompt = buildFixPrompt({ report, sourceText: SOURCE, format: 'markdown', locale: 'fr' });
    expect(prompt).toContain('ERREURS (4) :');
    expect(prompt).toContain(
      '- uid net-1-002 (notes[1].choices, ligne 12) : Le QCM n’a aucune bonne réponse. Correction : Marque au moins une proposition avec [x].',
    );
    expect(prompt).toContain('uid net-1-003 (notes[2].text, ligne 17) : Le texte à trous ne contient aucun trou.');
    expect(prompt).toContain('note n°4 (notes[3]) : message parse_error');
    expect(prompt).toContain('uid net-1-001 (notes[4].uid) : message duplicate_uid');
    // Cleanups and infos are not sent back.
    expect(prompt).not.toContain('message alias');
    expect(prompt).not.toContain('message deck_created');
    // Valid notes are not resent; the faulty blocks are quoted whole.
    expect(prompt).not.toContain('Rôle du FCS');
    expect(prompt).toContain('::: mcq uid=net-1-002\nQ: Quel support résiste aux EMI ?\n- [ ] UTP\n- [ ] STP\n:::');
    expect(prompt).toContain('::: cloze uid=net-1-003\nText: Un commutateur lit l’adresse source.\n:::');
    expect(prompt).toContain('::: qcm');
    expect(prompt).toContain('uniquement les notes corrigées, avec leurs uid d’origine');
    // Compact spec of the types of the file only.
    expect(prompt).toMatch(/^- mcq/m);
    expect(prompt).toMatch(/^- cloze/m);
    expect(prompt).not.toMatch(/^- ordering/m);
    expect(unresolvedPlaceholders(prompt)).toEqual([]);
  });

  it('works without source text, in English, for the full file', () => {
    const prompt = buildFixPrompt({ report, format: 'json', locale: 'en', scope: 'full' });
    expect(prompt).toContain('return the complete file');
    expect(prompt).toContain('- uid net-1-002 (notes[1].choices, line 12): The MCQ has no correct answer. Fix: Mark at least one choice with [x].');
    expect(prompt).toContain('[note #4 (notes[3])]\n::: qcm');
    // Full type descriptions here: the fix prompt has no TÂCHE block.
    expect(prompt).toMatch(/^- mcq — .+: question \(question\), choices/m);
  });

  it('keeps errors and blocking warnings only', () => {
    expect(issuesToFix(report).map((i) => i.code)).toEqual([
      'mcq_no_correct',
      'cloze_no_hole',
      'parse_error',
      'duplicate_uid',
    ]);
  });

  it('caps the list of a very long report', () => {
    const many: ImportReport = {
      ...report,
      issues: Array.from({ length: 80 }, (_, i) =>
        issue({ code: 'missing_field', severity: 'error', path: `notes[${String(i)}].back`, noteIndex: i }),
      ),
    };
    const prompt = buildFixPrompt({ report: many, format: 'yaml', locale: 'fr' });
    expect(prompt).toContain('ERREURS (80) :');
    expect(prompt).toContain('… et 20 autre(s) erreur(s)');
  });
});

type ParseImport = (text: string, options?: ParseOptions) => ImportParseResult;
const parseImport = (importers as Record<string, unknown>).parseImport as ParseImport | undefined;

describe.skipIf(!parseImport)('fix loop with the real parser', () => {
  it('turns every error of a corrupted AI file into a line of the fix prompt', () => {
    const { exampleText } = buildPrompt({ task: 'course-pack', format: 'markdown', locale: 'fr' });
    const corrupted = exampleText
      .replace('- [x] Fibre optique', '- [ ] Fibre optique')
      .replace('{{c1::source::source ou destination ?}}', 'source');
    const result = parseImport?.(corrupted, { format: 'markdown' });
    const errors = result?.report.issues.filter((i) => i.severity === 'error') ?? [];
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const prompt = buildFixPrompt({
      report: result!.report,
      sourceText: corrupted,
      format: 'markdown',
      locale: 'fr',
    });
    for (const e of errors) {
      expect(prompt).toContain(e.message.fr.trim());
      if (e.uid !== undefined) expect(prompt).toContain(`uid ${e.uid}`);
    }
    expect(prompt).toContain('::: mcq uid=mon-cours-1-003');
    expect(prompt).not.toContain('::: list uid=');
    // Format reminder limited to the faulty types.
    expect(prompt).toMatch(/^- cloze/m);
    expect(prompt).not.toMatch(/^- list/m);
  });
});

describe('follow-up prompts', () => {
  it('builds the continue prompt (T12)', () => {
    expect(buildContinuePrompt({ lastUid: 'net-2-014', continuation: 'Reprendre à la section 5.3.', locale: 'fr' })).toBe(
      'Continue exactement là où tu t’es arrêté. Dernière note valide reçue : uid net-2-014. Ne répète aucune note déjà produite. Même format, mêmes règles, uid qui continuent la numérotation. Reprends à : Reprendre à la section 5.3.',
    );
    const fallback = buildContinuePrompt({ locale: 'en' });
    expect(fallback).toContain('uid unknown');
    expect(unresolvedPlaceholders(fallback)).toEqual([]);
  });

  it('builds the plan prompt (T13)', () => {
    const prompt = buildPlanPrompt({ locale: 'fr', batchSize: 50, documentType: 'manuel' });
    expect(prompt).toContain('découpage en lots de 50 cartes environ');
    expect(prompt).toContain('Type de document : manuel');
    expect(prompt.startsWith('RÔLE')).toBe(true);
    expect(prompt.endsWith(TEMPLATES.fr.document)).toBe(true);
    expect(unresolvedPlaceholders(prompt)).toEqual([]);
  });

  it('builds the batch prompt (T14), short or with the full rules', () => {
    expect(buildBatchPrompt({ n: 2, sections: ['3.1', '3.2'], prefix: 'eth', locale: 'fr' })).toBe(
      'TÂCHE (lot)\nGénère le lot 2 : sections 3.1, 3.2. Même format, mêmes règles, uid qui continuent la numérotation (préfixe eth). N’utilise que ces sections.',
    );
    const full = buildBatchPrompt({
      n: 1,
      sections: '1 à 2',
      prefix: 'eth',
      locale: 'en',
      base: { task: 'course-pack', format: 'yaml' },
    });
    expect(full).toContain('TASK (batch)\nGenerate batch 1: sections 1 à 2.');
    expect(full).toContain('uid: eth-1-001');
    expect(full).not.toContain(TEMPLATES.en.document);
    expect(unresolvedPlaceholders(full)).toEqual([]);
  });
});
