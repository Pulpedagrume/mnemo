import { describe, expect, it } from 'vitest';
import { builtinNoteType } from './builtins';
import { noteFingerprintInput, normalizeForFingerprint, primaryText } from './fingerprint';
import type { NoteTypeSpec } from './types';

const type = (id: string): NoteTypeSpec => {
  const t = builtinNoteType(id);
  if (!t) throw new Error(id);
  return t;
};

describe('normalizeForFingerprint', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeForFingerprint('  Quelle   est\n la CAPITALE ?  ')).toBe(
      'quelle est la capitale ?',
    );
  });

  it('strips Markdown syntax', () => {
    expect(normalizeForFingerprint('# Titre\n\n- **gras** et _italique_ et ~~barré~~')).toBe(
      'titre gras et italique et barré',
    );
    expect(
      normalizeForFingerprint('Voir [la doc](https://x.y) ![schéma](a.png) <https://a.b>'),
    ).toBe('voir la doc schéma https://a.b');
    expect(normalizeForFingerprint('```ts\nconst a = `x`;\n```')).toBe('const a = x;');
    expect(normalizeForFingerprint('> cité\n1. un\n2) deux\n* trois')).toBe('cité un deux trois');
    expect(normalizeForFingerprint('snake_case_name et __fort__')).toBe('snake_case_name et fort');
  });

  it('replaces cloze syntax by answers', () => {
    expect(normalizeForFingerprint('La {{c1::Capitale::indice}} est {{c2::Paris}}')).toBe(
      'la capitale est paris',
    );
  });

  it('normalizes Unicode', () => {
    expect(normalizeForFingerprint('é')).toBe(normalizeForFingerprint('é'));
  });
});

describe('primaryText and noteFingerprintInput', () => {
  it('uses the main field of each type', () => {
    expect(primaryText({ fields: { front: 'F', back: 'B' } }, type('basic'))).toBe('F');
    expect(primaryText({ fields: { text: 'T', extra: 'E' } }, type('cloze'))).toBe('T');
    expect(primaryText({ fields: { statement: 'S' } }, type('truefalse'))).toBe('S');
    expect(primaryText({ fields: { question: 'Q' } }, type('mcq'))).toBe('Q');
  });

  it('falls back to the pairs of a matching note without question', () => {
    const note = {
      fields: {},
      data: {
        kind: 'matching' as const,
        pairs: [
          { left: 'a', right: '1' },
          { left: 'b', right: '2' },
        ],
        distractors: [],
      },
    };
    expect(primaryText(note, type('matching'))).toBe('a = 1\nb = 2');
  });

  it('prefixes the note type id', () => {
    expect(noteFingerprintInput({ fields: { front: '**Bonjour**  Monde' } }, type('basic'))).toBe(
      'basic\u0000bonjour monde',
    );
    expect(noteFingerprintInput({ fields: { text: '{{c1::Bonjour}} monde' } }, type('cloze'))).toBe(
      'cloze\u0000bonjour monde',
    );
  });
});
