import type { TFunction } from 'i18next';
import { BackupError, DeckError, NoteError, PresetError } from '@mnemo/services';

/** User-facing, translated message for an error thrown by a service. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof NoteError) return t(`errors.note.${error.code}`);
  if (error instanceof DeckError) return t(`errors.deck.${error.code}`);
  if (error instanceof BackupError) return t(`errors.backup.${error.code}`);
  if (error instanceof PresetError) return t(`errors.preset.${error.code}`);
  return t('errors.unexpected', {
    message: error instanceof Error ? error.message : String(error),
  });
}
