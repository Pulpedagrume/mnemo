import { FIELD, getField } from './builtins';
import { clozeNumbers } from './cloze';
import { noteTypeRegistry, type NoteTypeRegistry } from './registry';
import { renderTemplate, templateFields } from './template';
import type { NoteContent, NoteTypeLike } from './types';

/**
 * Cloze fields of a template-based note type: when its first template uses `{{cloze:Field}}`,
 * the note type behaves like Anki cloze types (one card per cloze number, first template only).
 */
export function templateClozeFields(noteType: NoteTypeLike): string[] {
  const first = noteType.templates[0];
  return first ? templateFields(first.front).clozeFields : [];
}

function templateOrds(note: NoteContent, noteType: NoteTypeLike): number[] {
  const clozeFields = templateClozeFields(noteType);
  if (clozeFields.length > 0) {
    const numbers = new Set<number>();
    for (const name of clozeFields) {
      for (const n of clozeNumbers(getField(note.fields, name))) numbers.add(n);
    }
    return [...numbers].sort((a, b) => a - b).map((n) => n - 1);
  }
  const ords: number[] = [];
  noteType.templates.forEach((template, ord) => {
    const front = renderTemplate(template.front, { fields: note.fields, side: 'front' });
    if (front.trim() !== '') ords.push(ord);
  });
  return ords;
}

/**
 * The `ord` of every card a note produces: template index for basic/template types (only
 * templates whose front is non-empty), cloze number − 1 for cloze, `[0]` for interactive types.
 * An empty array means the note is invalid (no cloze, empty front, missing or mismatched `data`)
 * and must not be saved.
 */
export function generateCardOrds(
  note: NoteContent,
  noteType: NoteTypeLike,
  registry: NoteTypeRegistry = noteTypeRegistry,
): number[] {
  const custom = registry.get(noteType.id)?.generate;
  if (custom) return custom(note, noteType);
  switch (noteType.renderer) {
    case 'basic':
    case 'template':
      return templateOrds(note, noteType);
    case 'cloze':
      return clozeNumbers(getField(note.fields, FIELD.text)).map((n) => n - 1);
    default:
      // Interactive renderers share their name with the NoteData kind they need.
      return note.data?.kind === noteType.renderer ? [0] : [];
  }
}

/** Cards to create and to delete after a note edit (both ascending). */
export function diffCardOrds(
  existingOrds: readonly number[],
  newOrds: readonly number[],
): { toCreate: number[]; toDelete: number[] } {
  const existing = new Set(existingOrds);
  const next = new Set(newOrds);
  const asc = (a: number, b: number): number => a - b;
  return {
    toCreate: [...next].filter((o) => !existing.has(o)).sort(asc),
    toDelete: [...existing].filter((o) => !next.has(o)).sort(asc),
  };
}
