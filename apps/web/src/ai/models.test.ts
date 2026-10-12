import { describe, expect, it } from 'vitest';
import { stripThinking } from './models';

describe('stripThinking', () => {
  it('removes finished and unfinished reasoning blocks', () => {
    expect(stripThinking('<think>\nhmm\n</think>\n\nLa mitochondrie.')).toBe('La mitochondrie.');
    expect(stripThinking('<think>still thinking')).toBe('');
    expect(stripThinking('Réponse directe.')).toBe('Réponse directe.');
  });
});
