import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageTitle } from '../components/PageTitle';
import { NoteEditForm } from '../features/editor/NoteEditForm';

export function NoteEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  return (
    <>
      <PageTitle title={id ? t('editor.editTitle') : t('editor.newTitle')} />
      <NoteEditForm
        noteId={id}
        deckId={params.get('deck') ?? undefined}
        noteTypeId={params.get('type') ?? undefined}
        onCancel={() => {
          void navigate(-1);
        }}
        onSaved={(state) => {
          if (id) void navigate(-1);
          // Keep the deck and type for the next note.
          else
            void navigate(`/notes/new?deck=${state.deckId}&type=${state.noteTypeId}`, {
              replace: true,
            });
        }}
      />
    </>
  );
}
