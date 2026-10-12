import { describe, expect, it } from 'vitest';
import { manualClock, seededRng } from '@mnemo/core';
import type { Note } from '@mnemo/core';
import { createMemoryRepository } from '@mnemo/storage';
import {
  assistantAllowed,
  buildAssistantMessages,
  createDeck,
  createNote,
  createServiceContext,
  deckAssistantState,
  gatherAssistantContext,
  keywords,
  noteToText,
  selectContext,
  setDeckAssistant,
  updateSettings,
} from './index';

function setup() {
  const repo = createMemoryRepository();
  const clock = manualClock(Date.UTC(2026, 9, 12, 10));
  return createServiceContext({ repo, clock, rng: seededRng(1), deviceTimeZone: 'Europe/Paris' });
}

const base = { tags: [], hints: [] };

describe('assistant permissions', () => {
  it('is off unless enabled globally and for the deck or an ancestor', () => {
    expect(assistantAllowed({ aiEnabled: false, aiDecks: ['a'] }, ['a'])).toBe(false);
    expect(assistantAllowed({ aiEnabled: true, aiDecks: [] }, ['a'])).toBe(false);
    expect(assistantAllowed({ aiEnabled: true, aiDecks: ['root'] }, ['child', 'root'])).toBe(true);
  });

  it('toggles a deck and reports inherited permissions', async () => {
    const ctx = setup();
    const child = await createDeck(ctx, 'Bio::Cellule');
    const root = child.parentId ?? '';
    await updateSettings(ctx, { aiEnabled: true });
    expect(await deckAssistantState(ctx, child.id)).toEqual({ allowed: false, inherited: false });
    await setDeckAssistant(ctx, root, true);
    expect(await deckAssistantState(ctx, child.id)).toEqual({ allowed: true, inherited: true });
    expect(await deckAssistantState(ctx, root)).toEqual({ allowed: true, inherited: false });
    await setDeckAssistant(ctx, root, false);
    expect(await deckAssistantState(ctx, child.id)).toEqual({ allowed: false, inherited: false });
  });
});

describe('assistant context', () => {
  it('renders fields and structured answers as plain text', () => {
    const note = {
      fields: { question: 'Pairs ?', extra: ' ' },
      data: {
        kind: 'mcq',
        shuffle: true,
        choices: [
          { text: '2', correct: true },
          { text: '3', correct: false },
        ],
      },
      explanation: 'Divisibles par 2.',
    } as unknown as Note;
    expect(noteToText(note)).toBe(
      'question: Pairs ?\n- [x] 2\n- [ ] 3\nExplanation: Divisibles par 2.',
    );
  });

  it('extracts keywords without accents nor stop words', () => {
    expect(keywords('Où se trouve l’ADN des cellules eucaryotes ?')).toEqual([
      'trouve',
      'adn',
      'cellules',
      'eucaryotes',
    ]);
  });

  it('sends small decks whole, pinned note first', () => {
    const entries = [
      { id: 'a', text: 'alpha' },
      { id: 'b', text: 'beta' },
    ];
    expect(selectContext(entries, 'x', 100, 'b')).toEqual(['beta', 'alpha']);
  });

  it('ranks notes by rare question words within the budget', () => {
    const filler = 'mot '.repeat(40);
    const entries = [
      { id: '1', text: `mitochondrie énergie ${filler}` },
      { id: '2', text: `noyau ADN ${filler}` },
      { id: '3', text: `ribosome protéines ${filler}` },
      { id: '4', text: `membrane ${filler}` },
    ];
    const picked = selectContext(entries, 'Où est l’ADN, dans le noyau ?', 400);
    expect(picked).toHaveLength(1);
    expect(picked[0]).toContain('noyau ADN');
  });

  it('builds messages with rules, recent history, deck content and the question', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 ? ('assistant' as const) : ('user' as const),
      content: String(i),
    }));
    const messages = buildAssistantMessages({
      locale: 'fr',
      deckName: 'Bio',
      context: ['Q: A ?\nA: B.'],
      currentNote: 'Q: C ?',
      history,
      question: '  Pourquoi ?  ',
    });
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('« Bio »');
    expect(messages[0]?.content).toContain('<cards>\nQ: A ?\nA: B.\n</cards>');
    expect(messages).toHaveLength(1 + 8 + 1);
    const last = messages.at(-1)?.content ?? '';
    expect(last).not.toContain('<cards>');
    expect(last).toContain('<card>\nQ: C ?\n</card>');
    expect(last.endsWith('Question : Pourquoi ?')).toBe(true);
  });

  it('gathers the deck subtree notes and the current note separately', async () => {
    const ctx = setup();
    const child = await createDeck(ctx, 'Bio::Cellule');
    const other = await createDeck(ctx, 'Histoire');
    const { note } = await createNote(ctx, {
      ...base,
      noteTypeId: 'basic',
      deckId: child.id,
      fields: { front: 'Rôle de la mitochondrie ?', back: 'Produire l’ATP.' },
    });
    await createNote(ctx, {
      ...base,
      noteTypeId: 'basic',
      deckId: child.id,
      fields: { front: 'Où est l’ADN ?', back: 'Dans le noyau.' },
    });
    await createNote(ctx, {
      ...base,
      noteTypeId: 'basic',
      deckId: other.id,
      fields: { front: 'Date de 1789 ?', back: 'Révolution.' },
    });
    const got = await gatherAssistantContext(ctx, {
      deckId: child.parentId ?? '',
      noteId: note.id,
      question: 'Explique',
    });
    expect(got.deckName).toBe('Bio');
    expect(got.currentNote).toContain('mitochondrie');
    expect(got.context).toEqual(['front: Où est l’ADN ?\nback: Dans le noyau.']);
  });
});
