import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_NAME, LOCALES, isLocale } from '@mnemo/core';

export function App() {
  const { t, i18n } = useTranslation();
  const languageId = useId();

  return (
    <div className="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h1 className="text-xl font-semibold">{APP_NAME}</h1>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={languageId}>{t('app.language')}</label>
          <select
            id={languageId}
            className="rounded border border-slate-300 bg-transparent px-2 py-1 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-700"
            value={i18n.resolvedLanguage}
            onChange={(e) => {
              if (isLocale(e.target.value)) void i18n.changeLanguage(e.target.value);
            }}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {t(`language.${l}`)}
              </option>
            ))}
          </select>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-lg">{t('app.tagline')}</p>
        <p className="mt-4 text-slate-600 dark:text-slate-400">{t('app.comingSoon')}</p>
      </main>
    </div>
  );
}
