import { useTranslation } from 'react-i18next';
import type { McqChoice, NoteData } from '@mnemo/core';
import { ListEditor, RowInput } from './fields';

interface Props {
  data: NoteData;
  onChange: (data: NoteData) => void;
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        className="size-4 accent-indigo-600"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}

/** Form for the structured part of interactive notes (choices, pairs, steps, items…). */
export function DataEditor({ data, onChange }: Props) {
  const { t } = useTranslation();
  switch (data.kind) {
    case 'typed':
      return (
        <div className="flex flex-col gap-3">
          <ListEditor
            label={t('editor.typed.answers')}
            items={data.answers}
            min={1}
            create={() => ''}
            addLabel={t('editor.typed.addAnswer')}
            itemLabel={(i) => t('editor.typed.answerN', { n: i + 1 })}
            onChange={(answers) => {
              onChange({ ...data, answers });
            }}
            render={(value, update, i) => (
              <RowInput
                value={value}
                onChange={update}
                label={t('editor.typed.answerN', { n: i + 1 })}
              />
            )}
          />
          <div className="flex flex-wrap gap-4">
            <Check
              checked={data.caseSensitive}
              label={t('editor.typed.caseSensitive')}
              onChange={(caseSensitive) => {
                onChange({ ...data, caseSensitive });
              }}
            />
            <Check
              checked={data.ignoreAccents}
              label={t('editor.typed.ignoreAccents')}
              onChange={(ignoreAccents) => {
                onChange({ ...data, ignoreAccents });
              }}
            />
          </div>
        </div>
      );
    case 'mcq':
      return (
        <div className="flex flex-col gap-3">
          <ListEditor
            label={t('editor.mcq.choices')}
            items={data.choices}
            min={2}
            max={8}
            create={(): McqChoice => ({ text: '', correct: false })}
            addLabel={t('editor.mcq.addChoice')}
            itemLabel={(i) => t('editor.mcq.choiceN', { n: i + 1 })}
            onChange={(choices) => {
              onChange({ ...data, choices });
            }}
            render={(choice, update, i) => (
              <div className="flex flex-col gap-2">
                <RowInput
                  value={choice.text}
                  label={t('editor.mcq.choiceN', { n: i + 1 })}
                  onChange={(text) => {
                    update({ ...choice, text });
                  }}
                />
                <Check
                  checked={choice.correct}
                  label={t('editor.mcq.correct')}
                  onChange={(correct) => {
                    update({ ...choice, correct });
                  }}
                />
                <RowInput
                  value={choice.explanation ?? ''}
                  label={t('editor.mcq.explanationN', { n: i + 1 })}
                  placeholder={t('editor.mcq.explanationPlaceholder')}
                  onChange={(explanation) => {
                    update({ ...choice, explanation });
                  }}
                />
              </div>
            )}
          />
          {!data.choices.some((c) => c.correct) && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {t('editor.mcq.needCorrect')}
            </p>
          )}
          <Check
            checked={data.shuffle}
            label={t('editor.mcq.shuffle')}
            onChange={(shuffle) => {
              onChange({ ...data, shuffle });
            }}
          />
        </div>
      );
    case 'truefalse':
      return (
        <fieldset className="flex gap-4">
          <legend className="mb-1 font-medium">{t('editor.truefalse.answer')}</legend>
          {[true, false].map((value) => (
            <label key={String(value)} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="tf-answer"
                className="size-4 accent-indigo-600"
                checked={data.answer === value}
                onChange={() => {
                  onChange({ ...data, answer: value });
                }}
              />
              {value ? t('truefalse.true') : t('truefalse.false')}
            </label>
          ))}
        </fieldset>
      );
    case 'matching':
      return (
        <div className="flex flex-col gap-3">
          <ListEditor
            label={t('editor.matching.pairs')}
            items={data.pairs}
            min={2}
            max={12}
            create={() => ({ left: '', right: '' })}
            addLabel={t('editor.matching.addPair')}
            itemLabel={(i) => t('editor.matching.pairN', { n: i + 1 })}
            onChange={(pairs) => {
              onChange({ ...data, pairs });
            }}
            render={(pair, update, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <RowInput
                  value={pair.left}
                  label={t('editor.matching.leftN', { n: i + 1 })}
                  placeholder={t('editor.matching.left')}
                  onChange={(left) => {
                    update({ ...pair, left });
                  }}
                />
                <RowInput
                  value={pair.right}
                  label={t('editor.matching.rightN', { n: i + 1 })}
                  placeholder={t('editor.matching.right')}
                  onChange={(right) => {
                    update({ ...pair, right });
                  }}
                />
              </div>
            )}
          />
          <ListEditor
            label={t('editor.matching.distractors')}
            items={data.distractors}
            create={() => ''}
            addLabel={t('editor.matching.addDistractor')}
            itemLabel={(i) => t('editor.matching.distractorN', { n: i + 1 })}
            onChange={(distractors) => {
              onChange({ ...data, distractors });
            }}
            render={(value, update, i) => (
              <RowInput
                value={value}
                onChange={update}
                label={t('editor.matching.distractorN', { n: i + 1 })}
              />
            )}
          />
        </div>
      );
    case 'ordering':
      return (
        <ListEditor
          label={t('editor.ordering.steps')}
          items={data.steps}
          min={2}
          max={12}
          create={() => ''}
          addLabel={t('editor.ordering.addStep')}
          itemLabel={(i) => t('editor.ordering.stepN', { n: i + 1 })}
          onChange={(steps) => {
            onChange({ ...data, steps });
          }}
          render={(value, update, i) => (
            <RowInput
              value={value}
              onChange={update}
              label={t('editor.ordering.stepN', { n: i + 1 })}
            />
          )}
        />
      );
    case 'list':
      return (
        <div className="flex flex-col gap-3">
          <ListEditor
            label={t('editor.list.items')}
            items={data.items}
            min={1}
            create={() => ''}
            addLabel={t('editor.list.addItem')}
            itemLabel={(i) => t('editor.list.itemN', { n: i + 1 })}
            onChange={(items) => {
              onChange({ ...data, items });
            }}
            render={(value, update, i) => (
              <RowInput
                value={value}
                onChange={update}
                label={t('editor.list.itemN', { n: i + 1 })}
              />
            )}
          />
          <Check
            checked={data.ordered}
            label={t('editor.list.ordered')}
            onChange={(ordered) => {
              onChange({ ...data, ordered });
            }}
          />
        </div>
      );
  }
}
