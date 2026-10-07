import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Deck, NoteType } from '@mnemo/core';
import {
  BUILTIN_NOTE_TYPE_LABELS,
  clozeNumbers,
  isBuiltinNoteTypeId,
  resolveLocale,
} from '@mnemo/core';
import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Field';
import { CardPreview } from '../../components/study/CardPreview';
import { DataEditor } from './DataEditor';
import { ListEditor, MarkdownField, RowInput } from './fields';
import { emptyData, toNoteInput, type EditorState } from './model';

interface Props {
  initial: EditorState;
  noteTypes: readonly NoteType[];
  decks: readonly Deck[];
  /** Note type cannot change when editing an existing note. */
  lockType?: boolean;
  /** Single column (side panel) instead of form + preview side by side. */
  compact?: boolean;
  saving?: boolean;
  error?: string | undefined;
  onSave: (state: EditorState) => void;
  onCancel: () => void;
}

export function noteTypeLabel(nt: NoteType, locale: 'fr' | 'en'): string {
  return isBuiltinNoteTypeId(nt.id) ? BUILTIN_NOTE_TYPE_LABELS[nt.id][locale] : nt.name;
}

export function NoteEditor({
  initial,
  noteTypes,
  decks,
  lockType,
  compact,
  saving,
  error,
  onSave,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const [state, setState] = useState<EditorState>(initial);
  const clozeRef = useRef<HTMLTextAreaElement | null>(null);
  const noteType = noteTypes.find((nt) => nt.id === state.noteTypeId) ?? noteTypes[0];
  const input = useMemo(() => toNoteInput(state), [state]);
  if (!noteType) return null;

  const patch = (p: Partial<EditorState>) => {
    setState((s) => ({ ...s, ...p }));
  };
  const setField = (name: string, value: string) => {
    setState((s) => ({ ...s, fields: { ...s.fields, [name]: value } }));
  };

  const changeType = (id: string) => {
    const nt = noteTypes.find((n) => n.id === id);
    if (!nt) return;
    const fields = Object.fromEntries(
      nt.fields.map((f) => [f.name.toLowerCase(), state.fields[f.name.toLowerCase()] ?? '']),
    );
    const next: EditorState = { ...state, noteTypeId: id, fields };
    const data = emptyData(nt.renderer);
    if (data) next.data = data;
    else delete next.data;
    setState(next);
  };

  /** Wraps the selection of the cloze textarea in the next {{cN::…}}. */
  const addCloze = () => {
    const el = clozeRef.current;
    const text = state.fields.text ?? '';
    const n = Math.max(0, ...clozeNumbers(text)) + 1;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const selected = text.slice(start, end) || '…';
    setField('text', `${text.slice(0, start)}{{c${n}::${selected}}}${text.slice(end)}`);
    el?.focus();
  };

  const isText = (name: string) => !['extra'].includes(name);

  return (
    <form
      className={`grid gap-6 ${compact ? '' : 'lg:grid-cols-2'}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(state);
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('editor.noteType')}>
            {({ id }) => (
              <select
                id={id}
                className={inputClass}
                value={state.noteTypeId}
                disabled={lockType}
                onChange={(e) => {
                  changeType(e.target.value);
                }}
              >
                {noteTypes.map((nt) => (
                  <option key={nt.id} value={nt.id}>
                    {noteTypeLabel(nt, locale)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('editor.deck')}>
            {({ id }) => (
              <select
                id={id}
                className={inputClass}
                value={state.deckId}
                onChange={(e) => {
                  patch({ deckId: e.target.value });
                }}
              >
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {noteType.fields.map((f) => {
          const key = f.name.toLowerCase();
          const isCloze = noteType.renderer === 'cloze' && key === 'text';
          return (
            <div key={key} className="flex flex-col gap-2">
              <MarkdownField
                label={t(`editor.field.${key}`, { defaultValue: f.name })}
                value={state.fields[key] ?? ''}
                rows={isCloze ? 5 : isText(key) ? 3 : 2}
                required={f.required ?? false}
                help={
                  isCloze
                    ? t('editor.clozeHelp', { example: '{{c1::…}}', exampleHint: '{{c1::…::…}}' })
                    : undefined
                }
                textareaRef={
                  isCloze
                    ? (el) => {
                        clozeRef.current = el;
                      }
                    : undefined
                }
                onChange={(v) => {
                  setField(key, v);
                }}
              />
              {isCloze && (
                <Button size="sm" className="self-start" onClick={addCloze}>
                  {t('editor.addCloze')}
                </Button>
              )}
            </div>
          );
        })}

        {state.data && (
          <DataEditor
            data={state.data}
            onChange={(data) => {
              patch({ data });
            }}
          />
        )}

        <ListEditor
          label={t('editor.hints')}
          items={state.hints}
          create={() => ''}
          addLabel={t('editor.addHint')}
          itemLabel={(i) => t('editor.hintN', { n: i + 1 })}
          onChange={(hints) => {
            patch({ hints });
          }}
          render={(value, update, i) => (
            <RowInput value={value} onChange={update} label={t('editor.hintN', { n: i + 1 })} />
          )}
        />
        <p className="-mt-2 text-sm text-slate-600 dark:text-slate-400">{t('editor.hintsHelp')}</p>

        <MarkdownField
          label={t('editor.explanation')}
          value={state.explanation}
          onChange={(explanation) => {
            patch({ explanation });
          }}
        />

        <Field label={t('editor.tags')} help={t('editor.tagsHelp')}>
          {({ id, describedBy }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              className={inputClass}
              value={state.tags}
              onChange={(e) => {
                patch({ tags: e.target.value });
              }}
            />
          )}
        </Field>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 font-medium">{t('editor.source')}</legend>
          {(['sourceSection', 'sourcePage', 'sourceDoc', 'sourceUrl'] as const).map((k) => (
            <Field key={k} label={t(`editor.${k}`)}>
              {({ id }) => (
                <input
                  id={id}
                  className={inputClass}
                  value={state[k]}
                  onChange={(e) => {
                    patch({ [k]: e.target.value });
                  }}
                />
              )}
            </Field>
          ))}
        </fieldset>

        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-indigo-600"
            checked={state.needsReview}
            onChange={(e) => {
              patch({ needsReview: e.target.checked });
            }}
          />
          {t('editor.needsReview')}
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-600 px-3 py-2 text-red-800 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={saving}>
            {t('common.save')}
          </Button>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
        </div>
      </div>
      <div className={compact ? '' : 'lg:sticky lg:top-16 lg:self-start'}>
        <CardPreview note={input} noteType={noteType} />
      </div>
    </form>
  );
}
