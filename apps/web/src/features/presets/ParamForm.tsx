import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleHelp } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import type { AnyScheduler, I18nString, ParamFieldSpec } from '@mnemo/core';
import { resolveLocale } from '@mnemo/core';
import { focusRing } from '../../components/ui/Button';
import { inputClass } from '../../components/ui/Field';

/** "?" button with a tooltip; the text is also exposed as the field description. */
export function HelpTip({ text, id }: { text: string; id: string }) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className={`rounded-full text-slate-500 hover:text-indigo-700 ${focusRing}`}
            aria-describedby={id}
          >
            <CircleHelp aria-hidden size={16} />
            <span className="sr-only">?</span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={4}
            className="z-50 max-w-xs rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          >
            {text}
            <Tooltip.Arrow className="fill-slate-900 dark:fill-slate-100" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

const listToText = (v: unknown) => (Array.isArray(v) ? v.join(', ') : '');
const textToList = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

interface FieldProps {
  spec: ParamFieldSpec;
  value: unknown;
  error?: string | undefined;
  onChange: (value: unknown) => void;
}

function ParamField({ spec, value, error, onChange }: FieldProps) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const id = useId();
  const tr = (s: I18nString) => s[locale];
  const describedBy = `${id}-help${error ? ` ${id}-err` : ''}`;
  const common = { id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) };
  let control;
  switch (spec.kind) {
    case 'boolean':
      control = (
        <input
          {...common}
          type="checkbox"
          className="size-5 accent-indigo-600"
          checked={Boolean(value)}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
        />
      );
      break;
    case 'enum':
      control = (
        <select
          {...common}
          className={inputClass}
          value={String(value)}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {tr(o.label)}
            </option>
          ))}
        </select>
      );
      break;
    case 'number':
    case 'integer':
      control = (
        <input
          {...common}
          type="number"
          className={inputClass}
          min={spec.min}
          max={spec.max}
          step={spec.kind === 'integer' ? 1 : (spec.step ?? 'any')}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => {
            onChange(e.target.value === '' ? undefined : Number(e.target.value));
          }}
        />
      );
      break;
    case 'durations':
      control = (
        <input
          {...common}
          className={inputClass}
          value={listToText(value)}
          onChange={(e) => {
            onChange(textToList(e.target.value));
          }}
        />
      );
      break;
    case 'numberList':
      control = (
        <input
          {...common}
          className={inputClass}
          value={listToText(value)}
          onChange={(e) => {
            onChange(textToList(e.target.value).map(Number));
          }}
        />
      );
      break;
  }
  const unit = 'unit' in spec && spec.unit ? t(`units.${spec.unit}`) : '';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="font-medium">
          {tr(spec.label)}
          {unit && (
            <span className="font-normal text-slate-600 dark:text-slate-400"> ({unit})</span>
          )}
        </label>
        <HelpTip text={tr(spec.help)} id={`${id}-help`} />
      </div>
      {control}
      <p id={`${id}-help`} className="sr-only">
        {tr(spec.help)}
      </p>
      {spec.kind === 'durations' && (
        <p className="text-xs text-slate-600 dark:text-slate-400">{t('presets.durationsHelp')}</p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/** Parameters form generated from the scheduler's `paramSpec`. */
export function ParamForm({
  scheduler,
  params,
  errors,
  onChange,
}: {
  scheduler: AnyScheduler;
  params: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (params: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const basic = scheduler.paramSpec.filter((s) => !s.advanced);
  const advanced = scheduler.paramSpec.filter((s) => s.advanced);
  const render = (spec: ParamFieldSpec) => (
    <ParamField
      key={spec.key}
      spec={spec}
      value={params[spec.key]}
      error={errors[spec.key]}
      onChange={(v) => {
        onChange({ ...params, [spec.key]: v });
      }}
    />
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">{basic.map(render)}</div>
      {advanced.length > 0 && (
        <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer font-medium">{t('presets.advanced')}</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">{advanced.map(render)}</div>
        </details>
      )}
    </div>
  );
}
