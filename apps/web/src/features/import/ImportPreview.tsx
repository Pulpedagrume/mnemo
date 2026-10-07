import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ImportBatch, ImportMode } from '@mnemo/core';
import { IMPORT_MODES, resolveLocale } from '@mnemo/core';
import { formatReportText, reportToJson } from '@mnemo/importers';
import { buildContinuePrompt, buildFixPrompt } from '@mnemo/prompts';
import { applyImport, listDecks, planImport, undoImport } from '@mnemo/services';
import { useMutation, useQuery } from '../../app/services';
import { errorMessage } from '../../app/errors';
import { MediaResolverContext } from '../../components/Markdown';
import { Button, focusRing } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field, inputClass } from '../../components/ui/Field';
import { toast } from '../../components/ui/Toaster';
import { copyText } from '../../lib/clipboard';
import { downloadFile } from '../../lib/download';
import { IssueList } from './IssueList';
import type { LoadedImport } from './loadImport';
import { PreviewNotes } from './PreviewNotes';

/** Object URLs (or data URIs) for the media declared in the file, revoked on unmount. */
function useMediaResolver(loaded: LoadedImport) {
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    for (const decl of loaded.result.media) {
      const payload = loaded.media.get(decl.id);
      if (payload)
        map.set(
          decl.id,
          URL.createObjectURL(new Blob([new Uint8Array(payload.bytes)], { type: payload.mime })),
        );
      else if (decl.data) map.set(decl.id, decl.data);
    }
    return map;
  }, [loaded]);
  useEffect(
    () => () => {
      for (const url of urls.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return (id: string) => urls.get(id);
}

interface Props {
  loaded: LoadedImport;
  format: 'json' | 'yaml' | 'markdown' | 'csv';
  onReset: () => void;
}

/** Faithful preview before import: counts, issues, cards; then import with undo. */
export function ImportPreview({ loaded, format, onReset }: Props) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const { result } = loaded;
  const { report } = result;
  const resolveMedia = useMediaResolver(loaded);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<ImportMode>('skip-duplicates');
  const [targetDeck, setTargetDeck] = useState(result.notes.find((n) => n.deck)?.deck ?? 'Import');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const decks = useQuery((ctx) => listDecks(ctx), []);
  const plan = useQuery(
    (ctx) => planImport(ctx, result, { mode, targetDeck, excluded }),
    [mode, targetDeck, excluded, result],
  );
  const runImport = useMutation((ctx) =>
    applyImport(ctx, result, {
      mode,
      targetDeck,
      excluded,
      fileName: loaded.fileName,
      media: loaded.media,
    }),
  );
  const runUndo = useMutation((ctx, id: string) => undoImport(ctx, id));

  const copy = (text: string) => {
    void copyText(text).then((ok) => {
      toast(ok ? t('import.copied') : t('import.copyFailed'), ok ? 'success' : 'error');
    });
  };
  const doImport = () => {
    runImport().then(
      (b) => {
        setBatch(b);
        toast(t('import.done', { count: b.noteIds.length }), 'success');
      },
      (e: unknown) => {
        toast(errorMessage(e, t), 'error');
      },
    );
  };

  if (batch) {
    return (
      <section
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border border-emerald-600 bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <h2 className="text-xl font-semibold">{t('import.successTitle')}</h2>
        <p>
          {t('import.successText', {
            created: batch.counts.created ?? 0,
            updated: batch.counts.updated ?? 0,
            skipped: batch.counts.skipped ?? 0,
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/"
            className={`inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-4 font-medium text-white ${focusRing}`}
          >
            {t('import.goStudy')}
          </Link>
          <Button
            onClick={() => {
              runUndo(batch.id).then(
                () => {
                  setBatch(null);
                  toast(t('import.undone'), 'success');
                },
                (e: unknown) => {
                  toast(errorMessage(e, t), 'error');
                },
              );
            }}
          >
            {t('import.undo')}
          </Button>
          <Button variant="ghost" onClick={onReset}>
            {t('import.another')}
          </Button>
        </div>
      </section>
    );
  }

  const included = result.notes.filter((n) => !excluded.has(n.index));
  const cards = included.reduce((s, n) => s + n.cards, 0);
  const byType = Object.entries(report.counts.byType);
  return (
    <MediaResolverContext.Provider value={resolveMedia}>
      <div className="flex flex-col gap-6">
        <section aria-labelledby="summary-title" className="flex flex-col gap-3">
          <h2 id="summary-title" className="text-xl font-semibold">
            {t('import.previewTitle', { file: loaded.fileName })}
          </h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t('import.notes'), String(included.length)],
              [t('import.cards'), String(cards)],
              [t('import.errors'), String(report.counts.errors)],
              [t('import.warnings'), String(report.counts.warnings)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {byType.length > 0 && (
            <p className="text-sm">
              {byType.map(([type, count]) => `${type} : ${String(count)}`).join(' · ')}
            </p>
          )}
        </section>

        {(report.truncated ?? report.continuation) && (
          <section
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-amber-500 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
          >
            <h2 className="font-semibold">{t('import.missingRest')}</h2>
            <p>
              {report.truncated
                ? t('import.truncated', {
                    count: report.truncated.recovered,
                    uid: report.truncated.lastUid ?? '—',
                  })
                : t('import.continuation', { text: report.continuation ?? '' })}
            </p>
            <Button
              className="self-start"
              onClick={() => {
                copy(
                  buildContinuePrompt({
                    lastUid: report.truncated?.lastUid ?? result.notes.at(-1)?.uid ?? '',
                    continuation: report.continuation ?? '',
                    locale,
                  }),
                );
              }}
            >
              {t('import.copyContinue')}
            </Button>
          </section>
        )}

        <section aria-labelledby="issues-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="issues-title" className="mr-auto text-lg font-semibold">
              {t('import.issues')}
            </h2>
            {report.counts.errors > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  copy(
                    buildFixPrompt({
                      report,
                      sourceText: loaded.text,
                      format,
                      locale,
                      scope: 'notes',
                    }),
                  );
                }}
              >
                {t('import.copyFix')}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                downloadFile(formatReportText(report, locale), 'rapport-import.txt', 'text/plain');
              }}
            >
              {t('import.reportText')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                downloadFile(reportToJson(report), 'rapport-import.json', 'application/json');
              }}
            >
              {t('import.reportJson')}
            </Button>
          </div>
          <IssueList issues={report.issues} />
        </section>

        <section
          aria-labelledby="target-title"
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 id="target-title" className="text-lg font-semibold">
            {t('import.target')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('import.targetDeck')} help={t('import.targetDeckHelp')}>
              {({ id, describedBy }) => (
                <>
                  <input
                    id={id}
                    aria-describedby={describedBy}
                    list={`${id}-decks`}
                    className={inputClass}
                    value={targetDeck}
                    onChange={(e) => {
                      setTargetDeck(e.target.value);
                    }}
                  />
                  <datalist id={`${id}-decks`}>
                    {(decks.data ?? []).map((d) => (
                      <option key={d.id} value={d.name} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label={t('import.mode')} help={t(`import.modeHelp.${mode}`)}>
              {({ id, describedBy }) => (
                <select
                  id={id}
                  aria-describedby={describedBy}
                  className={inputClass}
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as ImportMode);
                  }}
                >
                  {IMPORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`import.modes.${m}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          {plan.data && (
            <p aria-live="polite">
              {t('import.plan', {
                create: plan.data.counts.create,
                update: plan.data.counts.update,
                skip: plan.data.counts.skip,
              })}
              {plan.data.decksToCreate.length > 0 &&
                ` ${t('import.planDecks', { decks: plan.data.decksToCreate.join(', ') })}`}
              {mode === 'replace-deck' &&
                ` ${t('import.planReplace', { count: plan.data.replaced })}`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="lg"
              disabled={included.length === 0}
              onClick={() => {
                if (mode === 'replace-deck') setConfirmReplace(true);
                else doImport();
              }}
            >
              {report.counts.invalid > 0
                ? t('import.importPartial', { count: included.length })
                : t('import.import', { count: included.length })}
            </Button>
            <Button onClick={onReset}>{t('common.cancel')}</Button>
          </div>
        </section>

        <section aria-labelledby="notes-title" className="flex flex-col gap-3">
          <h2 id="notes-title" className="text-lg font-semibold">
            {t('import.previewCards')}
          </h2>
          <PreviewNotes
            result={result}
            excluded={excluded}
            onToggle={(index) => {
              setExcluded((cur) => {
                const next = new Set(cur);
                if (next.has(index)) next.delete(index);
                else next.add(index);
                return next;
              });
            }}
          />
        </section>
      </div>
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title={t('import.replaceTitle')}
        description={t('import.replaceWarning')}
        confirmLabel={t('import.replaceConfirm')}
        danger
        onConfirm={doImport}
      />
    </MediaResolverContext.Provider>
  );
}
