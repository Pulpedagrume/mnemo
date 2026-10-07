import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { resolveLocale } from '@mnemo/core';
import { Markdown } from '../components/Markdown';
import { PageTitle } from '../components/PageTitle';
import { focusRing } from '../components/ui/Button';
import guideFr from '../content/guide.fr.md?raw';
import guideEn from '../content/guide.en.md?raw';

const GUIDES = { fr: guideFr, en: guideEn };

/** "AI guide": how to use any AI assistant with the import wizard. */
export function GuidePage() {
  const { t, i18n } = useTranslation();
  const source = GUIDES[resolveLocale(i18n.language)];
  // The first Markdown heading is the page title.
  const body = source.replace(/^# .*\n+/, '');
  return (
    <>
      <PageTitle
        title={t('guide.title')}
        actions={
          <Link
            to="/import"
            className={`inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700 ${focusRing}`}
          >
            {t('import.open')}
          </Link>
        }
      />
      <article className="max-w-3xl rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <Markdown source={body} className="guide" />
      </article>
    </>
  );
}
