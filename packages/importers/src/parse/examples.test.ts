import { describe, expect, it } from 'vitest';
import { parseImport } from './pipeline';
import { formatReportText, reportToJson } from './report-text';
import { readExample } from './test/files';

const codes = (r: ReturnType<typeof parseImport>): string[] => r.report.issues.map((i) => i.code);

describe('acceptance — example AI outputs', () => {
  it.each(['course-pack.md', 'course-pack.yaml', 'course-pack.json', 'course-pack.csv'])(
    '%s: 120 notes (80 basic, 25 cloze, 15 mcq) with exactly 3 warnings',
    (name) => {
      const r = parseImport(readExample(name), { fileName: name });
      expect(r.report.counts).toMatchObject({
        notes: 120,
        valid: 120,
        invalid: 0,
        errors: 0,
        warnings: 3,
        infos: 0,
      });
      expect(r.report.counts.byType).toEqual({ basic: 80, cloze: 25, mcq: 15 });
      expect(r.report.counts.cards).toBe(80 + 25 * 2 + 15);
      expect(r.notes.every((n) => n.tags.includes('revision'))).toBe(true);
      expect(new Set(r.notes.map((n) => n.uid)).size).toBe(120);
    },
  );

  it('the four course packs give the same notes', () => {
    const shape = (name: string) =>
      parseImport(readExample(name), { fileName: name }).notes.map((n) => ({
        uid: n.uid,
        noteTypeId: n.noteTypeId,
        deck: n.deck,
        fields: n.fields,
        data: n.data,
        hints: n.hints,
        tags: [...n.tags].sort(),
        explanation: n.explanation,
      }));
    const json = shape('course-pack.json');
    expect(shape('course-pack.yaml')).toEqual(json);
    expect(shape('course-pack.md')).toEqual(json);
    expect(shape('course-pack.csv')).toEqual(json);
  });

  it('A2: with-errors.yaml lists exactly the five problems, partial import possible', () => {
    const text = readExample('with-errors.yaml');
    const r = parseImport(text, { fileName: 'with-errors.yaml' });
    expect(codes(r)).toEqual([
      'alias',
      'cloze_no_hole',
      'mcq_no_correct',
      'duplicate_uid',
      'media_undeclared',
    ]);
    const alias = r.report.issues[0];
    expect(alias).toMatchObject({ severity: 'warning', noteIndex: 1, uid: 'bio-9-002' });
    expect(alias?.suggestion?.fr).toContain('mcq');
    expect(r.notes.map((n) => n.uid)).toEqual([
      'bio-9-001',
      'bio-9-002',
      'bio-9-005',
      'bio-9-006',
      'bio-9-007',
    ]);
    for (const issue of r.report.issues) expect(issue.line).toBeGreaterThan(0);

    const strict = parseImport(text, { fileName: 'with-errors.yaml', strict: true });
    expect(codes(strict)).toEqual([
      'unknown_type',
      'cloze_no_hole',
      'mcq_no_correct',
      'duplicate_uid',
      'media_undeclared',
    ]);
    expect(strict.report.issues[0]).toMatchObject({
      severity: 'error',
      suggestion: { fr: 'type « qcm » → « mcq »', en: 'type "qcm" → "mcq"' },
    });
    expect(strict.notes).toHaveLength(4);

    const fr = formatReportText(r.report, 'fr');
    expect(fr).toContain('Erreurs (3)');
    expect(fr).toContain('Note 4 (uid bio-9-004, ligne');
    expect(formatReportText(r.report, 'en')).toContain('Warnings (2)');
    expect(JSON.parse(reportToJson(r.report))).toEqual(r.report);
  });

  it('A3: truncated.json recovers the first 40 notes', () => {
    const r = parseImport(readExample('truncated.json'), { fileName: 'truncated.json' });
    expect(r.notes).toHaveLength(40);
    expect(codes(r)).toEqual(['truncated']);
    const lastUid = r.notes[39]?.uid;
    expect(r.report.truncated).toEqual({ recovered: 40, lastUid });
    expect(r.report.issues[0]?.message.fr).toContain(
      `40 notes récupérées, dernière uid : ${String(lastUid)}`,
    );
    expect(formatReportText(r.report, 'en')).toContain('File cut off: 40 note(s) recovered');
  });

  it('formats an empty report', () => {
    const r = parseImport('::: basic\nQ: Quelle couleur ?\nA: Bleu\n:::\n');
    expect(formatReportText(r.report, 'fr')).toContain('Aucun problème.');
  });
});
