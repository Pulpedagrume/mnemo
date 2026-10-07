import { describe, expect, it } from 'vitest';
import type { ImportDocument } from '../format/schema';
import { csvCell, exportDocument, orderDocument } from '.';
import { escapeValue } from './markdownText';

/** A hand-written document using the tolerant forms (strings for lists, compact MCQ…). */
const doc: ImportDocument = {
  format: 'mnemo/1',
  meta: { title: 'T' },
  defaults: { deck: 'Main', tags: 'a, b', type: 'basic' },
  notes: [
    {
      type: 'mcq',
      uid: 'm1',
      question: 'Pick:\n- [x] not a choice',
      choices: ['One', 'Two\nlines', { text: 'Three', correct: true }],
      answers: ['A', 2],
      tags: 'x y',
      hint: ['h1', 'h2'],
      source: 'Book',
      media: ['img1'],
    },
    {
      type: 'typed',
      deck: 'Other',
      front: 'Code:\n```\nKey: value\n:::\n```\nNote: careful\n@deck X',
      answer: ['a | b', 'c'],
      source: { doc: '{json-like}' },
    },
    { type: 'list', question: 'Items\n1. fake', items: ['i1'], ordered: true },
    {
      type: 'matching',
      pairs: [
        { left: 'a -> b', right: 'c' },
        { left: 'd', right: 'e' },
      ],
    },
    { type: 'custom:t', fields: { 'Bad name': 'v', Good: '', Fine: '\nstarts on next line' } },
    { type: 'basic', front: 'f', back: 'b', tags: ['with space'], source: { page: 3 } },
  ],
};

describe('Markdown edge cases', () => {
  it('escapes structure-like lines, warns about every loss', () => {
    const { text, warnings } = exportDocument(doc, 'markdown');
    expect(text).toMatchInlineSnapshot(`
      "---
      format: mnemo/1
      deck: Main
      tags:
        - a
        - b
      ---

      ::: mcq uid=m1 tags="x y"
      Q: Pick:
       - [x] not a choice
      - [x] One
      - [x] Two lines
      - [x] Three
      Hint: h1
      Hint: h2
      Source: Book
      :::

      @deck Other

      ::: typed
      Q: Code:
      \`\`\`
      Key: value
       :::
      \`\`\`
       Note: careful
       @deck X
      Answer: a | b | c
      Source: {"doc":"{json-like}"}
      :::

      @deck Main

      ::: list ordered=true
      Q: Items
       1. fake
      1. i1
      :::

      ::: matching
      - a -> b => c
      - d => e
      :::

      ::: custom:t
      Fine:
      starts on next line
      :::

      ::: basic tags="with space"
      Q: f
      A: b
      Source: {"page":3}
      :::
      "
    `);
    expect(warnings).toMatchInlineSnapshot(`
      [
        "Document keys not representable in Markdown, dropped: meta",
        "defaults.type is not exported to Markdown",
        "Note m1: Q line(s) 2 indented by one space (escaped)",
        "Note m1: line breaks in a choice replaced by spaces",
        "Note m1: media references are not exported",
        "Note #2: Q line(s) 4, 6, 7 indented by one space (escaped)",
        "Note #2: a typed answer contains "|": variants will not be split back correctly",
        "Note #3: Q line(s) 2 indented by one space (escaped)",
        "Note #4: a left item contains an arrow: not reversible",
        "Note #5: field "Bad name" has no valid Markdown label; skipped",
        "Note #6: tag "with space" contains spaces: it will be split on import",
      ]
    `);
  });

  it('keeps code and math verbatim except for ::: lines', () => {
    const value = ['```', 'A: x', ':::', '```', '$$', 'B: y', '$$', '$$ inline $$', 'C: z'].join(
      '\n',
    );
    const { text, escapedLines } = escapeValue(value);
    expect(escapedLines).toEqual([3, 9]);
    expect(text.split('\n')[1]).toBe('A: x');
    expect(text.split('\n')[5]).toBe('B: y');
  });
});

describe('CSV edge cases', () => {
  it('quotes cells only when needed', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(' lead')).toBe('" lead"');
  });

  it('applies compact MCQ answers and warns about lost data', () => {
    const { text, warnings } = exportDocument(doc, 'csv');
    expect(text).toMatchInlineSnapshot(`
      "type,deck,tags,uid,front,back,text,extra,hint,explanation,source,question,choice1,choice2,choice3,choice4,choice5,choice6,choice7,choice8,correct
      mcq,Main,x y,m1,,,,,h1 | h2,,Book,"Pick:
      - [x] not a choice",One,"Two
      lines",Three,,,,,,1|2|3
      basic,Main,with space,,f,b,,,,,"{""page"":3}",,,,,,,,,,
      "
    `);
    expect(warnings).toMatchInlineSnapshot(`
      [
        "Notes not representable in CSV, skipped: #2 (typed), #3 (list), #4 (matching), #5 (custom:t)",
        "several hints joined with " | ": m1",
        "media references not representable, dropped: m1",
        "Some tags contain spaces: they will be split on import",
      ]
    `);
  });
});

describe('orderDocument', () => {
  it('orders document, nested objects and unknown keys last', () => {
    const ordered = orderDocument({
      notes: [
        { back: 'b', zzz: 1, front: 'f', type: 'basic', choices: [{ correct: true, text: 't' }] },
      ],
      noteTypes: [
        { templates: [{ back: 'b', front: 'f', name: 'n' }], id: 'x', name: 'X', fields: ['F'] },
      ],
      format: 'mnemo/1',
    });
    expect(JSON.stringify(ordered)).toBe(
      '{"format":"mnemo/1","noteTypes":[{"id":"x","name":"X","fields":["F"],"templates":[{"name":"n","front":"f","back":"b"}]}],"notes":[{"type":"basic","front":"f","back":"b","choices":[{"text":"t","correct":true}],"zzz":1}]}',
    );
  });
});
