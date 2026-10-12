import { useTranslation } from 'react-i18next';
import type { AiModel, AppSettings } from '@mnemo/core';
import { AiModelSchema } from '@mnemo/core';
import { useQuery } from '../app/services';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { toast } from '../components/ui/Toaster';
import { deleteModel, isModelDownloaded, useAiStatus, webGpuAvailable } from './engine';
import { AI_MODELS } from './models';

interface Props {
  settings: AppSettings;
  set: (patch: Partial<AppSettings>) => void;
}

/** Settings → "AI assistant": global switch, model size, model files on this device. */
export function AssistantSettings({ settings, set }: Props) {
  const { t, i18n } = useTranslation();
  const status = useAiStatus((s) => s.status);
  const gpu = useQuery(() => webGpuAvailable(), []);
  const downloaded = useQuery(async () => {
    const entries = await Promise.all(
      AiModelSchema.options.map(async (m) => [m, await isModelDownloaded(m)] as const),
    );
    return entries.filter(([, ok]) => ok).map(([m]) => m);
  }, [status.kind]);
  const mb = (n: number) => n.toLocaleString(i18n.language);
  const remove = (model: AiModel) => {
    deleteModel(model).then(
      () => {
        toast(t('assistant.deleted'), 'success');
      },
      () => {
        toast(t('assistant.deleteError'), 'error');
      },
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-slate-700 dark:text-slate-300">{t('assistant.settingsIntro')}</p>
      {gpu.data === false && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {t('assistant.unsupported')}
        </p>
      )}
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          className="size-4 accent-indigo-600"
          checked={settings.aiEnabled}
          onChange={(e) => {
            set({ aiEnabled: e.target.checked });
          }}
        />
        {t('assistant.enable')}
      </label>
      {settings.aiEnabled && (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('assistant.perDeck')}</p>
          <Field label={t('assistant.model')} help={t('assistant.modelHelp')}>
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                className={`${inputClass} sm:max-w-md`}
                value={settings.aiModel}
                onChange={(e) => {
                  set({ aiModel: AiModelSchema.parse(e.target.value) });
                }}
              >
                {AiModelSchema.options.map((m) => (
                  <option key={m} value={m}>
                    {t(`assistant.models.${m}`, { size: mb(AI_MODELS[m].downloadMB) })}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}
      {(downloaded.data ?? []).map((m) => (
        <div key={m} className="flex flex-wrap items-center gap-3">
          <span>{t('assistant.onDevice', { size: mb(AI_MODELS[m].downloadMB) })}</span>
          <Button
            size="sm"
            onClick={() => {
              remove(m);
            }}
          >
            {t('assistant.delete')}
          </Button>
        </div>
      ))}
    </div>
  );
}
