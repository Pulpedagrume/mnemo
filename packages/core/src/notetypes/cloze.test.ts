import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  clozeHints,
  clozeNumbers,
  parseCloze,
  renderClozeBack,
  renderClozeFront,
  stripCloze,
} from './cloze';

const codes = (text: string): string[] => parseCloze(text).problems.map((p) => p.code);

describe('parseCloze', () => {
  it('parses simple clozes into text and cloze segments', () => {
    const r = parseCloze('La capitale de la France est {{c1::Paris}}.');
    expect(r.segments).toEqual([
      { type: 'text', text: 'La capitale de la France est ' },
      { type: 'cloze', n: 1, answer: 'Paris', offset: 29 },
      { type: 'text', text: '.' },
    ]);
    expect(r.problems).toEqual([]);
    expect(r.numbers).toEqual([1]);
  });

  it('parses hints', () => {
    const r = parseCloze('{{c1::Paris::capitale}} et {{c2::Lyon:: }}');
    expect(r.segments[0]).toMatchObject({ n: 1, answer: 'Paris', hint: 'capitale' });
    expect(r.segments[2]).toEqual({ type: 'cloze', n: 2, answer: 'Lyon', offset: 27 });
  });

  it('keeps balanced braces inside answers (LaTeX, sets)', () => {
    const r = parseCloze('{{c1::$\\frac{a}{b}$}} puis {{c2::f(x) = {x}}}');
    const clozes = r.segments.filter((s) => s.type === 'cloze');
    expect(clozes.map((s) => s.answer)).toEqual(['$\\frac{a}{b}$', 'f(x) = {x}']);
    expect(r.problems).toEqual([]);
  });

  it('treats escaped braces as literal', () => {
    const r = parseCloze('{{c1::$\\{1, 2\\}$}}');
    expect(r.segments).toEqual([{ type: 'cloze', n: 1, answer: '$\\{1, 2\\}$', offset: 0 }]);
  });

  it('does not split on :: nested in braces', () => {
    const r = parseCloze('{{c1::{a::b}::hint}}');
    expect(r.segments[0]).toMatchObject({ answer: '{a::b}', hint: 'hint' });
  });

  it('groups several occurrences of the same number into one card', () => {
    const r = parseCloze('{{c1::H}} et {{c1::O}} forment {{c2::H2O}}');
    expect(r.numbers).toEqual([1, 2]);
    expect(renderClozeFront('{{c1::H}} et {{c1::O}} forment {{c2::H2O}}', 1)).toBe(
      '**[…]** et **[…]** forment H2O',
    );
  });

  it('reports a text without cloze', () => {
    expect(codes('pas de trou')).toEqual(['no_cloze']);
    expect(codes('')).toEqual(['no_cloze']);
    expect(parseCloze('{{c::x}} {{c1:x}}').segments).toEqual([
      { type: 'text', text: '{{c::x}} {{c1:x}}' },
    ]);
  });

  it('reports an empty answer', () => {
    const r = parseCloze('a {{c1::  }} b');
    expect(r.problems).toEqual([expect.objectContaining({ code: 'empty_answer', offset: 2 })]);
    expect(codes('{{c1::::hint}}')).toEqual(['empty_answer']);
  });

  it('reports an unterminated cloze with its offset and recovers', () => {
    const r = parseCloze('abc {{c1::Paris');
    expect(r.problems).toEqual([
      expect.objectContaining({ code: 'unterminated_cloze', severity: 'error', offset: 4 }),
      expect.objectContaining({ code: 'no_cloze' }),
    ]);
    expect(r.segments).toEqual([{ type: 'text', text: 'abc {{c1::Paris' }]);
    const recovered = parseCloze('{{c1::abc {{c2::x}}');
    expect(recovered.numbers).toEqual([2]);
    expect(recovered.problems.map((p) => p.code)).toEqual(['unterminated_cloze', 'skipped_number']);
  });

  it('reports unbalanced braces', () => {
    expect(parseCloze('{{c1::{a}}').problems[0]).toMatchObject({
      code: 'unbalanced_braces',
      offset: 0,
    });
    const stray = parseCloze('x {{c1::a}b}}');
    expect(stray.problems).toEqual([
      expect.objectContaining({ code: 'unbalanced_braces', offset: 9 }),
    ]);
    expect(stray.segments[1]).toMatchObject({ answer: 'a}b' });
  });

  it('rejects nested clozes with a suggestion', () => {
    const r = parseCloze('{{c1::outer {{c2::inner}} text}}');
    const nested = r.problems.find((p) => p.code === 'nested_cloze');
    expect(nested).toMatchObject({ severity: 'error', offset: 12 });
    expect(nested?.message.en).toContain('split them into separate clozes');
    expect(nested?.message.fr).toContain('séparez-les');
  });

  it('rejects c0 and absurd numbers', () => {
    const r = parseCloze('{{c0::a}} {{c1::b}}');
    expect(r.problems.map((p) => p.code)).toEqual(['invalid_number']);
    expect(r.numbers).toEqual([1]);
    expect(codes('{{c0::a}}')).toEqual(['invalid_number']);
    expect(codes('{{c1001::a}}')).toEqual(['invalid_number']);
  });

  it('warns about skipped numbers', () => {
    const r = parseCloze('{{c1::a}} {{c3::b}}');
    expect(r.problems).toEqual([
      expect.objectContaining({ code: 'skipped_number', severity: 'warning' }),
    ]);
    expect(r.problems[0]?.message.en).toBe('Skipped cloze numbers: c2.');
    const many = parseCloze('{{c20::a}}').problems[0];
    expect(many?.message.en).toContain('c10…');
  });

  it('accepts multi-line answers and leading zeros', () => {
    expect(parseCloze('{{c01::a\nb}}').segments).toEqual([
      { type: 'cloze', n: 1, answer: 'a\nb', offset: 0 },
    ]);
  });

  it('never throws on arbitrary strings', () => {
    const alphabet = fc.constantFrom('{', '}', 'c', '1', '2', ':', '\\', 'a', ' ', '0');
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: alphabet })), (text) => {
        const r = parseCloze(text);
        expect(Array.isArray(r.segments)).toBe(true);
        renderClozeFront(text, 1);
        renderClozeBack(text, 1);
      }),
      { numRuns: 500 },
    );
  });
});

describe('cloze helpers', () => {
  const text = 'Le {{c1::cœur::organe}} pompe le {{c2::sang}} ; le {{c1:: cœur ::muscle}} bat.';

  it('lists numbers and hints', () => {
    expect(clozeNumbers(text)).toEqual([1, 2]);
    expect(clozeHints(text, 1)).toEqual(['organe', 'muscle']);
    expect(clozeHints(text, 2)).toEqual([]);
    expect(clozeHints('{{c1::a::h}} {{c1::b::h}}', 1)).toEqual(['h']);
  });

  it('renders the front with placeholders for the target only', () => {
    expect(renderClozeFront(text, 1)).toBe('Le **[organe]** pompe le sang ; le **[muscle]** bat.');
    expect(renderClozeFront(text, 2)).toBe('Le cœur pompe le **[…]** ; le  cœur  bat.');
  });

  it('renders the back with the target answers in bold', () => {
    expect(renderClozeBack(text, 1)).toBe('Le **cœur** pompe le sang ; le  **cœur**  bat.');
    expect(renderClozeBack('{{c1::$\\frac{a}{b}$}}', 1)).toBe('**$\\frac{a}{b}$**');
  });

  it('strips cloze syntax', () => {
    expect(stripCloze(text)).toBe('Le cœur pompe le sang ; le  cœur  bat.');
  });
});
