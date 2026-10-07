import type { I18nString, Locale } from '@mnemo/core';
import type { Density, DocumentType, Level } from './options';
import type { OutputFormat } from './tasks';

/**
 * Values injected into the templates for the wizard options. Kept here (not in .md files)
 * because they are fragments of sentences chosen by the composer; they are published in
 * docs/AI_PROMPTS.md with the templates.
 */

export const LEVEL_LABELS: Readonly<Record<Level, I18nString>> = {
  debutant: { fr: 'débutant', en: 'beginner' },
  intermediaire: { fr: 'intermédiaire', en: 'intermediate' },
  expert: { fr: 'expert', en: 'expert' },
};

export function densityPhrase(density: Density, locale: Locale): string {
  if (density === 'exhaustif') {
    return locale === 'fr'
      ? 'exhaustif (toutes les notions utiles du document)'
      : 'exhaustive (every useful concept of the document)';
  }
  return locale === 'fr'
    ? `environ ${String(density)} cartes par section`
    : `about ${String(density)} cards per section`;
}

/** `{{regleIndices}}`: hints on / off. */
export const HINT_RULE: Readonly<Record<'on' | 'off', I18nString>> = {
  on: {
    fr: 'Pour chaque carte non triviale, ajoute un indice (champ hint) qui oriente sans révéler la réponse.',
    en: 'For each non-trivial card, add a hint (hint field) that guides without revealing the answer.',
  },
  off: { fr: 'N’ajoute pas d’indices.', en: 'Do not add hints.' },
};

/** `{{regleExplications}}`: explanations on / off. */
export const EXPLANATION_RULE: Readonly<Record<'on' | 'off', I18nString>> = {
  on: {
    fr: 'Ajoute une explication (champ explanation) d’une à deux phrases quand elle aide à comprendre ou à mémoriser.',
    en: 'Add a one- or two-sentence explanation (explanation field) when it helps to understand or to remember.',
  },
  off: { fr: 'N’ajoute pas d’explications.', en: 'Do not add explanations.' },
};

/** `{{portee}}` of the fix prompt (T11). */
export const FIX_SCOPE: Readonly<Record<'notes' | 'full', I18nString>> = {
  notes: {
    fr: 'uniquement les notes corrigées, avec leurs uid d’origine',
    en: 'only the corrected notes, with their original uids',
  },
  full: { fr: 'le fichier complet', en: 'the complete file' },
};

/** Line appended to the TÂCHE block for the document type chosen in the wizard. */
export const DOCUMENT_TYPE_ADVICE: Readonly<Record<DocumentType, I18nString>> = {
  cours: {
    fr: 'Type de document : cours rédigé. Suis son plan pour les sections et les sous-paquets.',
    en: 'Document type: written course. Follow its outline for sections and subdecks.',
  },
  diapositives: {
    fr: 'Type de document : diapositives. Les puces sont elliptiques : rédige des cartes complètes sans rien ajouter, ignore les titres répétés et les pieds de page.',
    en: 'Document type: slides. Bullet points are elliptical: write complete cards without adding anything, ignore repeated titles and footers.',
  },
  article: {
    fr: 'Type de document : article. Vise les thèses, définitions, résultats et chiffres clés.',
    en: 'Document type: article. Target the claims, definitions, results and key figures.',
  },
  manuel: {
    fr: 'Type de document : manuel. Ignore les exercices sans corrigé, les index et les encadrés hors sujet.',
    en: 'Document type: textbook. Ignore exercises without answers, indexes and off-topic boxes.',
  },
  td: {
    fr: 'Type de document : notes de TD. Fais une carte par méthode et par piège ; les exercices deviennent des exemples courts.',
    en: 'Document type: tutorial notes. Make one card per method and per pitfall; exercises become short examples.',
  },
  corrige: {
    fr: 'Type de document : sujet corrigé. Chaque question devient une carte dont la réponse vient de la correction.',
    en: 'Document type: exam with answer key. Each question becomes a card whose answer comes from the answer key.',
  },
};

export const FORMAT_FENCE: Readonly<Record<OutputFormat, string>> = {
  markdown: 'markdown',
  yaml: 'yaml',
  json: 'json',
  csv: 'csv',
};

export const FORMAT_EXTENSION: Readonly<Record<OutputFormat, string>> = {
  markdown: '.md',
  yaml: '.yaml',
  json: '.json',
  csv: '.csv',
};

export const FORMAT_NAMES: Readonly<Record<OutputFormat, string>> = {
  markdown: 'Markdown',
  yaml: 'YAML',
  json: 'JSON',
  csv: 'CSV',
};

/**
 * Self-check item 1 names Markdown-only details (« lignes ::: fermantes »). The template stays
 * exact; for other formats the composer swaps this fragment (a test checks it is present).
 */
export const SELF_CHECK_FORMAT_FRAGMENT: I18nString = {
  fr: 'guillemets, indentation et lignes ::: fermantes',
  en: 'quotes, indentation and closing ::: lines',
};

export const SELF_CHECK_FORMAT_VARIANTS: Readonly<Record<OutputFormat, I18nString | undefined>> = {
  markdown: undefined,
  yaml: { fr: 'guillemets et indentation', en: 'quotes and indentation' },
  json: { fr: 'guillemets, virgules et crochets', en: 'quotes, commas and brackets' },
  csv: { fr: 'en-têtes, séparateurs et guillemets', en: 'headers, separators and quotes' },
};

export const EXAMPLE_HEADER: I18nString = {
  fr: 'EXEMPLE (format valide à imiter ; contenu fictif)',
  en: 'EXAMPLE (valid format to imitate; made-up content)',
};

/** Fallbacks of the continue prompt (T12) when the report does not know them. */
export const CONTINUE_FALLBACK: Readonly<Record<'uid' | 'continuation', I18nString>> = {
  uid: { fr: 'inconnu', en: 'unknown' },
  continuation: {
    fr: 'la note qui suit la dernière note valide',
    en: 'the note that follows the last valid note',
  },
};
