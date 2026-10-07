import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteType } from '@mnemo/core';
import {
  builtinNoteType,
  resolveLocale,
  BUILTIN_NOTE_TYPE_LABELS,
  isBuiltinNoteTypeId,
} from '@mnemo/core';
import type { ImportParseResult, ParsedNote } from '@mnemo/importers';
import { CardPreview } from '../../components/study/CardPreview';
import { Button } from '../../components/ui/Button';

const PAGE = 20;

/** NoteType used to preview a parsed note: built-in, or declared in the file. */
export function previewNoteType(id: string, result: ImportParseResult): NoteType | undefined {
  const builtin = builtinNoteType(id);
  if (builtin) return { ...builtin, createdAt: 0, updatedAt: 0 };
  const def = result.noteTypes.find((d) => `custom:${d.id}` === id);
  if (!def) return undefined;
  return {
    id,
    name: def.name,
    builtin: false,
    renderer: 'template',
    fields: def.fields.map((name) => ({ name })),
    templates: def.templates,
    createdAt: 0,
    updatedAt: 0,
  };
}

interface Props {
  result: ImportParseResult;
  excluded: ReadonlySet<number>;
  onToggle: (index: number) => void;
}

/** Every valid note with an include checkbox and its cards rendered exactly as in study. */
export function PreviewNotes({ result, excluded, onToggle }: Props) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const [shown, setShown] = useState(PAGE);
  const label = (n: ParsedNote) =>
    isBuiltinNoteTypeId(n.noteTypeId)
      ? BUILTIN_NOTE_TYPE_LABELS[n.noteTypeId][locale]
      : n.noteTypeId;
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-6">
        {result.notes.slice(0, shown).map((note) => {
          const noteType = previewNoteType(note.noteTypeId, result);
          const included = !excluded.has(note.index);
          return (
            <li
              key={note.index}
              className={`rounded-xl border p-4 ${included ? 'border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 opacity-60 dark:border-slate-700'}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-indigo-600"
                    checked={included}
                    onChange={() => {
                      onToggle(note.index);
                    }}
                  />
                  {t('import.includeNote', { n: note.index + 1 })}
                </label>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {[label(note), note.deck, note.uid, note.tags.join(' ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {note.needsReview && (
                  <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                    {t('browse.needsReviewBadge')}
                  </span>
                )}
              </div>
              {noteType && included && <CardPreview note={note} noteType={noteType} />}
            </li>
          );
        })}
      </ol>
      {shown < result.notes.length && (
        <Button
          className="self-center"
          onClick={() => {
            setShown((s) => s + PAGE);
          }}
        >
          {t('import.showMore', { count: result.notes.length - shown })}
        </Button>
      )}
    </div>
  );
}
