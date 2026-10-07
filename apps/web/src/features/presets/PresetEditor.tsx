import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Behavior, Limits, Preset } from '@mnemo/core';
import {
  HINT_POLICIES,
  MIX_MODES,
  NEW_ORDERS,
  ParamValidationError,
  getScheduler,
  listSchedulers,
  resolveLocale,
} from '@mnemo/core';
import { Field, inputClass } from '../../components/ui/Field';
import { ParamForm } from './ParamForm';

/** Validation errors of the draft's parameters, keyed by parameter name. */
export function paramErrors(preset: Preset): Record<string, string> {
  try {
    getScheduler(preset.algorithm).validate(preset.params);
    return {};
  } catch (e) {
    if (!(e instanceof ParamValidationError))
      return { _: e instanceof Error ? e.message : String(e) };
    return Object.fromEntries(e.issues.map((i) => [i.path.split('.')[0] ?? '_', i.message]));
  }
}

function NumberField({
  label,
  help,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label} help={help}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          type="number"
          min={min}
          max={max}
          className={inputClass}
          value={value}
          onChange={(e) => {
            onChange(Math.min(max, Math.max(min, Math.trunc(Number(e.target.value) || 0))));
          }}
        />
      )}
    </Field>
  );
}

function SelectField<T extends string | number>({
  label,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  help?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label} help={help}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className={inputClass}
          value={String(value)}
          onChange={(e) => {
            const o = options.find((x) => String(x.value) === e.target.value);
            if (o) onChange(o.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
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

interface Props {
  draft: Preset;
  onChange: (draft: Preset) => void;
  /** Asks to switch algorithm (the page shows the confirmation screen). */
  onAlgorithmChange: (algorithm: string) => void;
}

export function PresetEditor({ draft, onChange, onAlgorithmChange }: Props) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const scheduler = getScheduler(draft.algorithm);
  const errors = useMemo(() => paramErrors(draft), [draft]);
  const limits = (p: Partial<Limits>) => {
    onChange({ ...draft, limits: { ...draft.limits, ...p } });
  };
  const behavior = (p: Partial<Behavior>) => {
    onChange({ ...draft, behavior: { ...draft.behavior, ...p } });
  };
  const section =
    'flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900';

  return (
    <div className="flex flex-col gap-4">
      <section className={section} aria-labelledby="algo-title">
        <h2 id="algo-title" className="text-lg font-semibold">
          {t('presets.algorithmSection')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('presets.name')}>
            {({ id }) => (
              <input
                id={id}
                className={inputClass}
                value={draft.name}
                onChange={(e) => {
                  onChange({ ...draft, name: e.target.value });
                }}
              />
            )}
          </Field>
          <SelectField
            label={t('presets.algorithm')}
            value={draft.algorithm}
            options={listSchedulers().map((s) => ({ value: s.id, label: s.label[locale] }))}
            onChange={onAlgorithmChange}
          />
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {scheduler.description[locale]}
        </p>
        <ParamForm
          scheduler={scheduler}
          params={draft.params}
          errors={errors}
          onChange={(params) => {
            onChange({ ...draft, params });
          }}
        />
        {errors._ && (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {errors._}
          </p>
        )}
      </section>

      <section className={section} aria-labelledby="limits-title">
        <h2 id="limits-title" className="text-lg font-semibold">
          {t('presets.limitsSection')}
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {t('presets.limitsInheritance')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t('presets.newPerDay')}
            help={t('presets.newPerDayHelp')}
            value={draft.limits.newPerDay}
            min={0}
            max={9999}
            onChange={(newPerDay) => {
              limits({ newPerDay });
            }}
          />
          <NumberField
            label={t('presets.reviewsPerDay')}
            help={t('presets.reviewsPerDayHelp')}
            value={draft.limits.reviewsPerDay}
            min={0}
            max={99999}
            onChange={(reviewsPerDay) => {
              limits({ reviewsPerDay });
            }}
          />
          <SelectField
            label={t('presets.newOrder')}
            value={draft.limits.newOrder}
            options={NEW_ORDERS.map((v) => ({ value: v, label: t(`presets.newOrders.${v}`) }))}
            onChange={(newOrder) => {
              limits({ newOrder });
            }}
          />
          <SelectField
            label={t('presets.mix')}
            value={draft.limits.mix}
            options={MIX_MODES.map((v) => ({ value: v, label: t(`presets.mixes.${v}`) }))}
            onChange={(mix) => {
              limits({ mix });
            }}
          />
          <NumberField
            label={t('presets.learnAhead')}
            help={t('presets.learnAheadHelp')}
            value={draft.limits.learnAheadMinutes}
            min={0}
            max={1440}
            onChange={(learnAheadMinutes) => {
              limits({ learnAheadMinutes });
            }}
          />
        </div>
      </section>

      <section className={section} aria-labelledby="behavior-title">
        <h2 id="behavior-title" className="text-lg font-semibold">
          {t('presets.behaviorSection')}
        </h2>
        <div className="flex flex-col gap-2">
          <Check
            label={t('presets.buryNew')}
            checked={draft.behavior.buryNewSiblings}
            onChange={(buryNewSiblings) => {
              behavior({ buryNewSiblings });
            }}
          />
          <Check
            label={t('presets.buryReview')}
            checked={draft.behavior.buryReviewSiblings}
            onChange={(buryReviewSiblings) => {
              behavior({ buryReviewSiblings });
            }}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t('presets.buttons')}
            value={draft.behavior.buttons}
            options={([2, 3, 4] as const).map((v) => ({
              value: v,
              label: t(`presets.buttonsN.${v}`),
            }))}
            onChange={(buttons) => {
              behavior({ buttons });
            }}
          />
          <SelectField
            label={t('presets.hintPolicy')}
            help={t('presets.hintPolicyHelp')}
            value={draft.behavior.hintPolicy}
            options={HINT_POLICIES.map((v) => ({
              value: v,
              label: t(`presets.hintPolicies.${v}`),
            }))}
            onChange={(hintPolicy) => {
              behavior({ hintPolicy });
            }}
          />
          <NumberField
            label={t('presets.leechThreshold')}
            help={t('presets.leechThresholdHelp')}
            value={draft.behavior.leechThreshold}
            min={0}
            max={99}
            onChange={(leechThreshold) => {
              behavior({ leechThreshold });
            }}
          />
          <SelectField
            label={t('presets.leechAction')}
            value={draft.behavior.leechAction}
            options={(['tag', 'suspend'] as const).map((v) => ({
              value: v,
              label: t(`presets.leechActions.${v}`),
            }))}
            onChange={(leechAction) => {
              behavior({ leechAction });
            }}
          />
          <NumberField
            label={t('presets.maxAnswer')}
            help={t('presets.maxAnswerHelp')}
            value={draft.behavior.maxAnswerSeconds}
            min={10}
            max={3600}
            onChange={(maxAnswerSeconds) => {
              behavior({ maxAnswerSeconds });
            }}
          />
        </div>
      </section>
    </div>
  );
}
