import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Rating } from '@mnemo/core';
import type { CardPhase } from '../../components/study/StudyCard';

interface Options {
  enabled: boolean;
  phase: CardPhase | undefined;
  interactive: boolean;
  ratings: readonly Rating[];
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onHint: () => void;
  onUndo: () => void;
  onEdit: () => void;
  onSuspend: () => void;
  onBury: () => void;
  onFlag: () => void;
  onHelp: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Study keyboard shortcuts: Space reveal then Good, 1–4 ratings, I hint, Z undo, E edit,
 * S suspend, B bury, F flag, ? help. Ignored while typing in a field or with modifiers.
 */
export function useStudyShortcuts(options: Options): void {
  const ref = useRef(options);
  useLayoutEffect(() => {
    ref.current = options;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const o = ref.current;
      if (!o.enabled || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      let handled = true;
      if (key === ' ' || key === 'enter') {
        // Let Enter activate focused buttons natively.
        if (key === 'enter' && e.target instanceof HTMLButtonElement) return;
        if (o.phase === 'question' && !o.interactive) o.onReveal();
        else if (o.phase === 'answer' && o.ratings.includes(3)) o.onRate(3);
        else handled = false;
      } else if (['1', '2', '3', '4'].includes(key)) {
        const rating = Number(key) as Rating;
        if (o.phase === 'answer' && o.ratings.includes(rating)) o.onRate(rating);
        else handled = false;
      } else if (key === 'i') o.onHint();
      else if (key === 'z') o.onUndo();
      else if (key === 'e') o.onEdit();
      else if (key === 's') o.onSuspend();
      else if (key === 'b') o.onBury();
      else if (key === 'f') o.onFlag();
      else if (key === '?') o.onHelp();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
