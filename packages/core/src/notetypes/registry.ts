import { BUILTIN_NOTE_TYPES, isBuiltinNoteTypeId } from './builtins';
import type { NoteTypeDef } from './types';

/** Note type definitions by id: the built-ins plus extensions registered at startup. */
export interface NoteTypeRegistry {
  /** Adds or replaces an extension definition. Throws for built-in ids. */
  register(def: NoteTypeDef): void;
  /** Removes an extension; built-ins cannot be removed. Returns whether something was removed. */
  unregister(id: string): boolean;
  get(id: string): NoteTypeDef | undefined;
  has(id: string): boolean;
  list(): NoteTypeDef[];
}

export function createNoteTypeRegistry(): NoteTypeRegistry {
  const defs = new Map<string, NoteTypeDef>();
  for (const noteType of BUILTIN_NOTE_TYPES) defs.set(noteType.id, { noteType });
  return {
    register(def) {
      const id = def.noteType.id;
      if (isBuiltinNoteTypeId(id)) {
        throw new Error(`registerNoteType: "${id}" is a built-in note type id`);
      }
      defs.set(id, def);
    },
    unregister(id) {
      if (isBuiltinNoteTypeId(id)) return false;
      return defs.delete(id);
    },
    get: (id) => defs.get(id),
    has: (id) => defs.has(id),
    list: () => [...defs.values()],
  };
}

/** Process-wide registry used by default by generateCardOrds and renderCard. */
export const noteTypeRegistry: NoteTypeRegistry = createNoteTypeRegistry();

/** Registers an extension note type in the default registry. */
export function registerNoteType(def: NoteTypeDef): void {
  noteTypeRegistry.register(def);
}
