import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TypedGradeDetails } from '@mnemo/core';
import { gradeTyped } from '@mnemo/core';
import { Button } from '../../ui/Button';
import { inputClass } from '../../ui/Field';
import { ResultBanner, type WidgetOutcome } from './common';

interface Props {
  answers: readonly string[];
  caseSensitive: boolean;
  ignoreAccents: boolean;
  onValidate: (outcome: WidgetOutcome) => void;
}

export function TypedWidget({ answers, caseSensitive, ignoreAccents, onValidate }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ correct: boolean; details: TypedGradeDetails } | null>(
    null,
  );

  const validate = () => {
    const graded = gradeTyped(value, answers, { caseSensitive, ignoreAccents });
    setResult({ correct: graded.correct, details: graded.details });
    onValidate({ correct: graded.correct, suggestedRating: graded.suggestedRating, answer: value });
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!result) validate();
      }}
    >
      <label htmlFor={id} className="font-medium">
        {t('typed.label')}
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        readOnly={result !== null}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      {result ? (
        <>
          <ResultBanner correct={result.correct} />
          {!result.correct && (
            <div className="flex flex-col gap-1">
              <p className="text-sm">{t('typed.diffLegend')}</p>
              <p className="font-mono text-lg break-words">
                {result.details.segments.map((s, i) =>
                  s.type === 'equal' ? (
                    <span key={i}>{s.text}</span>
                  ) : s.type === 'missing' ? (
                    <ins
                      key={i}
                      className="bg-emerald-100 text-emerald-900 underline decoration-2 dark:bg-emerald-900 dark:text-emerald-100"
                    >
                      <span className="sr-only">{t('typed.missing')} </span>
                      {s.text}
                    </ins>
                  ) : (
                    <del
                      key={i}
                      className="bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100"
                    >
                      <span className="sr-only">{t('typed.extra')} </span>
                      {s.text}
                    </del>
                  ),
                )}
              </p>
              <p>{t('typed.expected', { answer: result.details.closest || answers[0] })}</p>
            </div>
          )}
        </>
      ) : (
        <Button type="submit" variant="primary">
          {t('grade.validate')}
        </Button>
      )}
    </form>
  );
}
