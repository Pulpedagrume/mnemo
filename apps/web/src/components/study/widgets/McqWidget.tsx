import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { McqChoice, McqChoiceGrade } from '@mnemo/core';
import { gradeMcq, resolveLocale } from '@mnemo/core';
import { Button } from '../../ui/Button';
import { Markdown } from '../../Markdown';
import { ResultBanner, StatusBadge, statusClass, type WidgetOutcome } from './common';

interface Props {
  choices: readonly McqChoice[];
  display: readonly { index: number; text: string }[];
  multiple: boolean;
  onValidate: (outcome: WidgetOutcome) => void;
}

const STATUS_MAP = { correct: 'correct', wrong: 'wrong', missed: 'missing' } as const;

export function McqWidget({ choices, display, multiple, onValidate }: Props) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const [selected, setSelected] = useState<number[]>([]);
  const [grades, setGrades] = useState<McqChoiceGrade[] | null>(null);
  const [correct, setCorrect] = useState(false);

  const toggle = (index: number) => {
    if (grades) return;
    setSelected((cur) =>
      multiple ? (cur.includes(index) ? cur.filter((i) => i !== index) : [...cur, index]) : [index],
    );
  };

  const validate = () => {
    const result = gradeMcq(choices, selected);
    setGrades(result.details.choices);
    setCorrect(result.correct);
    onValidate({
      correct: result.correct,
      suggestedRating: result.suggestedRating,
      answer: selected.map((i) => choices[i]?.text ?? '').join(' | '),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-slate-700 dark:text-slate-300">
          {multiple ? t('mcq.chooseSeveral') : t('mcq.chooseOne')}
        </legend>
        {display.map(({ index, text }) => {
          const grade = grades?.find((g) => g.index === index);
          const status = grade && grade.status !== 'neutral' ? STATUS_MAP[grade.status] : null;
          const explanation = grades ? choices[index]?.explanation : undefined;
          return (
            <label
              key={index}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border-2 px-3 py-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-600 ${statusClass(status)}`}
            >
              <span className="flex items-start gap-3">
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name="mcq"
                  className="mt-1 size-4 accent-indigo-600"
                  checked={selected.includes(index)}
                  disabled={grades !== null}
                  onChange={() => {
                    toggle(index);
                  }}
                />
                <Markdown source={text} inline className="flex-1" />
                {grade?.label && status && (
                  <StatusBadge status={status} label={grade.label[locale]} />
                )}
              </span>
              {explanation && <Markdown source={explanation} className="ml-7 text-sm" />}
            </label>
          );
        })}
      </fieldset>
      {grades ? (
        <ResultBanner correct={correct} />
      ) : (
        <Button variant="primary" onClick={validate} disabled={selected.length === 0}>
          {t('grade.validate')}
        </Button>
      )}
    </div>
  );
}
