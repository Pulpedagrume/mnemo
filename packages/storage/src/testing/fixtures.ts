import {
  CardSchema,
  DEFAULT_BEHAVIOR,
  DEFAULT_LIMITS,
  DeckSchema,
  ImportBatchSchema,
  MediaSchema,
  NoteSchema,
  NoteTypeSchema,
  PresetSchema,
  ReviewLogSchema,
  SettingRowSchema,
  blankMemory,
  type Card,
  type Deck,
  type ImportBatch,
  type Media,
  type Note,
  type NoteType,
  type Preset,
  type ReviewLog,
  type SettingRow,
} from '@mnemo/core';

/**
 * Factories of valid entities (parsed with the core schemas) for storage and service tests.
 * Ids come from a module-level counter (`deck-000001`, …) unless overridden.
 */
let sequence = 0;

export function nextTestId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

/** Default timestamp of fixtures. */
export const T0 = 1_700_000_000_000;

const sync = { createdAt: T0, updatedAt: T0 };

export function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return DeckSchema.parse({ id: nextTestId('deck'), name: 'Deck', ...sync, ...overrides });
}

export function makePreset(overrides: Partial<Preset> = {}): Preset {
  return PresetSchema.parse({
    id: nextTestId('preset'),
    name: 'Preset',
    algorithm: 'fsrs',
    params: {},
    limits: DEFAULT_LIMITS,
    behavior: DEFAULT_BEHAVIOR,
    ...sync,
    ...overrides,
  });
}

export function makeNoteType(overrides: Partial<NoteType> = {}): NoteType {
  return NoteTypeSchema.parse({
    id: nextTestId('notetype'),
    name: 'Basic',
    builtin: false,
    renderer: 'basic',
    fields: [{ name: 'front', required: true }, { name: 'back' }],
    templates: [{ name: 'Card 1', front: '{{front}}', back: '{{back}}' }],
    ...sync,
    ...overrides,
  });
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return NoteSchema.parse({
    id: nextTestId('note'),
    noteTypeId: 'basic',
    fields: { front: 'Question', back: 'Answer' },
    tags: [],
    deckId: 'deck-default',
    hints: [],
    ...sync,
    ...overrides,
  });
}

export function makeCard(overrides: Partial<Card> = {}): Card {
  return CardSchema.parse({
    ...blankMemory(T0),
    id: nextTestId('card'),
    noteId: 'note-default',
    ord: 0,
    deckId: 'deck-default',
    suspended: false,
    flag: 0,
    leech: false,
    ...sync,
    ...overrides,
  });
}

export function makeReviewLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
  return ReviewLogSchema.parse({
    id: nextTestId('log'),
    cardId: 'card-default',
    ts: T0,
    rating: 3,
    durationMs: 4_000,
    stateBefore: 'new',
    stateAfter: 'learning',
    intervalBefore: 0,
    intervalAfter: 0,
    dueBefore: T0,
    dueAfter: T0 + 600_000,
    algorithm: 'fsrs',
    presetId: 'preset-default',
    paramsHash: 'abcd1234',
    cram: false,
    hintUsed: 0,
    ...overrides,
  });
}

export function makeMedia(overrides: Partial<Media> = {}): Media {
  const id = nextTestId('media');
  return MediaSchema.parse({
    id,
    sha256: sequence.toString(16).padStart(64, '0'),
    mime: 'image/png',
    size: 3,
    name: 'image.png',
    ...sync,
    ...overrides,
  });
}

export function makeImportBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return ImportBatchSchema.parse({
    id: nextTestId('batch'),
    createdAt: T0,
    fileName: 'cards.json',
    format: 'mnemo/1',
    mode: 'add',
    counts: { added: 0 },
    report: { issues: [] },
    noteIds: [],
    previousVersions: [],
    ...overrides,
  });
}

export function makeSetting(key: string, value: unknown, updatedAt = T0): SettingRow {
  return SettingRowSchema.parse({ key, value, updatedAt });
}
