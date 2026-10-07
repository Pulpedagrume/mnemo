import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rating, RenderedCard, ReviewLog, StudyQueue } from '@mnemo/core';
import { afterAnswer, nextCard, removeFromQueue, renderCard, resolveLocale } from '@mnemo/core';
import type {
  CustomStudy,
  LoadedQueue,
  ServiceContext,
  StudyItem,
  UndoEntry,
} from '@mnemo/services';
import {
  answer,
  buryCard,
  loadStudyItem,
  loadStudyQueue,
  undoAnswer,
  updateCards,
} from '@mnemo/services';
import { useDataVersion, useServices } from '../../app/services';
import type { CardPhase } from '../../components/study/StudyCard';
import type { WidgetOutcome } from '../../components/study/widgets/common';

export interface CurrentCard {
  item: StudyItem;
  rendered: RenderedCard;
  phase: CardPhase;
  hints: number;
  shownAt: number;
  outcome?: WidgetOutcome;
}

interface UndoStep {
  entry: UndoEntry;
  queueBefore: StudyQueue;
}

export type SessionStatus = 'loading' | 'card' | 'wait' | 'done' | 'error';

export interface SessionState {
  status: SessionStatus;
  current?: CurrentCard;
  waitUntil?: number;
  queue?: StudyQueue;
  cram: boolean;
  logs: ReviewLog[];
  canUndo: boolean;
  error?: Error;
}

const MAX_UNDO = 10;

/**
 * Computes the next screen of the session: the next displayable card (broken or deleted cards
 * are skipped), a "come back later" state, or the end of the session.
 */
async function nextState(
  ctx: ServiceContext,
  meta: LoadedQueue,
  start: StudyQueue,
  logs: ReviewLog[],
  canUndo: boolean,
  locale: 'fr' | 'en',
): Promise<SessionState> {
  let queue = start;
  for (;;) {
    meta.queue = queue;
    const base = { queue, cram: meta.cram, logs, canUndo };
    const next = nextCard(queue, ctx.clock.now(), meta.learnAheadMinutes);
    if (next.kind === 'done') return { ...base, status: 'done' };
    if (next.kind === 'wait') return { ...base, status: 'wait', waitUntil: next.until };
    const item = await loadStudyItem(ctx, next.card.id, locale);
    let rendered: RenderedCard | null = null;
    if (item) {
      try {
        rendered = renderCard(item.note, item.noteType, item.card.ord, { rng: ctx.rng, locale });
      } catch {
        rendered = null;
      }
    }
    if (item && rendered) {
      return {
        ...base,
        status: 'card',
        current: { item, rendered, phase: 'question', hints: 0, shownAt: ctx.clock.now() },
      };
    }
    queue = removeFromQueue(queue, new Set([next.card.id]));
  }
}

/**
 * Drives a study session: picks the next card, reveals, records answers, undo (10 steps),
 * bury/suspend/flag. All persistence goes through @mnemo/services. The owner remounts the
 * component using this hook when the deck or the study mode changes.
 */
