import type { ImportIssue, IssueCode, IssueSeverity } from '../report';

const MB = 1024 * 1024;
const mb = (bytes: number): string => `${Math.round((bytes / MB) * 10) / 10}`;

const issue = (
  code: IssueCode,
  severity: IssueSeverity,
  path: string,
  message: ImportIssue['message'],
  howToFix: ImportIssue['howToFix'],
): ImportIssue => ({ code, severity, path, message, howToFix });

export const bundleIssues = {
  notAZip: (): ImportIssue =>
    issue(
      'parse_error',
      'error',
      '',
      {
        fr: 'Le fichier n’est pas une archive .zip lisible.',
        en: 'The file is not a readable .zip archive.',
      },
      {
        fr: 'Recréez l’archive au format .zip standard.',
        en: 'Re-create the archive as a standard .zip.',
      },
    ),
  tooManyEntries: (count: number, max: number): ImportIssue =>
    issue(
      'zip_too_large',
      'error',
      '',
      {
        fr: `L’archive contient ${count} entrées (maximum ${max}).`,
        en: `The archive has ${count} entries (maximum ${max}).`,
      },
      {
        fr: 'Découpez l’import en plusieurs archives.',
        en: 'Split the import into several archives.',
      },
    ),
  tooLarge: (total: number, max: number): ImportIssue =>
    issue(
      'zip_too_large',
      'error',
      '',
      {
        fr: `Le contenu décompressé dépasse ${mb(max)} Mo (au moins ${mb(total)} Mo).`,
        en: `The uncompressed content exceeds ${mb(max)} MB (at least ${mb(total)} MB).`,
      },
      {
        fr: 'Réduisez la taille des médias ou découpez l’import.',
        en: 'Shrink the media or split the import.',
      },
    ),
  unsafePath: (path: string): ImportIssue =>
    issue(
      'zip_unsafe_path',
      'error',
      path,
      {
        fr: `Chemin refusé dans l’archive : « ${path} » (.., chemin absolu ou barre oblique inverse).`,
        en: `Path refused in the archive: "${path}" (.., absolute path or backslash).`,
      },
      {
        fr: 'Utilisez des chemins relatifs simples, ex. media/figure.png.',
        en: 'Use plain relative paths, e.g. media/figure.png.',
      },
    ),
  mediaTooLarge: (path: string, size: number, max: number): ImportIssue =>
    issue(
      'media_too_large',
      'error',
      path,
      {
        fr: `Le média « ${path} » fait ${mb(size)} Mo (maximum ${mb(max)} Mo).`,
        en: `Media "${path}" is ${mb(size)} MB (maximum ${mb(max)} MB).`,
      },
      { fr: 'Compressez ou redimensionnez le fichier.', en: 'Compress or resize the file.' },
    ),
  mediaBadType: (path: string): ImportIssue =>
    issue(
      'media_bad_type',
      'error',
      path,
      {
        fr: `Le contenu de « ${path} » n’est pas une image ou un son reconnu.`,
        en: `The content of "${path}" is not a recognized image or audio file.`,
      },
      {
        fr: 'Formats acceptés : PNG, JPEG, GIF, WebP, AVIF, SVG, MP3, OGG, WAV, FLAC, M4A.',
        en: 'Accepted formats: PNG, JPEG, GIF, WebP, AVIF, SVG, MP3, OGG, WAV, FLAC, M4A.',
      },
    ),
  noMain: (): ImportIssue =>
    issue(
      'not_a_document',
      'error',
      '',
      {
        fr: 'Aucun fichier principal (deck.json, deck.yaml ou deck.md) à la racine de l’archive.',
        en: 'No main file (deck.json, deck.yaml or deck.md) at the root of the archive.',
      },
      {
        fr: 'Placez le fichier des notes à la racine, nommé deck.json, deck.yaml ou deck.md.',
        en: 'Put the notes file at the root, named deck.json, deck.yaml or deck.md.',
      },
    ),
  severalMains: (names: readonly string[]): ImportIssue =>
    issue(
      'not_a_document',
      'error',
      '',
      {
        fr: `Plusieurs fichiers principaux possibles : ${names.join(', ')}.`,
        en: `Several possible main files: ${names.join(', ')}.`,
      },
      {
        fr: 'Gardez un seul fichier de notes, ou nommez-le deck.json, deck.yaml ou deck.md.',
        en: 'Keep a single notes file, or name it deck.json, deck.yaml or deck.md.',
      },
    ),
  ignored: (path: string): ImportIssue =>
    issue(
      'media_undeclared',
      'info',
      path,
      {
        fr: `Fichier ignoré (hors du dossier media/) : « ${path} ».`,
        en: `File ignored (outside the media/ folder): "${path}".`,
      },
      { fr: 'Rangez les médias dans media/.', en: 'Put media files in media/.' },
    ),
};
