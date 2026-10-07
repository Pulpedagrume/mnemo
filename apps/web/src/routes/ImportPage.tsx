import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { resolveLocale } from '@mnemo/core';
import type { ComposedTaskId } from '@mnemo/prompts';
import { COMPOSED_TASK_IDS, buildPrompt, getPromptTask, recommendFormat } from '@mnemo/prompts';
import { errorMessage } from '../app/errors';
import { PageTitle } from '../components/PageTitle';
import { Button, focusRing } from '../components/ui/Button';
import { toast } from '../components/ui/Toaster';
import { AnswerDropZone } from '../features/import/AnswerDropZone';
import { ImportHistory } from '../features/import/ImportHistory';
import { ImportPreview } from '../features/import/ImportPreview';
import { loadImport, type LoadedImport } from '../features/import/loadImport';
import { PromptResult } from '../features/import/PromptResult';
import { FormatStep, OptionsStep, TaskStep } from '../features/import/WizardSteps';
import { loadSettings, saveSettings, type WizardSettings } from '../features/import/wizardSettings';

const STEPS = ['task', 'format', 'options', 'result'] as const;
type Step = (typeof STEPS)[number];

/** "Import with AI": 4-step prompt wizard, then the answer is parsed and previewed. */
export function ImportPage() {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const [settings, setSettings] = useState<WizardSettings>(() => loadSettings(locale));
  const [step, setStep] = useState<Step>('task');
  const [loaded, setLoaded] = useState<LoadedImport | null>(null);
  const [busy, setBusy] = useState(false);

  const taskId: ComposedTaskId =
    COMPOSED_TASK_IDS.find((id) => id === settings.task) ?? 'course-pack';
  const task = getPromptTask(taskId);
  const options = {
    deck: settings.deck,
    language: settings.language,
    level: settings.level,
    density: settings.density,
    hints: settings.hints,
    explanations: settings.explanations,
    mcqChoices: settings.mcqChoices,
    uidPrefix: settings.uidPrefix,
    batchSize: settings.batchSize,
    onlyDocument: settings.onlyDocument,
    documentType: settings.documentType,
    longDocument: settings.longDocument,
  };
  const recommendation = recommendFormat(task.id, {});
  const format =
    settings.formatChosen && task.formats.includes(settings.format)
      ? settings.format
      : recommendation.format;
  // Composing is a fast pure function: no memoization needed.
  const built = step === 'result' ? buildPrompt({ task: taskId, format, locale, options }) : null;

  const set = (patch: Partial<WizardSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const load = (input: Parameters<typeof loadImport>[0]) => {
    setBusy(true);
    loadImport(input)
      .then(setLoaded, (e: unknown) => {
        toast(errorMessage(e, t), 'error');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (loaded) {
    return (
      <>
        <PageTitle title={t('import.title')} />
        <ImportPreview
          loaded={loaded}
          format={loaded.result.format}
          onReset={() => {
            setLoaded(null);
          }}
        />
      </>
    );
  }

  const index = STEPS.indexOf(step);
  return (
    <>
      <PageTitle
        title={t('import.title')}
        actions={
          <Link to="/guide" className={`rounded underline ${focusRing}`}>
            {t('guide.title')}
          </Link>
        }
      />
      <nav aria-label={t('wizard.steps')} className="mb-4">
        <ol className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                aria-current={s === step ? 'step' : undefined}
                onClick={() => {
                  setStep(s);
                }}
                className={`rounded-full px-3 py-1 ${s === step ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-800'} ${focusRing}`}
              >
                {`${String(i + 1)}. ${t(`wizard.step.${s}`)}`}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {step === 'task' && <TaskStep settings={settings} set={set} />}
          {step === 'format' && (
            <FormatStep
              settings={{ ...settings, format }}
              set={set}
              formats={task.formats}
              reason={recommendation.reason[locale]}
            />
          )}
          {step === 'options' && (
            <OptionsStep settings={settings} set={set} hasMcq={task.noteTypes.includes('mcq')} />
          )}
          {step === 'result' && built && (
            <PromptResult built={built} format={format} settings={settings} locale={locale} />
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {index > 0 && (
              <Button
                onClick={() => {
                  setStep(STEPS[index - 1] ?? 'task');
                }}
              >
                {t('wizard.back')}
              </Button>
            )}
            {index < STEPS.length - 1 && (
              <Button
                variant="primary"
                onClick={() => {
                  setStep(STEPS[index + 1] ?? 'result');
                }}
              >
                {t('wizard.next')}
              </Button>
            )}
            {step !== 'result' && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('result');
                }}
              >
                {t('wizard.skipToResult')}
              </Button>
            )}
          </div>
        </div>
        <AnswerDropZone
          busy={busy}
          onFile={(file) => {
            load({ file });
          }}
          onText={(text) => {
            load({ text });
          }}
        />
        <ImportHistory />
      </div>
    </>
  );
}
