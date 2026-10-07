import { useTranslation } from 'react-i18next';
import type { Locale } from '@mnemo/core';
import { buildPlanPrompt } from '@mnemo/prompts';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';
import { copyText } from '../../lib/clipboard';
import type { OutputFormat, WizardSettings } from './wizardSettings';

interface Built {
  prompt: string;
  specText: string;
  exampleText: string;
  approxTokens: number;
}

interface Props {
  built: Built;
  format: OutputFormat;
  settings: WizardSettings;
  locale: Locale;
}

const SCHEMA_URL = `${import.meta.env.BASE_URL}schema/mnemo-import.schema.json`;

/** Step 4: the ready-to-copy prompt, the checklist, and copy helpers. */
export function PromptResult({ built, format, settings, locale }: Props) {
  const { t } = useTranslation();
  const copy = (text: string) => {
    void copyText(text).then((ok) => {
      toast(ok ? t('import.copied') : t('import.copyFailed'), ok ? 'success' : 'error');
    });
  };
  const withoutExample = built.exampleText
    ? built.prompt.replace(built.exampleText, '').replace(/\n{3,}/g, '\n\n')
    : built.prompt;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('wizard.resultTitle')}</h2>
      <ol className="list-decimal pl-6">
        {(['open', 'paste', 'document', 'copy', 'come-back'] as const).map((k) => (
          <li key={k}>{t(`wizard.checklist.${k}`)}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            copy(withoutExample);
          }}
        >
          {t('wizard.copyPrompt')}
        </Button>
        <Button
          onClick={() => {
            copy(built.prompt);
          }}
        >
          {t('wizard.copyWithExample')}
        </Button>
        <Button
          onClick={() => {
            void fetch(SCHEMA_URL)
              .then((r) => r.text())
              .then(copy, () => {
                toast(t('import.copyFailed'), 'error');
              });
          }}
        >
          {t('wizard.copySchema')}
        </Button>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {t('wizard.tokens', { count: built.approxTokens, format: t(`wizard.formats.${format}`) })}
      </p>
      <label htmlFor="wizard-prompt" className="font-medium">
        {t('wizard.promptLabel')}
      </label>
      <textarea
        id="wizard-prompt"
        readOnly
        rows={14}
        value={built.prompt}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
      />
      {settings.longDocument && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-400 p-3">
          <h3 className="font-semibold">{t('wizard.longTitle')}</h3>
          <p className="text-sm">{t('wizard.longSteps')}</p>
          <Button
            className="self-start"
            onClick={() => {
              copy(
                buildPlanPrompt({
                  locale,
                  batchSize: settings.batchSize,
                  documentType: settings.documentType,
                }),
              );
            }}
          >
            {t('wizard.copyPlan')}
          </Button>
        </div>
      )}
    </div>
  );
}
