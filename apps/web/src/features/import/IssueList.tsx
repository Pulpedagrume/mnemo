import { useTranslation } from 'react-i18next';
import type { ImportIssue, IssueSeverity } from '@mnemo/importers';
import { resolveLocale } from '@mnemo/core';
import { StatusBadge } from '../../components/study/widgets/common';

const ORDER: IssueSeverity[] = ['error', 'warning', 'info'];
const STATUS = { error: 'wrong', warning: 'missing', info: 'correct' } as const;

/** Issues grouped by severity, then by note (position, uid, line). */
export function IssueList({ issues }: { issues: readonly ImportIssue[] }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  if (issues.length === 0)
    return <p className="text-emerald-800 dark:text-emerald-300">{t('import.noIssues')}</p>;
  return (
    <div className="flex flex-col gap-4">
      {ORDER.map((severity) => {
        const list = issues
          .filter((i) => i.severity === severity)
          .sort(
            (a, b) => (a.noteIndex ?? -1) - (b.noteIndex ?? -1) || (a.line ?? 0) - (b.line ?? 0),
          );
        if (list.length === 0) return null;
        return (
          <section
            key={severity}
            aria-label={t(`import.severity.${severity}`, { count: list.length })}
          >
            <h3 className="mb-2 font-semibold">
              <StatusBadge
                status={STATUS[severity]}
                label={t(`import.severity.${severity}`, { count: list.length })}
              />
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((issue, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
                >
                  <p className="font-medium">
                    {[
                      issue.noteIndex !== undefined
                        ? t('import.noteN', { n: issue.noteIndex + 1 })
                        : null,
                      issue.uid ? `uid ${issue.uid}` : null,
                      issue.line !== undefined ? t('import.lineN', { n: issue.line }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || issue.path}
                  </p>
                  <p>{issue.message[locale]}</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{t('import.howToFix')} </span>
                    {issue.howToFix[locale]}
                  </p>
                  {issue.suggestion && (
                    <p className="text-slate-700 dark:text-slate-300">
                      <span className="font-semibold">{t('import.suggestion')} </span>
                      {issue.suggestion[locale]}
                    </p>
                  )}
                  {issue.excerpt && (
                    <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-xs whitespace-pre-wrap dark:bg-slate-800">
                      {issue.excerpt}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
