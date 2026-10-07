import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Deck } from '@mnemo/core';
import type { ExportFormat } from '@mnemo/services';
import { exportNotes } from '@mnemo/services';
import { useServices } from '../../app/services';
import { errorMessage } from '../../app/errors';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { toast } from '../../components/ui/Toaster';
import { downloadFile } from '../../lib/download';
import { sqlJsEngine } from '../../lib/sqljs';

const FORMATS: ExportFormat[] = ['markdown', 'yaml', 'json', 'csv', 'zip', 'apkg'];

/** Exports a deck subtree (or the collection) in an import-compatible format. */
export function ExportDialog({
  deck,
  open,
  onOpenChange,
}: {
  deck?: Deck;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const ctx = useServices();
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    exportNotes(ctx, {
      format,
      ...(deck ? { deckId: deck.id } : {}),
      ...(format === 'apkg' ? { sqlEngine: sqlJsEngine } : {}),
    })
      .then((res) => {
        downloadFile(res.content, res.fileName, res.mime);
        toast(t('export.done', { count: res.notes }), 'success');
        if (res.warnings.length > 0)
          toast(t('export.warnings', { count: res.warnings.length }), 'info');
        onOpenChange(false);
      })
      .catch((e: unknown) => {
        toast(errorMessage(e, t), 'error');
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={deck ? t('export.titleDeck', { name: deck.name }) : t('export.titleAll')}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t('export.format')}</legend>
        {FORMATS.map((f) => (
          <div key={f} className="flex items-start gap-2">
            <input
              id={`export-${f}`}
              type="radio"
              name="export-format"
              className="mt-1 size-4 accent-indigo-600"
              checked={format === f}
              onChange={() => {
                setFormat(f);
              }}
            />
            <label htmlFor={`export-${f}`}>
              <span className="font-medium">{t(`export.formats.${f}`)}</span>
              <span className="block text-sm text-slate-600 dark:text-slate-400">
                {t(`export.formatHelp.${f}`)}
              </span>
            </label>
          </div>
        ))}
      </fieldset>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() => {
            onOpenChange(false);
          }}
        >
          {t('common.cancel')}
        </Button>
        <Button variant="primary" onClick={run} disabled={busy} aria-busy={busy}>
          {t('export.download')}
        </Button>
      </div>
    </Dialog>
  );
}
