import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gradeTrueFalse } from '@mnemo/core';
import { Button } from '../../ui/Button';
import { ResultBanner, type WidgetOutcome } from './common';

interface Props {
  answer: boolean;
  onValidate: (outcome: WidgetOutcome) => void;
}

export function TrueFalseWidget({ answer, onValidate }: Props) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [correct, setCorrect] = useState(false);

  const choose = (value: boolean) => {
    const result = gradeTrueFalse(answer, value);
    setChosen(value);
    setCorrect(result.correct);
    onValidate({
      correct: result.correct,
      suggestedRating: result.suggestedRating,
      answer: value ? 'true' : 'false',
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t('truefalse.prompt')} className="grid grid-cols-2 gap-3">
        {[true, false].map((value) => (
          <Button
            key={String(value)}
            size="lg"
            variant={chosen === value ? 'primary' : 'secondary'}
            aria-pressed={chosen === value}
            disabled={chosen !== null}
            onClick={() => {
              choose(value);
            }}
          >
            {value ? t('truefalse.true') : t('truefalse.false')}
          </Button>
        ))}
      </div>
      {chosen !== null && (
        <>
          <ResultBanner correct={correct} />
          <p>
            {t('truefalse.expected', {
              answer: answer ? t('truefalse.true') : t('truefalse.false'),
            })}
          </p>
        </>
      )}
    </div>
  );
}
