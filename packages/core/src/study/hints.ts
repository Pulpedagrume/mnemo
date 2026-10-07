import type { Rating } from '../model/card';
import type { HintPolicy } from '../model/preset';

/**
 * Applies the preset's hint policy to the user's rating.
 * - none: hints do not change the rating;
 * - capGood: with at least one hint, Easy becomes Good;
 * - forceHard: with at least one hint, any passing rating becomes Hard.
 * Again is never changed.
 */
export function applyHintPolicy(rating: Rating, hintsUsed: number, policy: HintPolicy): Rating {
  if (hintsUsed <= 0 || rating === 1) return rating;
  switch (policy) {
    case 'none':
      return rating;
    case 'capGood':
      return rating === 4 ? 3 : rating;
    case 'forceHard':
      return 2;
  }
}

/** Ratings offered for a button count: 2 → Again/Good, 3 → Again/Good/Easy, 4 → all. */
export function ratingsForButtons(buttons: 2 | 3 | 4): readonly Rating[] {
  if (buttons === 2) return [1, 3];
  if (buttons === 3) return [1, 3, 4];
  return [1, 2, 3, 4];
}
