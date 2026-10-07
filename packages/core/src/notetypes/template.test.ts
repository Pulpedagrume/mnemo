import { describe, expect, it } from 'vitest';
import { renderTemplate, templateFields } from './template';

const fields = { front: 'Q', back: 'A', extra: '', text: 'x {{c1::y::hint}} {{c2::z}}' };

describe('renderTemplate', () => {
  it('substitutes fields case-insensitively', () => {
    expect(renderTemplate('{{Front}} / {{ BACK }}', { fields, side: 'front' })).toBe('Q / A');
  });

  it('renders unknown fields as empty', () => {
    expect(renderTemplate('[{{Nope}}]', { fields, side: 'front' })).toBe('[]');
  });

  it('renders sections and inverted sections', () => {
    const tpl = '{{#Back}}B={{Back}}{{/Back}}{{#Extra}}E{{/Extra}}{{^Extra}}no extra{{/Extra}}';
    expect(renderTemplate(tpl, { fields, side: 'front' })).toBe('B=Ano extra');
    expect(
      renderTemplate('{{#extra}}x{{/EXTRA}}', { fields: { extra: '  ' }, side: 'front' }),
    ).toBe('');
  });

  it('renders FrontSide on the back only', () => {
    const ctx = { fields, frontSide: 'FRONT' };
    expect(renderTemplate('{{FrontSide}}|{{Back}}', { ...ctx, side: 'back' })).toBe('FRONT|A');
    expect(renderTemplate('{{FrontSide}}|{{Back}}', { ...ctx, side: 'front' })).toBe('|A');
    expect(renderTemplate('{{#FrontSide}}yes{{/FrontSide}}', { ...ctx, side: 'back' })).toBe('yes');
  });

  it('renders cloze, hint and type filters', () => {
    expect(renderTemplate('{{cloze:Text}}', { fields, side: 'front', clozeNumber: 2 })).toBe(
      'x y **[…]**',
    );
    expect(renderTemplate('{{cloze:Text}}', { fields, side: 'back' })).toBe('x **y** z');
    expect(renderTemplate('{{hint:Back}}{{hint:Extra}}', { fields, side: 'front' })).toBe(
      '[[hint:Back]]',
    );
    expect(renderTemplate('{{type:Back}}', { fields, side: 'front' })).toBe('[[type:Back]]');
    expect(renderTemplate('{{text:Back}}{{foo:Back}}', { fields, side: 'front' })).toBe('AA');
  });

  it('does not escape HTML and keeps stray braces', () => {
    expect(renderTemplate('<b>{{Front}}</b> {x} {{', { fields, side: 'front' })).toBe(
      '<b>Q</b> {x} {{',
    );
  });

  it('is lenient with malformed templates', () => {
    expect(renderTemplate('{{#Front}}open', { fields, side: 'front' })).toBe('open');
    expect(renderTemplate('a{{/Front}}b{{}}c', { fields, side: 'front' })).toBe('abc');
  });
});

describe('templateFields', () => {
  it('lists referenced fields, unknown ones and special tags', () => {
    const a = templateFields(
      '{{Front}} {{#Extra}}{{extra}}{{/Extra}} {{cloze:Text}} {{FrontSide}} {{hint:Note}}',
      ['Front', 'Text', 'Extra'],
    );
    expect(a.fields).toEqual(['Front', 'Extra', 'Text', 'Note']);
    expect(a.unknown).toEqual(['Note']);
    expect(a.clozeFields).toEqual(['Text']);
    expect(a.usesFrontSide).toBe(true);
    expect(a.problems).toEqual([]);
    expect(templateFields('{{A}}').unknown).toEqual([]);
  });

  it('reports syntax problems', () => {
    const codes = (t: string): string[] => templateFields(t).problems.map((p) => p.code);
    expect(codes('{{#A}}x')).toEqual(['unclosed_section']);
    expect(codes('{{#A}}x{{/B}}')).toEqual(['unexpected_close', 'unclosed_section']);
    expect(codes('{{}}')).toEqual(['empty_tag']);
    expect(codes('{{foo:A}}')).toEqual(['unknown_filter']);
    expect(templateFields('{{#A}}x').problems[0]).toMatchObject({ offset: 0, severity: 'error' });
  });
});
