import { describe, expect, it } from 'vitest';
import { NoteDataSchema } from '@mnemo/core';
import type { ImportCounts, ImportReport } from '../report';
import { parseImport } from './pipeline';
import { fixtures } from './test/files';

interface Expected {
  options?: { strict?: boolean };
  issues: { code: string; severity: string }[];
  counts?: Partial<ImportCounts>;
  truncated?: ImportReport['truncated'];
  continuation?: string;
}

const cases = [...fixtures.keys()]
  .filter(
    (name) => !name.endsWith('.expected.json') && !name.startsWith('.') && !name.includes('/.'),
  )
  .sort();

describe('golden fixtures', () => {
  it('every fixture has an expectation', () => {
    expect(cases.length).toBeGreaterThan(40);
    for (const name of cases) {
      expect(fixtures.has(name.replace(/\.[a-z]+$/, '.expected.json')), name).toBe(true);
    }
  });

  it.each(cases)('%s', (name) => {
    const expected = JSON.parse(
      fixtures.get(name.replace(/\.[a-z]+$/, '.expected.json')) ?? '{}',
    ) as Expected;
    const result = parseImport(fixtures.get(name) ?? '', {
      fileName: name,
      strict: expected.options?.strict ?? false,
    });
    const got = result.report.issues.map((i) => ({ code: i.code, severity: i.severity }));
    expect(got, JSON.stringify(result.report.issues, null, 1)).toEqual(expected.issues);
    if (expected.counts) expect(result.report.counts).toMatchObject(expected.counts);
    if (expected.truncated) expect(result.report.truncated).toEqual(expected.truncated);
    if (expected.continuation !== undefined)
      expect(result.report.continuation).toBe(expected.continuation);
    // Errors only in invalid/ (warnings are allowed anywhere).
    const hasErrors = result.report.counts.errors > 0;
    expect(hasErrors, name).toBe(name.startsWith('invalid/'));
    for (const issue of result.report.issues) {
      expect(issue.message.fr.length).toBeGreaterThan(0);
      expect(issue.message.en.length).toBeGreaterThan(0);
      expect(issue.howToFix.fr.length).toBeGreaterThan(0);
      expect(issue.howToFix.en.length).toBeGreaterThan(0);
      expect((issue.excerpt ?? '').length).toBeLessThanOrEqual(200);
    }
    for (const note of result.notes) {
      if (note.data) expect(NoteDataSchema.safeParse(note.data).success).toBe(true);
      expect(note.cards).toBeGreaterThan(0);
    }
  });
});
