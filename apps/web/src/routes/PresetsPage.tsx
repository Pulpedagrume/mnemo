import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Preset } from '@mnemo/core';
import { exportPreset, getScheduler, parsePresetExport } from '@mnemo/core';
import type { AlgorithmChangePreview } from '@mnemo/services';
import {
  changePresetAlgorithm,
  createPresetFromDraft,
  deletePreset,
  duplicatePreset,
  getDefaultPreset,
  listPresets,
  previewAlgorithmChange,
  savePreset,
  setDefaultPreset,
} from '@mnemo/services';
import { useMutation, useQuery, useServices } from '../app/services';
import { errorMessage } from '../app/errors';
import { PageTitle } from '../components/PageTitle';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { toast } from '../components/ui/Toaster';
import { PresetEditor, paramErrors } from '../features/presets/PresetEditor';
import { Simulator } from '../features/presets/Simulator';
import { downloadFile } from '../lib/download';

export function PresetsPage() {
  const { t } = useTranslation();
  const ctx = useServices();
  const data = useQuery(
    async (c) => ({ presets: await listPresets(c), defaultId: (await getDefaultPreset(c)).id }),
    [],
  );
  const run = useMutation(async (c, fn: (x: typeof c) => Promise<unknown>) => fn(c));
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<Preset>();
  const [algoChange, setAlgoChange] = useState<{
    algorithm: string;
    preview: AlgorithmChangePreview;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const presets = data.data?.presets ?? [];
  const selected =
    presets.find((p) => p.id === selectedId) ??
    presets.find((p) => p.id === data.data?.defaultId) ??
    presets[0];
  // Reset the draft whenever another (or a freshly saved) preset is selected.
  const [draftOf, setDraftOf] = useState<Preset>();
  if (selected !== draftOf) {
    setDraftOf(selected);
    setDraft(selected ? { ...selected, params: { ...selected.params } } : undefined);
  }

  const act = (fn: Parameters<typeof run>[0], message?: string) =>
    run(fn).then(
      (r) => {
        if (message) toast(message, 'success');
        return r;
      },
      (e: unknown) => {
        toast(errorMessage(e, t), 'error');
        return undefined;
      },
    );

  if (!selected || !draft) return <PageTitle title={t('presets.title')} />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(selected);
  const invalid = Object.keys(paramErrors(draft)).length > 0 || !draft.name.trim();
  const isDefault = selected.id === data.data?.defaultId;

  return (
    <>
      <PageTitle title={t('presets.title')} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label={t('presets.list')}>
          <ul className="flex flex-col gap-1">
            {presets.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === selected.id ? 'true' : undefined}
                  onClick={() => {
                    setSelectedId(p.id);
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-left ${p.id === selected.id ? 'bg-indigo-100 font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} focus-visible:outline-2 focus-visible:outline-indigo-600`}
                >
                  {p.name}
                  {p.id === data.data?.defaultId && (
                    <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">
                      {t('presets.default')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" className="mt-3" onClick={() => fileRef.current?.click()}>
            {t('presets.import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('presets.import')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void file.text().then((text) => {
                let json: unknown;
                try {
                  json = JSON.parse(text);
                } catch {
                  toast(t('presets.importInvalid'), 'error');
                  return;
                }
                const res = parsePresetExport(json);
                if (!res.ok) {
                  toast(
                    t('presets.importErrors', {
                      errors: res.errors.map((x) => `${x.path}: ${x.message}`).join('; '),
                    }),
                    'error',
                  );
                  return;
                }
                void act((c) => createPresetFromDraft(c, res.preset), t('presets.imported')).then(
                  (p) => {
                    if (p && typeof p === 'object' && 'id' in p) setSelectedId((p as Preset).id);
                  },
                );
              });
            }}
          />
        </nav>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!dirty || invalid}
              onClick={() => {
                void act((c) => savePreset(c, draft), t('common.saved'));
              }}
            >
              {t('common.save')}
            </Button>
            <Button
              disabled={!dirty}
              onClick={() => {
                setDraft({ ...selected });
              }}
            >
              {t('presets.revert')}
            </Button>
            <Button
              onClick={() => {
                onChangeDefaults();
              }}
            >
              {t('presets.resetParams')}
            </Button>
            <Button
              onClick={() => {
                void act(
                  (c) =>
                    duplicatePreset(c, selected.id, t('presets.copyName', { name: selected.name })),
                  t('presets.duplicated'),
                ).then((p) => {
                  if (p) setSelectedId((p as Preset).id);
                });
              }}
            >
              {t('presets.duplicate')}
            </Button>
            {!isDefault && (
              <Button
                onClick={() => {
                  void act((c) => setDefaultPreset(c, selected.id), t('presets.defaultSet'));
                }}
              >
                {t('presets.makeDefault')}
              </Button>
            )}
            <Button
              onClick={() => {
                downloadFile(
                  JSON.stringify(exportPreset(selected), null, 2),
                  `${selected.name.replace(/[^\p{L}\p{N}-]+/gu, '_')}.preset.json`,
                  'application/json',
                );
              }}
            >
              {t('presets.export')}
            </Button>
            {!isDefault && (
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmDelete(true);
                }}
              >
                {t('common.delete')}
              </Button>
            )}
          </div>
          <PresetEditor
            draft={draft}
            onChange={setDraft}
            onAlgorithmChange={(algorithm) => {
              if (algorithm === selected.algorithm) return;
              void previewAlgorithmChange(ctx, selected.id, algorithm).then(
                (preview) => {
                  setAlgoChange({ algorithm, preview });
                },
                (e: unknown) => {
                  toast(errorMessage(e, t), 'error');
                },
              );
            }}
          />
          <Simulator preset={draft} presets={presets} />
        </div>
      </div>

      <ConfirmDialog
        open={algoChange !== null}
        onOpenChange={(open) => {
          if (!open) setAlgoChange(null);
        }}
        title={t('presets.changeAlgoTitle')}
        description={t('presets.changeAlgoDescription', { count: algoChange?.preview.cards ?? 0 })}
        confirmLabel={t('presets.changeAlgoConfirm')}
        onConfirm={() => {
          if (!algoChange) return;
          void act(
            (c) => changePresetAlgorithm(c, selected.id, algoChange.algorithm),
            t('presets.algoChanged'),
          );
        }}
      >
        {algoChange && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  {t('presets.forecast')}
                </th>
                <th scope="col" className="text-right">
                  {t('presets.before')}
                </th>
                <th scope="col" className="text-right">
                  {t('presets.after')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(['today', 'tomorrow', 'next7Days'] as const).map((k) => (
                <tr key={k}>
                  <th scope="row" className="text-left font-normal">
                    {t(`presets.due.${k}`)}
                  </th>
                  <td className="text-right tabular-nums">{algoChange.preview.before[k]}</td>
                  <td className="text-right tabular-nums">{algoChange.preview.after[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('presets.deleteTitle', { name: selected.name })}
        description={t('presets.deleteWarning')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          void act((c) => deletePreset(c, selected.id), t('presets.deleted')).then(() => {
            setSelectedId(undefined);
          });
        }}
      />
    </>
  );

  function onChangeDefaults() {
    if (!draft) return;
    setDraft({
      ...draft,
      params: { ...(getScheduler(draft.algorithm).defaults as Record<string, unknown>) },
    });
  }
}
