import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import type { OrderingPositionGrade } from '@mnemo/core';
import { gradeOrdering } from '@mnemo/core';
import { Button } from '../../ui/Button';
import { Markdown } from '../../Markdown';
import { ResultBanner, StatusBadge, statusClass, type WidgetOutcome } from './common';

interface Props {
  steps: readonly string[];
  initial: readonly { index: number; text: string }[];
  onValidate: (outcome: WidgetOutcome) => void;
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const out = items.slice();
  const [item] = out.splice(from, 1);
  if (item !== undefined) out.splice(to, 0, item);
  return out;
}

/** Reorder by drag and drop, or with move up/down buttons (keyboard and touch friendly). */
export function OrderingWidget({ steps, initial, onValidate }: Props) {
  const { t } = useTranslation();
  const [order, setOrder] = useState(initial);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [grades, setGrades] = useState<OrderingPositionGrade[] | null>(null);
  const [correct, setCorrect] = useState(false);
  const [announce, setAnnounce] = useState('');

  const moveTo = (from: number, to: number) => {
    if (grades || to < 0 || to >= order.length) return;
    const item = order[from];
    setOrder((cur) => move(cur, from, to));
    if (item) setAnnounce(t('ordering.moved', { item: item.text, position: to + 1 }));
  };

  const validate = () => {
    const result = gradeOrdering(
      steps,
      order.map((o) => o.index),
    );
    setGrades(result.details.positions);
    setCorrect(result.correct);
    onValidate({
      correct: result.correct,
      suggestedRating: result.suggestedRating,
      answer: order.map((o) => o.text).join(' > '),
    });
  };

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragFrom !== null) moveTo(dragFrom, to);
    setDragFrom(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <ol className="flex flex-col gap-2">
        {order.map((item, position) => {
          const grade = grades?.[position];
          const status = grade ? (grade.correct ? 'correct' : 'wrong') : null;
          return (
            <li
              key={item.index}
              draggable={!grades}
              onDragStart={() => {
                setDragFrom(position);
              }}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                onDrop(e, position);
              }}
              className={`flex items-center gap-2 rounded-lg border-2 px-2 py-2 ${statusClass(status)}`}
            >
              {!grades && (
                <GripVertical
                  aria-hidden
                  size={18}
                  className="shrink-0 cursor-grab text-slate-500"
                />
              )}
              <span className="w-6 shrink-0 text-center font-semibold">{position + 1}.</span>
              <Markdown source={item.text} inline className="flex-1" />
              {grade && status && (
                <StatusBadge status={status} label={t(`grade.status.${status}`)} />
              )}
              {!grades && (
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('ordering.moveUp', { item: item.text })}
                    disabled={position === 0}
                    onClick={() => {
                      moveTo(position, position - 1);
                    }}
                  >
                    <ArrowUp aria-hidden size={16} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('ordering.moveDown', { item: item.text })}
                    disabled={position === order.length - 1}
                    onClick={() => {
                      moveTo(position, position + 1);
                    }}
                  >
                    <ArrowDown aria-hidden size={16} />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {grades ? (
        <>
          <ResultBanner correct={correct} />
          {!correct && (
            <div>
              <p className="font-semibold">{t('ordering.correctOrder')}</p>
              <ol className="list-decimal pl-6">
                {steps.map((s, i) => (
                  <li key={i}>
                    <Markdown source={s} inline />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      ) : (
        <Button variant="primary" onClick={validate}>
          {t('grade.validate')}
        </Button>
      )}
    </div>
  );
}
