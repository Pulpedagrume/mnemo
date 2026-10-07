import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListGradeDetails } from '@mnemo/core';
import { gradeList } from '@mnemo/core';
import { Button } from '../../ui/Button';
import { inputClass } from '../../ui/Field';
import { Markdown } from '../../Markdown';
import { ResultBanner, StatusBadge, type WidgetOutcome } from './common';

interface Props {
  items: readonly string[];
  ordered: boolean;
  onValidate: (outcome: WidgetOutcome) => void;
  /** Reveal without typing: the user grades themselves with the rating buttons. */
  onReveal: () => void;
}

export function ListWidget({ items, ordered, onValidate, onReveal }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState('');
  const [done, setDone] = useState<
    { correct: boolean; details: ListGradeDetails } | 'revealed' | null
  >(null);

  const validate = () => {
    const typed = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const result = gradeList(items, typed, ordered);
    if (!result) return;
    setDone({ correct: result.correct, details: result.details });
    onValidate({
      correct: result.correct,
      suggestedRating: result.suggestedRating,
      answer: typed.join('\n'),
    });
  };

  if (done === null) {
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor={id} className="font-medium">
          {t('list.typeItems', { count: items.length })}
        </label>
        <textarea
          id={id}
          rows={Math.min(8, items.length + 1)}
          className={inputClass}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={validate} disabled={!text.trim()}>
            {t('grade.validate')}
          </Button>
          <Button
            onClick={() => {
              setDone('revealed');
              onReveal();
            }}
          >
            {t('study.showAnswer')}
          </Button>
        </div>
      </div>
    );
  }

  const missing = done === 'revealed' ? new Set<number>() : new Set(done.details.missing);
  const ListTag = ordered ? 'ol' : 'ul';
  return (
    <div className="flex flex-col gap-3">
      {done !== 'revealed' && <ResultBanner correct={done.correct} />}
      <ListTag className={`${ordered ? 'list-decimal' : 'list-disc'} flex flex-col gap-1 pl-6`}>
        {items.map((item, i) => (
          <li key={i}>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Markdown source={item} inline />
              {done !== 'revealed' && (
                <StatusBadge
                  status={missing.has(i) ? 'missing' : 'correct'}
                  label={missing.has(i) ? t('grade.status.missing') : t('grade.status.correct')}
                />
              )}
            </span>
          </li>
        ))}
      </ListTag>
      {done !== 'revealed' && done.details.extra.length > 0 && (
        <p>
          <StatusBadge status="wrong" label={t('list.extra')} /> {done.details.extra.join(', ')}
        </p>
      )}
    </div>
  );
}
