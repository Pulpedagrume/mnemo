import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '@mnemo/core';
import { APP_NAME, APP_SLUG, LOCALES } from '@mnemo/core';
import { createBackupZip, getSettings, restoreBackupZip, updateSettings } from '@mnemo/services';
import { useMutation, useQuery, useServices } from '../app/services';
import { errorMessage } from '../app/errors';
import { PageTitle } from '../components/PageTitle';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Field, inputClass } from '../components/ui/Field';
import { toast } from '../components/ui/Toaster';
import { datedFileName, downloadFile } from '../lib/download';

const TEXT_SCALES = [0.875, 1, 1.125, 1.25, 1.5] as const;

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const ctx = useServices();
  const settings = useQuery((c) => getSettings(c), []);
  const save = useMutation((c, patch: Partial<AppSettings>) => updateSettings(c, patch));
  const restore = useMutation((c, bytes: Uint8Array) => restoreBackupZip(c, bytes));
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Uint8Array | null>(null);
  const zones = useMemo(() => timeZones(), []);

  if (settings.status !== 'success') return <PageTitle title={t('settings.title')} />;
  const s = settings.data;
  const set = (patch: Partial<AppSettings>) => {
    save(patch).catch((e: unknown) => {
      toast(errorMessage(e, t), 'error');
    });
  };

  return (
    <>
      <PageTitle title={t('settings.title')} />
      <div className="flex flex-col gap-6">
        <Section id="appearance" title={t('settings.appearance')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.language')}>
              {({ id }) => (
                <select
                  id={id}
                  className={inputClass}
                  value={s.locale}
                  onChange={(e) => {
                    set({ locale: e.target.value as AppSettings['locale'] });
                  }}
                >
                  {LOCALES.map((l) => (
                    <option key={l} value={l}>
                      {t(`language.${l}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('settings.theme')}>
              {({ id }) => (
                <select
                  id={id}
                  className={inputClass}
                  value={s.theme}
                  onChange={(e) => {
                    set({ theme: e.target.value as AppSettings['theme'] });
                  }}
                >
                  {(['system', 'light', 'dark'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.themes.${v}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('settings.textSize')}>
              {({ id }) => (
                <select
                  id={id}
                  className={inputClass}
                  value={s.textScale}
                  onChange={(e) => {
                    set({ textScale: Number(e.target.value) });
                  }}
                >
                  {TEXT_SCALES.map((v) => (
                    <option key={v} value={v}>
                      {`${String(Math.round(v * 100))} %`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <label className="inline-flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={s.showTimer}
                onChange={(e) => {
                  set({ showTimer: e.target.checked });
                }}
              />
              {t('settings.showTimer')}
            </label>
          </div>
        </Section>

        <Section id="study-day" title={t('settings.studyDay')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('settings.timeZone')}
              help={t('settings.timeZoneHelp', { zone: ctx.deviceTimeZone })}
            >
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  className={inputClass}
                  value={s.timeZone}
                  onChange={(e) => {
                    set({ timeZone: e.target.value });
                  }}
                >
                  <option value="">{t('settings.deviceZone', { zone: ctx.deviceTimeZone })}</option>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('settings.rolloverHour')} help={t('settings.rolloverHelp')}>
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  className={inputClass}
                  value={s.rolloverHour}
                  onChange={(e) => {
                    set({ rolloverHour: Number(e.target.value) });
                  }}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {`${String(h).padStart(2, '0')}:00`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </Section>

        <Section id="backup" title={t('settings.backup')}>
          <p className="text-slate-700 dark:text-slate-300">{t('settings.backupHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                createBackupZip(ctx).then(
                  (bytes) => {
                    downloadFile(
                      bytes,
                      datedFileName(`${APP_SLUG}-backup`, 'zip', ctx.clock.now()),
                      'application/zip',
                    );
                    settings.refetch();
                    toast(t('settings.backupDone'), 'success');
                  },
                  (e: unknown) => {
                    toast(errorMessage(e, t), 'error');
                  },
                );
              }}
            >
              {t('settings.exportBackup')}
            </Button>
            <Button onClick={() => fileRef.current?.click()}>{t('settings.restoreBackup')}</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              aria-label={t('settings.restoreBackup')}
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file)
                  void file.arrayBuffer().then((buf) => {
                    setPending(new Uint8Array(buf));
                  });
              }}
            />
          </div>
          <Field label={t('settings.backupReminder')}>
            {({ id }) => (
              <select
                id={id}
                className={`${inputClass} sm:w-64`}
                value={s.backupReminderDays}
                onChange={(e) => {
                  set({ backupReminderDays: Number(e.target.value) });
                }}
              >
                {[0, 7, 14, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? t('settings.never') : t('settings.everyNDays', { count: d })}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {s.lastBackupAt !== undefined && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t('settings.lastBackup', {
                date: new Date(s.lastBackupAt).toLocaleString(s.locale),
              })}
            </p>
          )}
        </Section>

        <Section id="about" title={t('settings.about')}>
          <p>{t('settings.aboutText', { app: APP_NAME })}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('settings.privacy')}</p>
        </Section>
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t('settings.restoreTitle')}
        description={t('settings.restoreWarning')}
        confirmLabel={t('settings.restoreConfirm')}
        danger
        onConfirm={() => {
          if (!pending) return;
          restore(pending).then(
            (data) => {
              toast(t('settings.restored', { count: data.notes.length }), 'success');
            },
            (e: unknown) => {
              toast(errorMessage(e, t), 'error');
            },
          );
        }}
      />
    </>
  );
}
