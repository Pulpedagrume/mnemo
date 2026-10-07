import type { Note, NoteData, NoteType } from '@mnemo/core';
import type { NoteInput } from '@mnemo/services';

/** Editor form state. Text inputs stay raw strings until saved. */
export interface EditorState {
  noteTypeId: string;
  deckId: string;
  fields: Record<string, string>;
  data?: NoteData;
  tags: string;
  hints: string[];
  explanation: string;
  sourceSection: string;
  sourcePage: string;
  sourceDoc: string;
  sourceUrl: string;
  needsReview: boolean;
}

/** Default structured payload for interactive renderers. */
export function emptyData(renderer: NoteType['renderer']): NoteData | undefined {
  switch (renderer) {
    case 'typed':
      return { kind: 'typed', answers: [''], caseSensitive: false, ignoreAccents: true };
    case 'mcq':
      return {
        kind: 'mcq',
        shuffle: true,
        choices: [
          { text: '', correct: true },
          { text: '', correct: false },
          { text: '', correct: false },
          { text: '', correct: false },
        ],
      };
    case 'truefalse':
      return { kind: 'truefalse', answer: true };
    case 'matching':
      return {
        kind: 'matching',
        pairs: [
          { left: '', right: '' },
          { left: '', right: '' },
        ],
        distractors: [],
      };
    case 'ordering':
      return { kind: 'ordering', steps: ['', '', ''] };
    case 'list':
      return { kind: 'list', items: ['', ''], ordered: false };
    default:
      return undefined;
  }
}

export function emptyEditorState(noteType: NoteType, deckId: string): EditorState {
  const state: EditorState = {
    noteTypeId: noteType.id,
    deckId,
    fields: Object.fromEntries(noteType.fields.map((f) => [f.name.toLowerCase(), ''])),
    tags: '',
    hints: [],
    explanation: '',
    sourceSection: '',
    sourcePage: '',
    sourceDoc: '',
    sourceUrl: '',
    needsReview: false,
  };
  const data = emptyData(noteType.renderer);
  if (data) state.data = data;
  return state;
}

export function editorStateFromNote(note: Note): EditorState {
  const state: EditorState = {
    noteTypeId: note.noteTypeId,
    deckId: note.deckId,
    fields: { ...note.fields },
    tags: note.tags.join(' '),
    hints: [...note.hints],
    explanation: note.explanation ?? '',
    sourceSection: note.source?.section ?? '',
    sourcePage: note.source?.page === undefined ? '' : String(note.source.page),
    sourceDoc: note.source?.doc ?? '',
    sourceUrl: note.source?.url ?? '',
    needsReview: note.needsReview ?? false,
  };
  if (note.data) state.data = structuredClone(note.data);
  return state;
}

export function parseTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

const nonEmpty = (items: readonly string[]) => items.map((s) => s.trim()).filter(Boolean);

/** Drops blank rows from structured data so half-filled forms still save cleanly. */
export function cleanData(data: NoteData | undefined): NoteData | undefined {
  if (!data) return undefined;
  switch (data.kind) {
    case 'typed':
      return { ...data, answers: nonEmpty(data.answers) };
    case 'mcq':
      return {
        ...data,
        choices: data.choices
          .filter((c) => c.text.trim())
          .map((c) => {
            const choice = { text: c.text.trim(), correct: c.correct };
            return c.explanation?.trim()
              ? { ...choice, explanation: c.explanation.trim() }
              : choice;
          }),
      };
    case 'matching':
      return {
        ...data,
        pairs: data.pairs
          .filter((p) => p.left.trim() && p.right.trim())
          .map((p) => ({ left: p.left.trim(), right: p.right.trim() })),
        distractors: nonEmpty(data.distractors),
      };
    case 'ordering':
      return { ...data, steps: nonEmpty(data.steps) };
    case 'list':
      return { ...data, items: nonEmpty(data.items) };
    case 'truefalse':
      return data;
  }
}

/** Converts the form state into the service input. */
export function toNoteInput(state: EditorState): NoteInput {
  const input: NoteInput = {
    noteTypeId: state.noteTypeId,
    deckId: state.deckId,
    fields: Object.fromEntries(Object.entries(state.fields).map(([k, v]) => [k, v.trim()])),
    tags: parseTags(state.tags),
    hints: nonEmpty(state.hints),
  };
  const data = cleanData(state.data);
  if (data) input.data = data;
  if (state.explanation.trim()) input.explanation = state.explanation.trim();
  const source: NonNullable<Note['source']> = {};
  if (state.sourceSection.trim()) source.section = state.sourceSection.trim();
  if (state.sourcePage.trim()) source.page = state.sourcePage.trim();
  if (state.sourceDoc.trim()) source.doc = state.sourceDoc.trim();
  if (state.sourceUrl.trim()) source.url = state.sourceUrl.trim();
  if (Object.keys(source).length > 0) input.source = source;
  if (state.needsReview) input.needsReview = true;
  return input;
}
