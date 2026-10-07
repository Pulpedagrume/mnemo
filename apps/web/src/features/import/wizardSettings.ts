import type { Locale } from '@mnemo/core';

export type OutputFormat = 'markdown' | 'yaml' | 'json' | 'csv';
export type Level = 'debutant' | 'intermediaire' | 'expert';
export type Density = 3 | 5 | 10 | 'exhaustif';
export type DocumentType = 'cours' | 'diapositives' | 'article' | 'manuel' | 'td' | 'corrige';

/** Wizard choices, remembered between uses (per browser). */
export interface WizardSettings {
  task: string;
  format: OutputFormat;
  /** The user changed the format by hand: stop following the recommendation. */
  formatChosen: boolean;
  deck: string;
  language: Locale;
  level: Level;
  density: Density;
  hints: boolean;
  explanations: boolean;
  mcqChoices: number;
  uidPrefix: string;
  batchSize: number;
  onlyDocument: boolean;
  documentType: DocumentType;
  longDocument: boolean;
}

const KEY = 'mnemo.importWizard';

export function defaultSettings(locale: Locale): WizardSettings {
  return {
    task: 'course-pack',
    format: 'markdown',
    formatChosen: false,
    deck: locale === 'fr' ? 'Mon cours' : 'My course',
    language: locale,
    level: 'intermediaire',
    density: 5,
    hints: true,
    explanations: true,
    mcqChoices: 4,
    uidPrefix: 'cours',
    batchSize: 40,
    onlyDocument: true,
    documentType: 'cours',
    longDocument: false,
  };
}

export function loadSettings(locale: Locale): WizardSettings {
  const base = defaultSettings(locale);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<WizardSettings>;
    return { ...base, ...stored };
  } catch {
    return base;
  }
}

export function saveSettings(settings: WizardSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // A convenience only: the wizard works without storage.
  }
}
