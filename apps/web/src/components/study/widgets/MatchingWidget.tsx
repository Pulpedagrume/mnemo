import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchingPairGrade } from '@mnemo/core';
import { gradeMatching } from '@mnemo/core';
import { Button } from '../../ui/Button';
import { inputClass } from '../../ui/Field';
import { Markdown } from '../../Markdown';
import { ResultBanner, StatusBadge, statusClass, type WidgetOutcome } from './common';

interface Props {
  pairs: readonly { left: string; right: string }[];
  left: readonly { index: number; text: string }[];
  right: readonly string[];
  onValidate: (outcome: WidgetOutcome) => void;
}

/** Each left item gets a native select of the right-hand options: fully keyboard accessible. */
export function MatchingWidget({ pairs, left, right, onValidate }: Props) {
  const { t } = useTranslation();
  const [assignment, setAssignment] = useState<Record<number, string | null>>({});
  const [grades, setGrades] = useState<MatchingPairGrade[] | null>(null);
  const [correct, setCorrect] = useState(false);

  const validate = () => {
    const result = gradeMatching(pairs, assignment);
    setGrades(result.details.pairs);
    setCorrect(result.correct);
    onValidate({
      correct: result.correct,
      suggestedRating: result.suggestedRating,
      answer: left.map((l) => `${l.text} => ${assignment[l.index] ?? ''}`).join('\n'),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {left.map(({ index, text }) => {
          const grade = grades?.find((g) => g.index === index);
          const selectId = `match-${index}`;
          return (
            <li
              key={index}
              className={`flex flex-col gap-2 rounded-lg border-2 px-3 py-2 ${statusClass(grade?.status ?? null)}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={selectId} className="min-w-0 flex-1">
                  <Markdown source={text} inline />
                </label>
                <select
                  id={selectId}
                  className={`${inputClass} sm:w-64`}
                  value={assignment[index] ?? ''}
                  disabled={grades !== null}
                  onChange={(e) => {
                    setAssignment((cur) => ({ ...cur, [index]: e.target.value || null }));
                  }}
                >
                  <option value="">{t('matching.choose')}</option>
                  {right.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {grade && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={grade.status} label={t(`grade.status.${grade.status}`)} />
                  {grade.status !== 'correct' && (
                    <span>{t('matching.expected', { answer: grade.expected })}</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {grades ? (
        <ResultBanner correct={correct} />
      ) : (
        <Button variant="primary" onClick={validate}>
          {t('grade.validate')}
        </Button>
      )}
    </div>
  );
}
