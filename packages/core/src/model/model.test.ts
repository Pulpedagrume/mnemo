import { describe, expect, it } from 'vitest';
import { seededRng } from '../rng';
import { uuidv7, uuidv7Timestamp, createIdGenerator } from '../id';
import { manualClock } from '../clock';
import { canonicalJson, fnv1a, paramsHash } from '../util/hash';
import {
  CardSchema,
  DEFAULT_BEHAVIOR,
  DEFAULT_LIMITS,
  DEFAULT_SETTINGS,
  NoteDataSchema,
  NoteSchema,
  blankMemory,
  cardMemory,
  deckAncestorPaths,
  deckLeafName,
  normalizeDeckPath,
  settingsFromRows,
} from './index';

describe('uuidv7', () => {
  it('is RFC 9562 shaped, time-ordered and reproducible', () => {
    const id = uuidv7(1_700_000_000_000, seededRng(1));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7Timestamp(id)).toBe(1_700_000_000_000);
    expect(uuidv7(1_700_000_000_000, seededRng(1))).toBe(id);
    expect(uuidv7(1_700_000_000_001, seededRng(1)) > id).toBe(true);
  });

  it('generator uses the injected clock', () => {
    const clock = manualClock(42_000);
    const next = createIdGenerator(clock, seededRng(5));
    expect(uuidv7Timestamp(next())).toBe(42_000);
    expect(next()).not.toBe(next());
  });
});

describe('hash', () => {
  it('canonical JSON ignores key order and undefined', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(paramsHash({ x: 1, y: 2 })).toBe(paramsHash({ y: 2, x: 1 }));
    expect(fnv1a('')).toBe('811c9dc5');
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('deck paths', () => {
  it('normalizes and splits paths', () => {
    expect(normalizeDeckPath(' Réseaux ::  Ethernet ::')).toBe('Réseaux::Ethernet');
    expect(deckLeafName('A::B::C')).toBe('C');
    expect(deckAncestorPaths('A::B::C')).toEqual(['A', 'A::B']);
  });
});

describe('settings', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_SETTINGS.locale).toBe('fr');
    expect(DEFAULT_SETTINGS.rolloverHour).toBe(4);
    expect(DEFAULT_LIMITS.newPerDay).toBe(20);
    expect(DEFAULT_BEHAVIOR.hintPolicy).toBe('capGood');
  });

  it('builds settings from rows, resetting invalid values', () => {
    const s = settingsFromRows([
      { key: 'theme', value: 'dark', updatedAt: 1 },
      { key: 'rolloverHour', value: 99, updatedAt: 1 },
      { key: 'unknown', value: 'x', updatedAt: 1 },
    ]);
    expect(s.theme).toBe('dark');
    expect(s.rolloverHour).toBe(4);
    expect('unknown' in s).toBe(false);
  });
});

describe('note and card schemas', () => {
  const base = { createdAt: 1, updatedAt: 1 };

  it('accepts a valid note with structured data', () => {
    const note = NoteSchema.parse({
      id: 'n1',
      uid: 'eth-4-003',
      noteTypeId: 'mcq',
      fields: { question: 'Q?' },
      data: {
        kind: 'mcq',
        shuffle: true,
        choices: [
          { text: 'A', correct: true },
          { text: 'B', correct: false },
        ],
      },
      tags: ['ccna'],
      deckId: 'd1',
      hints: [],
      ...base,
    });
    expect(note.data?.kind).toBe('mcq');
  });

  it('rejects invalid uids and data', () => {
    expect(() =>
      NoteSchema.parse({
        id: 'n',
        uid: 'bad uid!',
        noteTypeId: 't',
        fields: {},
        tags: [],
        deckId: 'd',
        hints: [],
        ...base,
      }),
    ).toThrow();
    expect(NoteDataSchema.safeParse({ kind: 'ordering', steps: ['only one'] }).success).toBe(false);
  });

  it('round-trips card memory', () => {
    const card = CardSchema.parse({
      ...blankMemory(10),
      id: 'c',
      noteId: 'n',
      ord: 0,
      deckId: 'd',
      newPosition: 0,
      suspended: false,
      flag: 0,
      leech: false,
      lastReview: 5,
      schedulerData: { x: 1 },
      ...base,
    });
    expect(cardMemory(card)).toEqual({
      ...blankMemory(10),
      lastReview: 5,
      schedulerData: { x: 1 },
    });
  });
});