export function useStudySession(deckId: string, custom: CustomStudy | undefined, language: string) {
  const ctx = useServices();
  const bump = useDataVersion((s) => s.bump);
  const locale = resolveLocale(language);
  const loaded = useRef<LoadedQueue | null>(null);
  const undoStack = useRef<UndoStep[]>([]);
  const busy = useRef(false);
  const [state, setState] = useState<SessionState>({
    status: 'loading',
    cram: false,
    logs: [],
    canUndo: false,
  });

  const show = useCallback(
    async (queue: StudyQueue, logs: ReviewLog[]) => {
      const meta = loaded.current;
      if (!meta) return;
      setState(await nextState(ctx, meta, queue, logs, undoStack.current.length > 0, locale));
    },
    [ctx, locale],
  );

  useEffect(() => {
    const run = { cancelled: false };
    const alive = () => !run.cancelled;
    loadStudyQueue(ctx, deckId, custom).then(
      async (q) => {
        if (!alive()) return;
        loaded.current = q;
        const next = await nextState(ctx, q, q.queue, [], false, locale);
        if (alive()) setState(next);
      },
      (error: unknown) => {
        if (alive())
          setState({
            status: 'error',
            cram: false,
            logs: [],
            canUndo: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );
    return () => {
      run.cancelled = true;
    };
    // The session is loaded once; the page remounts this hook for another deck or mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-checks the queue (used while waiting for learning cards). */
  const refresh = useCallback(() => {
    if (state.queue) void show(state.queue, state.logs);
  }, [show, state.queue, state.logs]);

  const reveal = useCallback((outcome?: WidgetOutcome) => {
    setState((s) => {
      if (!s.current || s.current.phase === 'answer') return s;
      const current: CurrentCard = { ...s.current, phase: 'answer' };
      if (outcome) current.outcome = outcome;
      return { ...s, current };
    });
  }, []);

  const showHint = useCallback(() => {
    setState((s) =>
      s.current &&
      s.current.phase === 'question' &&
      s.current.hints < s.current.rendered.hints.length
        ? { ...s, current: { ...s.current, hints: s.current.hints + 1 } }
        : s,
    );
  }, []);

  const rate = useCallback(
    async (rating: Rating) => {
      const { current, queue } = state;
      const meta = loaded.current;
      if (!current || !queue || !meta || current.phase !== 'answer' || busy.current) return;
      busy.current = true;
      try {
        const params = {
          cardId: current.item.card.id,
          rating,
          hintsUsed: current.hints,
          durationMs: ctx.clock.now() - current.shownAt,
          cram: meta.cram,
        };
        const res = await answer(
          ctx,
          current.outcome?.answer === undefined
            ? params
            : { ...params, answer: current.outcome.answer },
        );
        undoStack.current = [...undoStack.current, { entry: res.undo, queueBefore: queue }].slice(
          -MAX_UNDO,
        );
        const nextQueue = meta.cram
          ? removeFromQueue(queue, new Set([res.card.id]))
          : afterAnswer(queue, res.card, meta.endOfDay);
        bump();
        await show(nextQueue, [...state.logs, res.log]);
      } finally {
        busy.current = false;
      }
    },
    [ctx, bump, show, state],
  );

  const undo = useCallback(async () => {
    const step = undoStack.current.pop();
    if (!step || busy.current) return;
    busy.current = true;
    try {
      await undoAnswer(ctx, step.entry);
      bump();
      const logs = state.logs.filter((l) => l.id !== step.entry.logId);
      await show(step.queueBefore, logs);
    } finally {
      busy.current = false;
    }
  }, [ctx, bump, show, state.logs]);

  /** Removes the current card from the session after bury/suspend. */
  const dropCurrent = useCallback(
    async (op: 'bury' | 'suspend') => {
      const { current, queue } = state;
      if (!current || !queue) return;
      const id = current.item.card.id;
      if (op === 'bury') await buryCard(ctx, id);
      else await updateCards(ctx, [id], { suspended: true });
      bump();
      await show(removeFromQueue(queue, new Set([id])), state.logs);
    },
    [ctx, bump, show, state],
  );

  const toggleFlag = useCallback(async () => {
    const { current } = state;
    if (!current) return;
    const flag = current.item.card.flag ? 0 : 1;
    await updateCards(ctx, [current.item.card.id], { flag });
    setState((s) =>
      s.current
        ? {
            ...s,
            current: {
              ...s.current,
              item: { ...s.current.item, card: { ...s.current.item.card, flag } },
            },
          }
        : s,
    );
  }, [ctx, state]);

  return {
    state,
    reveal,
    showHint,
    rate,
    undo,
    refresh,
    bury: () => dropCurrent('bury'),
    suspend: () => dropCurrent('suspend'),
    toggleFlag,
  };
}
