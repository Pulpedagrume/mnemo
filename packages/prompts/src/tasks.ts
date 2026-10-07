import type { I18nString } from '@mnemo/core';
import type { ImportFormat, ImportNoteType } from '@mnemo/importers';
import { IMPORT_NOTE_TYPES } from '@mnemo/importers';
import type { TemplateName } from './templates.generated';

/** Output formats an AI can be asked to produce (same as the import formats). */
export type OutputFormat = ImportFormat;
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['markdown', 'yaml', 'json', 'csv'];

/** Note types that fit in the CSV columns (`type, front, back, text, question, choice1…8, correct`). */
export const CSV_NOTE_TYPES: readonly ImportNoteType[] = ['basic', 'basic_reversed', 'cloze', 'mcq'];

/** Tasks composed by `buildPrompt` (blocks RÔLE → DOCUMENT). */
export const COMPOSED_TASK_IDS = [
  'flashcards',
  'cloze',
  'mcq',
  'course-pack',
  'vocabulary',
  'formulas',
  'code',
  'timeline',
  'convert',
  'audit',
  'images',
] as const;
export type ComposedTaskId = (typeof COMPOSED_TASK_IDS)[number];

/** Follow-up prompts with their own builders (fix, continue, plan, batch). */
export const SPECIAL_TASK_IDS = ['fix', 'continue', 'plan', 'batch'] as const;
export type SpecialTaskId = (typeof SPECIAL_TASK_IDS)[number];

export const PROMPT_TASK_IDS = [...COMPOSED_TASK_IDS, ...SPECIAL_TASK_IDS] as const;
export type PromptTaskId = ComposedTaskId | SpecialTaskId;

export interface PromptTask {
  id: PromptTaskId;
  /** Number in docs/AI_PROMPTS.md (T1…T15). */
  code: string;
  kind: 'composed' | 'special';
  /** Template file (`prompts/<locale>/<template>.md`). */
  template: TemplateName;
  /** Note types the task produces: the FORMAT block and the example only embed these. */
  noteTypes: readonly ImportNoteType[];
  /** The task declares media (figures): needs a format with a `media` list. */
  media: boolean;
  /** Notes are likely to contain code blocks (adds the Markdown fence advice). */
  codeBlocks: boolean;
  label: I18nString;
  description: I18nString;
  recommendedFormat: OutputFormat;
  /** Formats able to express the task. */
  formats: readonly OutputFormat[];
}

const ALL_FORMATS = OUTPUT_FORMATS;
const STRUCTURED: readonly OutputFormat[] = ['yaml', 'json'];

type Defaulted = 'media' | 'codeBlocks' | 'formats' | 'recommendedFormat';
type TaskInput = Omit<PromptTask, 'kind' | Defaulted> & Partial<Pick<PromptTask, Defaulted>>;

const composed = (t: TaskInput): PromptTask => ({
  kind: 'composed',
  media: false,
  codeBlocks: false,
  formats: ALL_FORMATS,
  recommendedFormat: 'markdown',
  ...t,
});

const special = (t: Omit<TaskInput, 'noteTypes'>): PromptTask => ({
  kind: 'special',
  media: false,
  codeBlocks: false,
  noteTypes: [],
  formats: ALL_FORMATS,
  recommendedFormat: 'markdown',
  ...t,
});

