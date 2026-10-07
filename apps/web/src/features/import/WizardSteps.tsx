import { useTranslation } from 'react-i18next';
import { LOCALES, resolveLocale } from '@mnemo/core';
import { PROMPT_TASKS } from '@mnemo/prompts';
import { Field, inputClass } from '../../components/ui/Field';
import type { Density, DocumentType, Level, OutputFormat, WizardSettings } from './wizardSettings';

interface StepProps {
  settings: WizardSettings;
  set: (patch: Partial<WizardSettings>) => void;
}

const radioCard =
  'grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-xl border-2 p-3 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-600 dark:has-[:checked]:bg-indigo-950 border-slate-200 dark:border-slate-700';

export const WIZARD_TASKS = PROMPT_TASKS.filter((task) => task.kind === 'composed');

/** Step 1: what the user wants to obtain. */
export function TaskStep({ settings, set }: StepProps) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-lg font-semibold">{t('wizard.taskQuestion')}</legend>
      {WIZARD_TASKS.map((task) => (
        <label key={task.id} htmlFor={`wizard-task-${task.id}`} className={radioCard}>
          <input
            id={`wizard-task-${task.id}`}
            type="radio"
            name="wizard-task"
            className="mt-1 size-4 accent-indigo-600"
            checked={settings.task === task.id}
            onChange={() => {
              set({ task: task.id });
            }}
          />
          <span className="font-semibold">
            {task.label[locale]}
            {task.id === 'course-pack' && (
              <span className="ml-2 rounded bg-indigo-600 px-1.5 py-0.5 text-xs text-white">
                {t('wizard.recommended')}
              </span>
            )}
          </span>
          <span className="col-start-2 block text-sm text-slate-700 dark:text-slate-300">
            {task.description[locale]}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Step 2: the file format the AI must produce. */
export function FormatStep({
  settings,
  set,
  formats,
  reason,
}: StepProps & { formats: readonly OutputFormat[]; reason: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-lg font-semibold">{t('wizard.formatQuestion')}</legend>
      <p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{reason}</p>
      {formats.map((format) => (
        <label key={format} htmlFor={`wizard-format-${format}`} className={radioCard}>
          <input
            id={`wizard-format-${format}`}
            type="radio"
            name="wizard-format"
            className="mt-1 size-4 accent-indigo-600"
            checked={settings.format === format}
            onChange={() => {
              set({ format, formatChosen: true });
            }}
          />
          <span className="font-semibold">{t(`wizard.formats.${format}`)}</span>
          <span className="col-start-2 block text-sm text-slate-700 dark:text-slate-300">
            {t(`wizard.formatHelp.${format}`)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  help?: string;
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
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-indigo-600"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span>
        {label}
        {help && <span className="block text-sm text-slate-600 dark:text-slate-400">{help}</span>}
      </span>
    </label>
  );
}

/** Step 3: options of the generated prompt. */
export function OptionsStep({ settings, set, hasMcq }: StepProps & { hasMcq: boolean }) {
  const { t } = useTranslation();
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-2 text-lg font-semibold">{t('wizard.optionsTitle')}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('wizard.deck')} help={t('wizard.deckHelp')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className={inputClass}
              value={settings.deck}
              onChange={(e) => {
                set({ deck: e.target.value });
              }}
            />
          )}
        </Field>
        <Select
          label={t('wizard.language')}
          value={settings.language}
          options={LOCALES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
          onChange={(language) => {
            set({ language });
          }}
        />
        <Select<Level>
          label={t('wizard.level')}
          value={settings.level}
          options={(['debutant', 'intermediaire', 'expert'] as const).map((v) => ({
            value: v,
            label: t(`wizard.levels.${v}`),
          }))}
          onChange={(level) => {
            set({ level });
          }}
        />
        <Select<Density>
          label={t('wizard.density')}
          value={settings.density}
          options={([3, 5, 10, 'exhaustif'] as const).map((v) => ({
            value: v,
            label: t(`wizard.densities.${v}`),
          }))}
          onChange={(density) => {
            set({ density });
          }}
        />
        <Select<DocumentType>
          label={t('wizard.documentType')}
          value={settings.documentType}
          options={(['cours', 'diapositives', 'article', 'manuel', 'td', 'corrige'] as const).map(
            (v) => ({ value: v, label: t(`wizard.documentTypes.${v}`) }),
          )}
          onChange={(documentType) => {
            set({ documentType });
          }}
        />
        {hasMcq && (
          <Select
            label={t('wizard.mcqChoices')}
            value={settings.mcqChoices}
            options={[3, 4, 5, 6].map((v) => ({ value: v, label: String(v) }))}
            onChange={(mcqChoices) => {
              set({ mcqChoices });
            }}
          />
        )}
        <Field label={t('wizard.uidPrefix')} help={t('wizard.uidPrefixHelp')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className={inputClass}
              value={settings.uidPrefix}
              onChange={(e) => {
                set({ uidPrefix: e.target.value.replace(/[^A-Za-z0-9._-]/g, '') });
              }}
            />
          )}
        </Field>
      </div>
      <Check
        label={t('wizard.hints')}
        checked={settings.hints}
        onChange={(hints) => {
          set({ hints });
        }}
      />
      <Check
        label={t('wizard.explanations')}
        checked={settings.explanations}
        onChange={(explanations) => {
          set({ explanations });
        }}
      />
      <Check
        label={t('wizard.onlyDocument')}
        help={t('wizard.onlyDocumentHelp')}
        checked={settings.onlyDocument}
        onChange={(onlyDocument) => {
          set({ onlyDocument });
        }}
      />
      <Check
        label={t('wizard.longDocument')}
        help={t('wizard.longDocumentHelp')}
        checked={settings.longDocument}
        onChange={(longDocument) => {
          set({ longDocument });
        }}
      />
      {settings.longDocument && (
        <Select
          label={t('wizard.batchSize')}
          value={settings.batchSize}
          options={[20, 30, 40, 60, 80].map((v) => ({ value: v, label: String(v) }))}
          onChange={(batchSize) => {
            set({ batchSize });
          }}
        />
      )}
    </fieldset>
  );
}
