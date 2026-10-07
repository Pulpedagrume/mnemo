import type { ImportIssue, IssueCode, IssueSeverity } from '../report';

const issue = (
  code: IssueCode,
  severity: IssueSeverity,
  path: string,
  message: ImportIssue['message'],
  howToFix: ImportIssue['howToFix'],
): ImportIssue => ({ code, severity, path, message, howToFix });

const list = (names: readonly string[]): string =>
  names.length <= 5 ? names.join(', ') : `${names.slice(0, 5).join(', ')}…`;

export const apkgIssues = {
  notAnApkg: (): ImportIssue =>
    issue(
      'parse_error',
      'error',
      '',
      {
        fr: 'Le fichier n’est pas un paquet Anki (.apkg) lisible.',
        en: 'The file is not a readable Anki package (.apkg).',
      },
      {
        fr: 'Exportez à nouveau le paquet depuis Anki (Fichier > Exporter, format .apkg).',
        en: 'Export the deck again from Anki (File > Export, .apkg format).',
      },
    ),
  newFormat: (): ImportIssue =>
    issue(
      'parse_error',
      'error',
      'collection.anki21b',
      {
        fr: 'Ce paquet utilise le format récent d’Anki (collection.anki21b), qui n’est pas pris en charge.',
        en: 'This package uses the recent Anki format (collection.anki21b), which is not supported.',
      },
      {
        fr: 'Dans Anki, exportez à nouveau en cochant « Prendre en charge les anciennes versions d’Anki ».',
        en: 'In Anki, export again with “Support older Anki versions” checked.',
      },
    ),
  noCollection: (): ImportIssue =>
    issue(
      'not_a_document',
      'error',
      '',
      {
        fr: 'Aucune collection (collection.anki2 ou collection.anki21) dans le paquet.',
        en: 'No collection (collection.anki2 or collection.anki21) in the package.',
      },
      {
        fr: 'Exportez à nouveau le paquet depuis Anki au format .apkg.',
        en: 'Export the deck again from Anki as .apkg.',
      },
    ),
  badCollection: (detail: string): ImportIssue =>
    issue(
      'parse_error',
      'error',
      'collection',
      {
        fr: `Collection Anki illisible : ${detail}.`,
        en: `Unreadable Anki collection: ${detail}.`,
      },
      {
        fr: 'Exportez à nouveau le paquet en cochant « Prendre en charge les anciennes versions d’Anki ».',
        en: 'Export the deck again with “Support older Anki versions” checked.',
      },
    ),
  badMediaMap: (): ImportIssue =>
    issue(
      'media_missing_file',
      'warning',
      'media',
      {
        fr: 'La liste des médias du paquet est illisible : les images sont ignorées.',
        en: 'The package media list is unreadable: images are ignored.',
      },
      {
        fr: 'Exportez à nouveau en cochant « Prendre en charge les anciennes versions d’Anki ».',
        en: 'Export again with “Support older Anki versions” checked.',
      },
    ),
  sounds: (notes: number, names: readonly string[]): ImportIssue =>
    issue(
      'media_bad_type',
      'warning',
      'notes',
      {
        fr: `${notes} note(s) contiennent des sons ([sound:…]), non pris en charge : ils sont retirés (${list(names)}).`,
        en: `${notes} note(s) contain sounds ([sound:…]), which are not supported: they are removed (${list(names)}).`,
      },
      {
        fr: 'Ajoutez l’audio plus tard si besoin ; le texte des notes est importé.',
        en: 'Add the audio later if needed; the note text is imported.',
      },
    ),
  missingImages: (names: readonly string[]): ImportIssue =>
    issue(
      'media_missing_file',
      'warning',
      'media',
      {
        fr: `${names.length} image(s) absentes ou refusées (type, taille) sont retirées des notes : ${list(names)}.`,
        en: `${names.length} missing or refused image(s) (type, size) are removed from the notes: ${list(names)}.`,
      },
      {
        fr: 'Vérifiez que le paquet a été exporté avec les médias.',
        en: 'Check that the package was exported with its media.',
      },
    ),
  keptHtml: (notes: number): ImportIssue =>
    issue(
      'html_sanitized',
      'info',
      'notes',
      {
        fr: `${notes} note(s) contiennent du HTML sans équivalent Markdown (tableaux…) : il est conservé et nettoyé à l’affichage.`,
        en: `${notes} note(s) contain HTML with no Markdown equivalent (tables…): it is kept and sanitized on display.`,
      },
      {
        fr: 'Relisez ces notes après l’import si leur mise en page compte.',
        en: 'Review these notes after the import if their layout matters.',
      },
    ),
  droppedStyle: (notes: number): ImportIssue =>
    issue(
      'html_sanitized',
      'info',
      'notes',
      {
        fr: `${notes} note(s) avaient des styles en ligne (couleurs, polices) : ils sont retirés, le texte est conservé.`,
        en: `${notes} note(s) had inline styles (colors, fonts): they are removed, the text is kept.`,
      },
      { fr: 'Aucune action nécessaire.', en: 'No action needed.' },
    ),
  customModel: (name: string, id: string): ImportIssue =>
    issue(
      'deck_created',
      'info',
      `models.${id}`,
      {
        fr: `Le type de note Anki « ${name} » est importé comme type personnalisé custom:${id}.`,
        en: `Anki note type "${name}" is imported as the custom type custom:${id}.`,
      },
      { fr: 'Aucune action nécessaire.', en: 'No action needed.' },
    ),
  templateFilters: (name: string, filters: readonly string[]): ImportIssue =>
    issue(
      'unknown_note_type_def',
      'warning',
      `models.${name}`,
      {
        fr: `Filtres de modèle non pris en charge retirés dans « ${name} » : ${list(filters)}.`,
        en: `Unsupported template filters removed in "${name}": ${list(filters)}.`,
      },
      {
        fr: 'Le champ est affiché sans le filtre ; adaptez le modèle si besoin.',
        en: 'The field is shown without the filter; adapt the template if needed.',
      },
    ),
  unsupportedScheduling: (count: number, detail: string): ImportIssue =>
    issue(
      'invalid_value',
      'warning',
      'cards',
      {
        fr: `${count} carte(s) ont un état de planification non pris en charge (${detail}) : elles repartent comme nouvelles.`,
        en: `${count} card(s) have an unsupported scheduling state (${detail}): they start as new.`,
      },
      { fr: 'Aucune action nécessaire.', en: 'No action needed.' },
    ),
  emptyNote: (count: number): ImportIssue =>
    issue(
      'missing_field',
      'warning',
      'notes',
      {
        fr: `${count} note(s) au type de note introuvable dans la collection sont ignorées.`,
        en: `${count} note(s) with a note type missing from the collection are skipped.`,
      },
      {
        fr: 'Exportez à nouveau le paquet depuis Anki.',
        en: 'Export the deck again from Anki.',
      },
    ),
};
