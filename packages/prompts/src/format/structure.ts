import type { I18nString, Locale } from '@mnemo/core';
import type { OutputFormat } from '../tasks';

/** How a file looks in each output format (first lines of the FORMAT block). */
export interface FormatStructure {
  lines: Readonly<Record<Locale, readonly string[]>>;
  /** Root `media` list (figures), when the format has one. */
  media?: I18nString;
  /** Advice for notes containing code blocks, when the format needs one. */
  codeBlocks?: I18nString;
}

const MEDIA: I18nString = {
  fr: 'media (racine, pour les figures) : liste de {id, file, alt} ; id court [A-Za-z0-9._-], file = nom de l’image, alt = description précise. Dans un texte : ![légende](media:id).',
  en: 'media (root, for figures): list of {id, file, alt}; short id [A-Za-z0-9._-], file = image name, alt = precise description. In a text: ![caption](media:id).',
};

export const STRUCTURE: Readonly<Record<OutputFormat, FormatStructure>> = {
  markdown: {
    lines: {
      fr: [
        'En-tête facultatif (format, deck), puis une note par bloc : « ::: type attributs », lignes « Champ: valeur » (multiligne possible), « ::: » qui ferme.',
        'Hors bloc : « @deck A::B » change le paquet des blocs suivants ; « @continuation texte » ; le reste est ignoré.',
      ],
      en: [
        'Optional header (format, deck), then one note per block: "::: type attributes", "Field: value" lines (may span several lines), ":::" to close.',
        'Outside blocks: "@deck A::B" changes the deck of the following blocks; "@continuation text"; anything else is ignored.',
      ],
    },
    codeBlocks: {
      fr: 'Si une note contient un bloc de code ```, entoure le fichier entier de ```` (quatre accents graves).',
      en: 'If a note contains a ``` code block, wrap the whole file in ```` (four backticks).',
    },
  },
  json: {
    lines: {
      fr: [
        'Un seul objet : {"format": "mnemo/1", "defaults": {"deck": "…"}, "notes": [ … ], "continuation": null}. defaults est facultatif et s’applique à chaque note.',
        'Chaque note est un objet avec "type" et ses clés (? = facultatif).',
      ],
      en: [
        'A single object: {"format": "mnemo/1", "defaults": {"deck": "…"}, "notes": [ … ], "continuation": null}. defaults is optional and applies to every note.',
        'Each note is an object with "type" and its keys (? = optional).',
      ],
    },
    media: MEDIA,
  },
  yaml: {
    lines: {
      fr: [
        'Clés racine : format: mnemo/1, defaults: {deck: …} (facultatif, s’applique à chaque note), notes: (liste), continuation: null.',
        'Chaque note est un élément de notes avec type et ses clés (? = facultatif).',
        'Mets entre guillemets un texte qui commence par un symbole ou contient « : » ou « # » ; LaTeX et code dans un bloc « | » (sans échappement).',
      ],
      en: [
        'Root keys: format: mnemo/1, defaults: {deck: …} (optional, applies to every note), notes: (list), continuation: null.',
        'Each note is an item of notes with type and its keys (? = optional).',
        'Quote any text that starts with a symbol or contains ": " or " #"; put LaTeX and code in a "|" block (no escaping).',
      ],
    },
    media: MEDIA,
  },
  csv: {
    lines: {
      fr: [
        'UTF-8, séparateur virgule, première ligne = en-têtes, une note par ligne ; les colonnes inutiles restent vides ; colonne type : basic par défaut.',
        'Entoure de guillemets doubles toute cellule qui contient une virgule, un guillemet (doublé : "") ou un retour à la ligne.',
        'needsReview et difficulty n’existent pas en CSV : signale un doute dans extra.',
      ],
      en: [
        'UTF-8, comma separator, first line = headers, one note per line; unused columns stay empty; type column: basic by default.',
        'Wrap in double quotes any cell that contains a comma, a quote (doubled: "") or a line break.',
        'needsReview and difficulty do not exist in CSV: report a doubt in extra.',
      ],
    },
  },
};
