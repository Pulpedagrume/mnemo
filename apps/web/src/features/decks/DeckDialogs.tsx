import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Deck, Preset } from '@mnemo/core';
import type { CustomStudy } from '@mnemo/services';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, inputClass } from '../../components/ui/Field';

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
}

/** Asks for a deck path ("Parent::Child"). */
export function DeckNameDialog({
  open,
  onOpenChange,
  title,
  initial,
  submitLabel,
  onSubmit,
}: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <DeckNameForm
        initial={initial}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        onCancel={() => {
          onOpenChange(false);
        }}
      />
    </Dialog>
  );
}

function DeckNameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: Pick<NameDialogProps, 'initial' | 'submitLabel' | 'onSubmit'> & { onCancel: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name);
      }}
    >
      <Field label={t('decks.name')} help={t('decks.nameHelp')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            className={inputClass}
            value={name}
            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the dialog's only field
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface OptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deck: Deck;
  presets: readonly Preset[];
  onSubmit: (presetId: string | null, description: string) => void;
}

/** Chooses the deck's preset (or inheritance) and its description. */
export function DeckOptionsDialog({
  open,
  onOpenChange,
  deck,
  presets,
  onSubmit,
}: OptionsDialogProps) {
  const { t } = useTranslation();
  const [presetId, setPresetId] = useState(deck.presetId ?? '');
  const [description, setDescription] = useState(deck.description ?? '');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('decks.optionsTitle', { name: deck.name })}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(presetId || null, description);
        }}
      >
        <Field label={t('decks.preset')} help={t('decks.presetHelp')}>
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              className={inputClass}
              value={presetId}
              onChange={(e) => {
                setPresetId(e.target.value);
              }}
            >
              <option value="">{t('decks.inherit')}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('decks.description')}>
          {({ id }) => (
            <textarea
              id={id}
              rows={3}
              className={inputClass}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type CustomKind = CustomStudy['kind'];

interface CustomStudyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: readonly string[];
  onStart: (custom: Exclude<CustomStudy, { kind: 'selection' }>) => void;
}

/** Custom study: cram, study ahead, by tag, recent mistakes. */
export function CustomStudyDialog({ open, onOpenChange, tags, onStart }: CustomStudyDialogProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Exclude<CustomKind, 'selection'>>('mistakes');
  const [days, setDays] = useState(7);
  const [tag, setTag] = useState(tags[0] ?? '');
  const start = () => {
    if (kind === 'cram') onStart({ kind });
    else if (kind === 'tag') onStart({ kind, tag });
    else onStart({ kind, days });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('custom.title')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">{t('custom.mode')}</legend>
          {(['mistakes', 'ahead', 'tag', 'cram'] as const).map((k) => (
            <div key={k} className="flex items-start gap-2">
              <input
                id={`custom-kind-${k}`}
                type="radio"
                name="custom-kind"
                className="mt-1 size-4 accent-indigo-600"
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                }}
              />
              <label htmlFor={`custom-kind-${k}`}>
                <span className="font-medium">{t(`custom.${k}`)}</span>
                <span className="block text-sm text-slate-600 dark:text-slate-400">
                  {t(`custom.${k}Help`)}
                </span>
              </label>
            </div>
          ))}
        </fieldset>
        {(kind === 'mistakes' || kind === 'ahead') && (
          <Field label={t('custom.days')}>
            {({ id }) => (
              <input
                id={id}
                type="number"
                min={1}
                max={365}
                className={`${inputClass} w-32`}
                value={days}
                onChange={(e) => {
                  setDays(Math.max(1, Number(e.target.value) || 1));
                }}
              />
            )}
          </Field>
        )}
        {kind === 'tag' && (
          <Field label={t('custom.tag')}>
            {({ id }) =>
              tags.length ? (
                <select
                  id={id}
                  className={inputClass}
                  value={tag}
                  onChange={(e) => {
                    setTag(e.target.value);
                  }}
                >
                  {tags.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <p id={id}>{t('custom.noTags')}</p>
              )
            }
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={kind === 'tag' && !tag}>
            {t('custom.start')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
