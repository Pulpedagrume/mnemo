import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createNote,
  getNoteWithCards,
  listDecks,
  listNoteTypes,
  updateNote,
} from '@mnemo/services';
import { useMutation, useQuery } from '../../app/services';
import { errorMessage } from '../../app/errors';
import { toast } from '../../components/ui/Toaster';
import { NoteEditor } from './NoteEditor';
import { editorStateFromNote, emptyEditorState, toNoteInput, type EditorState } from './model';

interface Props {
  /** Existing note to edit; absent to create a new one. */
  noteId?: string | undefined;
  /** Defaults for a new note. */
  deckId?: string | undefined;
  noteTypeId?: string | undefined;
  /** Called after a successful save with the deck and type used. */
  onSaved: (state: EditorState) => void;
  onCancel: () => void;
  compact?: boolean;
}

/** Loads the data the editor needs and saves through the services. Used by the page and panel. */
export function NoteEditForm({ noteId, deckId, noteTypeId, onSaved, onCancel, compact }: Props) {
  const { t } = useTranslation();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const save = useMutation(async (ctx, state: EditorState) => {
    const input = toNoteInput(state);
    return noteId ? updateNote(ctx, noteId, input) : createNote(ctx, input);
  });

  const query = useQuery(
    async (ctx) => {
      const [noteTypes, decks] = await Promise.all([listNoteTypes(ctx), listDecks(ctx)]);
      decks.sort((a, b) => a.name.localeCompare(b.name));
      if (noteId) {
        const loaded = await getNoteWithCards(ctx, noteId);
        return { noteTypes, decks, initial: loaded ? editorStateFromNote(loaded.note) : null };
      }
      const type = noteTypes.find((n) => n.id === (noteTypeId ?? 'basic')) ?? noteTypes[0];
      const deck = deckId ?? decks[0]?.id;
      return { noteTypes, decks, initial: type && deck ? emptyEditorState(type, deck) : null };
    },
    [noteId, deckId, noteTypeId],
  );

  if (query.status === 'loading') return <p aria-busy="true">{t('common.loading')}</p>;
  if (query.status === 'error') return <p role="alert">{errorMessage(query.error, t)}</p>;
  const { initial, noteTypes, decks } = query.data;
  if (!initial) return <p>{noteId ? t('editor.notFound') : t('editor.needDeck')}</p>;

  return (
    <NoteEditor
      key={`${noteId ?? 'new'}-${String(formKey)}`}
      initial={initial}
      noteTypes={noteTypes}
      decks={decks}
      lockType={Boolean(noteId)}
      compact={compact ?? false}
      saving={saving}
      error={error}
      onCancel={onCancel}
      onSave={(state) => {
        setSaving(true);
        setError(undefined);
        save(state)
          .then(
            () => {
              toast(noteId ? t('editor.saved') : t('editor.created'), 'success');
              if (!noteId) setFormKey((k) => k + 1);
              onSaved(state);
            },
            (e: unknown) => {
              setError(errorMessage(e, t));
            },
          )
          .finally(() => {
            setSaving(false);
          });
      }}
    />
  );
}