export const PROMPT_TASKS: readonly PromptTask[] = [
  composed({
    id: 'flashcards',
    code: 'T1',
    template: 'task-flashcards',
    noteTypes: ['basic', 'basic_reversed', 'typed'],
    label: { fr: 'Flashcards recto/verso', en: 'Front/back flashcards' },
    description: {
      fr: 'Questions et réponses, paires terme ⇄ définition, réponses à saisir.',
      en: 'Questions and answers, term ⇄ definition pairs, typed answers.',
    },
  }),
  composed({
    id: 'cloze',
    code: 'T2',
    template: 'task-cloze',
    noteTypes: ['cloze'],
    label: { fr: 'Textes à trous', en: 'Cloze deletions' },
    description: {
      fr: 'Phrases du cours avec des trous sur les notions clés.',
      en: 'Sentences from the course with blanks on the key concepts.',
    },
  }),
  composed({
    id: 'mcq',
    code: 'T3',
    template: 'task-mcq',
    noteTypes: ['mcq'],
    label: { fr: 'QCM', en: 'Multiple choice' },
    description: {
      fr: 'Questions à choix multiples avec distracteurs réalistes et explications.',
      en: 'Multiple-choice questions with realistic distractors and explanations.',
    },
  }),
  composed({
    id: 'course-pack',
    code: 'T4',
    template: 'task-course-pack',
    noteTypes: [
      'basic',
      'basic_reversed',
      'cloze',
      'mcq',
      'ordering',
      'matching',
      'list',
      'truefalse',
      'typed',
    ],
    label: {
      fr: 'Mélange intelligent (recommandé pour un cours complet)',
      en: 'Smart mix (recommended for a full course)',
    },
    description: {
      fr: 'Le type de carte le plus efficace pour chaque information, par chapitre.',
      en: 'The most effective card type for each piece of information, by chapter.',
    },
  }),
  composed({
    id: 'vocabulary',
    code: 'T5',
    template: 'task-vocabulary',
    noteTypes: ['basic_reversed', 'cloze', 'typed'],
    label: { fr: 'Vocabulaire et langues', en: 'Vocabulary and languages' },
    description: {
      fr: 'Mot ⇄ traduction, phrases d’exemple à trous, orthographe.',
      en: 'Word ⇄ translation, example sentences with blanks, spelling.',
    },
  }),
  composed({
    id: 'formulas',
    code: 'T6',
    template: 'task-formulas',
    noteTypes: ['cloze', 'basic', 'typed'],
    recommendedFormat: 'yaml',
    label: { fr: 'Formules et calculs', en: 'Formulas and calculations' },
    description: {
      fr: 'Formules en LaTeX, conditions d’utilisation, exemples chiffrés.',
      en: 'LaTeX formulas, conditions of use, numerical examples.',
    },
  }),
  composed({
    id: 'code',
    code: 'T7',
    template: 'task-code',
    noteTypes: ['typed', 'cloze', 'basic', 'mcq'],
    codeBlocks: true,
    recommendedFormat: 'yaml',
    label: { fr: 'Code et commandes', en: 'Code and commands' },
    description: {
      fr: 'Syntaxe, commandes, lecture de code, erreurs fréquentes.',
      en: 'Syntax, commands, reading code, common mistakes.',
    },
  }),
  composed({
    id: 'timeline',
    code: 'T8',
    template: 'task-timeline',
    noteTypes: ['basic', 'mcq', 'ordering', 'matching'],
    label: { fr: 'Dates et chronologie', en: 'Dates and timeline' },
    description: {
      fr: 'Dates, événements, causes et conséquences, chronologies.',
      en: 'Dates, events, causes and consequences, chronologies.',
    },
  }),
  composed({
    id: 'convert',
    code: 'T9',
    template: 'task-convert',
    noteTypes: ['basic', 'mcq', 'matching', 'ordering'],
    label: {
      fr: 'Convertir mes anciennes fiches ou banques de questions',
      en: 'Convert my old flashcards or question banks',
    },
    description: {
      fr: 'Conversion fidèle, sans reformulation ni ajout.',
      en: 'Faithful conversion, without rewording or additions.',
    },
  }),
  composed({
    id: 'audit',
    code: 'T10',
    template: 'task-audit',
    noteTypes: IMPORT_NOTE_TYPES,
    label: { fr: 'Vérifier ou corriger un fichier existant', en: 'Check or fix an existing file' },
    description: {
      fr: 'Doublons, questions non autonomes, QCM biaisés… puis notes corrigées.',
      en: 'Duplicates, non self-contained questions, biased MCQs… then corrected notes.',
    },
  }),
  composed({
    id: 'images',
    code: 'T15',
    template: 'task-images',
    noteTypes: ['basic'],
    media: true,
    formats: STRUCTURED,
    recommendedFormat: 'yaml',
    label: { fr: 'Documents avec figures', en: 'Documents with figures' },
    description: {
      fr: 'Figures déclarées dans media et cartes qui les affichent.',
      en: 'Figures declared in media and cards that display them.',
    },
  }),
  special({
    id: 'fix',
    code: 'T11',
    template: 'fix',
    label: { fr: 'Corriger les erreurs d’import', en: 'Fix import errors' },
    description: {
      fr: 'À coller dans la même conversation : l’IA ne renvoie que les notes corrigées.',
      en: 'Paste in the same conversation: the AI only returns the corrected notes.',
    },
  }),
  special({
    id: 'continue',
    code: 'T12',
    template: 'continue',
    label: { fr: 'Continuer un fichier incomplet', en: 'Continue an incomplete file' },
    description: {
      fr: 'Quand la réponse de l’IA est coupée ou annonce une suite.',
      en: 'When the AI reply is cut off or announces a continuation.',
    },
  }),
  special({
    id: 'plan',
    code: 'T13',
    template: 'plan',
    label: { fr: 'Planifier un long document', en: 'Plan a long document' },
    description: {
      fr: 'Analyse du document et découpage en lots, sans créer de cartes.',
      en: 'Analysis of the document and split into batches, without creating cards.',
    },
  }),
  special({
    id: 'batch',
    code: 'T14',
    template: 'batch',
    label: { fr: 'Générer un lot', en: 'Generate a batch' },
    description: {
      fr: 'Un lot de sections d’un long document, avec des uid qui se suivent.',
      en: 'One batch of sections of a long document, with consecutive uids.',
    },
  }),
];

export function getPromptTask(id: PromptTaskId): PromptTask {
  const task = PROMPT_TASKS.find((t) => t.id === id);
  if (!task) throw new RangeError(`Unknown prompt task: ${id}`);
  return task;
}

/** Note types of a task that the format can express (CSV only knows four types). */
export function typesForFormat(
  types: readonly ImportNoteType[],
  format: OutputFormat,
): ImportNoteType[] {
  return format === 'csv' ? types.filter((t) => CSV_NOTE_TYPES.includes(t)) : [...types];
}
