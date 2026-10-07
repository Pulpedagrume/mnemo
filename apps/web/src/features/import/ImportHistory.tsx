import { useTranslation } from 'react-i18next';
import { listImportBatches, undoImport } from '@mnemo/services';
import { useMutation, useQuery } from '../../app/services';
import { errorMessage } from '../../app/errors';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';

/** Past imports, each undoable once. */
export function ImportHistory() {
  const { t, i18n } = useTranslation();
  const batches = useQuery((ctx) => listImportBatches(ctx, 20), []);
  const undo = useMutation((ctx, id: string) => undoImport(ctx, id));
  if (!batches.data || batches.data.length === 0) return null;
  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-2">
      <h2 id="history-title" className="text-lg font-semibold">
        {t('wizard.history')}
      </h2>
      <ul className="flex flex-col gap-2">
        {batches.data.map((b) => (
          <li
            key={b.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
          >
            <span className="flex-1">
              <span className="font-medium">{b.fileName}</span>{' '}
              {t('wizard.historyLine', {
                date: new Date(b.createdAt).toLocaleString(i18n.language, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
                created: b.counts.created ?? 0,
                updated: b.counts.updated ?? 0,
              })}
            </span>
            {b.undoneAt === undefined ? (
              <Button
                size="sm"
                onClick={() => {
                  undo(b.id).then(
                    () => {
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
            ) : (
              <span className="text-slate-600 dark:text-slate-400">{t('wizard.undoneBadge')}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
