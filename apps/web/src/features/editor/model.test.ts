import { describe, expect, it } from 'vitest';
import { builtinNoteTypeRecords } from '@mnemo/core';
import { cleanData, editorStateFromNote, emptyEditorState, parseTags, toNoteInput } from './model';

const types = Object.fromEntries(builtinNoteTypeRecords(0).map((t) => [t.id, t]));

describe('editor model', () => {
  it('creates empty states per renderer', () => {
    const mcq = types.mcq;
    if (!mcq) throw new Error('missing');
    const state = emptyEditorState(mcq, 'd');
    expect(state.data?.kind).toBe('mcq');
    expect(Object.keys(state.fields)).toEqual(['question']);
  });

  it('parses tags and cleans structured data', () => {
    expect(parseTags('a, b  a\nc')).toEqual(['a', 'b', 'c']);
    expect(
      cleanData({
        kind: 'mcq',
        shuffle: true,
        choices: [
          { text: ' A ', correct: true, explanation: ' ' },
          { text: '', correct: false },
          { text: 'B', correct: false, explanation: 'car' },
        ],
      }),
    ).toEqual({
      kind: 'mcq',
      shuffle: true,
      choices: [
        { text: 'A', correct: true },
        { text: 'B', correct: false, explanation: 'car' },
      ],
    });
    expect(
      cleanData({ kind: 'matching', pairs: [{ left: 'a', right: '' }], distractors: [' ', 'x'] }),
    ).toEqual({ kind: 'matching', pairs: [], distractors: ['x'] });
  });

  it('round-trips a note through the editor state', () => {
    const basic = types.basic;
    if (!basic) throw new Error('missing');
    const state = {
      ...emptyEditorState(basic, 'd'),
      fields: { front: ' Q ', back: 'A' },
      tags: 'x y',
      hints: ['h1', ' '],
      explanation: 'because',
      sourceSection: '5.2',
      sourcePage: '12',
      needsReview: true,
    };
    const input = toNoteInput(state);
    expect(input).toEqual({
      noteTypeId: 'basic',
      deckId: 'd',
      fields: { front: 'Q', back: 'A' },
      tags: ['x', 'y'],
      hints: ['h1'],
      explanation: 'because',
      source: { section: '5.2', page: '12' },
      needsReview: true,
    });
    const back = editorStateFromNote({ ...input, id: 'n', createdAt: 0, updatedAt: 0 });
    expect(back.sourcePage).toBe('12');
    expect(back.tags).toBe('x y');
  });
});
