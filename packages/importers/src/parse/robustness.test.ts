import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseImport } from './pipeline';
import { examples, readFixture } from './test/files';

type Corruption =
  | { kind: 'truncate'; at: number }
  | { kind: 'delete'; at: number; length: number }
  | { kind: 'swapQuotes'; at: number; count: number }
  | { kind: 'insert'; at: number; text: string };

const corruption: fc.Arbitrary<Corruption> = fc.oneof(
  fc.record({ kind: fc.constant('truncate' as const), at: fc.nat() }),
  fc.record({
    kind: fc.constant('delete' as const),
    at: fc.nat(),
    length: fc.integer({ min: 1, max: 40 }),
  }),
  fc.record({
    kind: fc.constant('swapQuotes' as const),
    at: fc.nat(),
    count: fc.integer({ min: 1, max: 10 }),
  }),
  fc.record({
    kind: fc.constant('insert' as const),
    at: fc.nat(),
    text: fc.oneof(
      fc.string({ maxLength: 20 }),
      fc.constantFrom(
        ':::',
        '{',
        ']',
        '"',
        '\n- ',
        '\t',
        '{{c1::',
        '```',
        '---\n',
        ',,',
        'Q:',
        '\\',
      ),
    ),
  }),
);

const SMART = [String.fromCharCode(0x201c), String.fromCharCode(0x201d)];

function corrupt(text: string, c: Corruption): string {
  const at = text.length === 0 ? 0 : c.at % text.length;
  switch (c.kind) {
    case 'truncate':
      return text.slice(0, at);
    case 'delete':
      return text.slice(0, at) + text.slice(at + c.length);
    case 'insert':
      return text.slice(0, at) + c.text + text.slice(at);
    case 'swapQuotes': {
      let out = text;
      let from = at;
      for (let k = 0; k < c.count; k++) {
        const i = out.indexOf('"', from);
        if (i < 0) break;
        out = out.slice(0, i) + (SMART[k % 2] ?? '"') + out.slice(i + 1);
        from = i + 1;
      }
      return out;
    }
  }
}

const inputs: [string, string][] = [
  ...examples.entries(),
  ['spec-example.md', readFixture('valid/spec-example.md')],
];

describe('fuzz: corrupted inputs never throw', () => {
  it.each(inputs)('%s', (name, text) => {
    fc.assert(
      fc.property(
        fc.array(corruption, { minLength: 1, maxLength: 3 }),
        fc.boolean(),
        (ops, strict) => {
          const input = ops.reduce(corrupt, text);
          const r = parseImport(input, { fileName: name, strict });
          const c = r.report.counts;
          expect(c.valid).toBe(r.notes.length);
          expect(c.errors + c.warnings + c.infos).toBe(r.report.issues.length);
          expect(c.invalid).toBe(c.notes - c.valid);
          for (const i of r.report.issues) {
            expect((i.excerpt ?? '').length).toBeLessThanOrEqual(200);
            expect(i.message.en, i.message.en).not.toMatch(/^Internal read error/);
          }
        },
      ),
      { numRuns: 40, seed: 20261007 },
    );
  });

  it('arbitrary text never throws in any format', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300 }),
        fc.constantFrom('json', 'yaml', 'markdown', 'csv' as const),
        (text, format) => {
          const r = parseImport(text, { format });
          expect(r.report.counts.valid).toBe(r.notes.length);
          expect(r.report.issues.some((i) => i.message.en.startsWith('Internal read error'))).toBe(
            false,
          );
        },
      ),
      { numRuns: 300, seed: 7 },
    );
  });
});

describe('performance', () => {
  const N = 10_000;
  const notes = Array.from({ length: N }, (_, i): Partial<Record<string, string>> =>
    i % 10 === 0
      ? {
          type: 'cloze',
          uid: `perf-${i}`,
          text: `La note {{c1::numéro ${i}}} est un {{c2::test}}.`,
        }
      : { type: 'basic', uid: `perf-${i}`, front: `Question numéro ${i} ?`, back: `Réponse ${i}.` },
  );

  it(`validates ${N} notes in JSON in < 3 s`, () => {
    const text = JSON.stringify({ format: 'mnemo/1', notes });
    const start = Date.now();
    const r = parseImport(text, { format: 'json' });
    const ms = Date.now() - start;
    expect(r.notes).toHaveLength(N);
    expect(r.report.issues).toEqual([]);
    expect(ms).toBeLessThan(3000);
    console.info(`JSON ${N} notes: ${ms} ms`);
  });

  it(`validates ${N} notes in Markdown in < 3 s`, () => {
    const text = notes
      .map((n) =>
        n.type === 'cloze'
          ? `::: cloze uid=${n.uid ?? ''}\nText: ${n.text ?? ''}\n:::\n`
          : `::: basic uid=${n.uid ?? ''}\nQ: ${n.front ?? ''}\nA: ${n.back ?? ''}\n:::\n`,
      )
      .join('\n');
    const start = Date.now();
    const r = parseImport(text, { format: 'markdown' });
    const ms = Date.now() - start;
    expect(r.notes).toHaveLength(N);
    expect(ms).toBeLessThan(3000);
    console.info(`Markdown ${N} notes: ${ms} ms`);
  });
});
