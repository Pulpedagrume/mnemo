import { useTranslation } from 'react-i18next';
import { APP_NAME, resolveLocale } from '@mnemo/core';
import { Markdown } from '../components/Markdown';
import { PageTitle } from '../components/PageTitle';
import { focusRing } from '../components/ui/Button';
import legalFr from '../content/legal.fr.md?raw';
import legalEn from '../content/legal.en.md?raw';
import { legalInfo } from '../lib/legal';

const BODIES = { fr: legalFr, en: legalEn };
const LICENSES_URL = `${import.meta.env.BASE_URL}third-party-licenses.txt`;

/** Legal notice and privacy information (publisher, host, data, licenses). */
export function LegalPage() {
  const { t, i18n } = useTranslation();
  const info = legalInfo();
  const lines = info.publisher
    ? [
        t('legal.publisher', { value: info.publisher }),
        t('legal.anonymity'),
        info.contact && t('legal.contact', { value: info.contact }),
        info.host && t('legal.host', { value: info.host }),
        info.hostPrivacy && t('legal.hostPrivacy', { value: info.hostPrivacy }),
      ]
    : [t('legal.unset', { app: APP_NAME })];
  const identity = lines.filter(Boolean).join('\n\n');
  return (
    <>
      <PageTitle title={t('legal.title')} />
      <article className="max-w-3xl space-y-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <section aria-labelledby="legal-identity">
          <h2 id="legal-identity" className="mb-2 text-lg font-semibold">
            {t('legal.identityTitle')}
          </h2>
          <Markdown source={identity} className="guide" />
        </section>
        <Markdown source={BODIES[resolveLocale(i18n.language)]} className="guide" />
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <a href={LICENSES_URL} className={`underline ${focusRing}`}>
              {t('legal.licenses')}
            </a>
          </li>
          {info.source && (
            <li>
              <a href={info.source} rel="noopener noreferrer" className={`underline ${focusRing}`}>
                {t('legal.source')}
              </a>
            </li>
          )}
        </ul>
      </article>
    </>
  );
}
