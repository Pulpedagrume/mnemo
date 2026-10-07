/**
 * Writes the example AI outputs of `examples/ai-outputs/` (deterministic; outputs are committed
 * and used by the acceptance tests). Run: `pnpm --filter @mnemo/importers examples`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import type { ImportDocument, ImportNote } from '../src/format/schema';
import { coursePack, longPack } from './course-pack';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/ai-outputs');
const FENCE = '```';
const LQ = String.fromCharCode(0x201c);
const RQ = String.fromCharCode(0x201d);

type AnyNote = ImportNote & Record<string, unknown>;

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : typeof v === 'string' ? [v] : [];

/** JSON with AI noise: prose + ```json fence (2 warnings) and one structural smart quote pair (1). */
function toJson(doc: ImportDocument): string {
  const json = JSON.stringify(doc, null, 2).replace('"meta":', `${LQ}meta${RQ}:`);
  return `Voici le fichier JSON demandé, au format mnemo/1 :\n\n${FENCE}json\n${json}\n${FENCE}\n\nBonne révision !\n`;
}

/** YAML with AI noise: prose + ```yaml fence (2 warnings) and one type alias `qcm` (1). */
function toYaml(doc: ImportDocument): string {
  const yaml = stringify(doc, { lineWidth: 0 }).replace('- type: mcq', '- type: qcm');
  return `D’accord ! Voici les 120 cartes en YAML :\n\n${FENCE}yaml\n${yaml}${FENCE}\n`;
}

function mdNote(note: AnyNote, spacing: boolean): string[] {
  const tags = asList(note.tags).join(' ');
  const lines = [`::: ${note.type} uid=${String(note.uid)}${tags === '' ? '' : ` tags="${tags}"`}`];
  const q = spacing ? 'Q :' : 'Q:';
  if (note.type === 'basic') lines.push(`${q} ${String(note.front)}`, `A: ${String(note.back)}`);
  if (note.type === 'cloze') lines.push(`Text: ${String(note.text)}`);
  if (typeof note.extra === 'string') lines.push(`Extra: ${note.extra}`);
  if (note.type === 'mcq') {
    lines.push(`${q} ${String(note.question)}`);
    for (const c of note.choices as { text: string; correct: boolean }[])
      lines.push(`- [${c.correct ? 'x' : ' '}] ${c.text}`);
  }
  for (const hint of asList(note.hint)) lines.push(`Hint: ${hint}`);
  if (typeof note.explanation === 'string') lines.push(`Explanation: ${note.explanation}`);
  lines.push(':::', '');
  return lines;
}

/** Mnemo Markdown with AI noise: prose + ```markdown fence (2) and one `Q :` spacing (1). */
function toMarkdown(doc: ImportDocument): string {
  const lines = [
    '---',
    'format: mnemo/1',
    `title: ${doc.meta?.title ?? ''}`,
    'tags: [revision]',
    '---',
    '',
  ];
  let deck = '';
  doc.notes.forEach((n, i) => {
    const note = n as AnyNote;
    if (note.deck !== deck) {
      deck = String(note.deck);
      lines.push(`## ${deck.split('::').pop() ?? ''}`, '', `@deck ${deck}`, '');
    }
    lines.push(...mdNote(note, i === 3));
  });
  return `Voici tes fiches au format Mnemo Markdown :\n\n${FENCE}markdown\n${lines.join('\n')}${FENCE}\n`;
}

const csvCell = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV with AI noise: a sentence before the header (1) and `Recto`/`Verso` headers (2 aliases).
 * CSV has no document defaults: the default tag is repeated on every row. */
function toCsv(doc: ImportDocument): string {
  const headers = [
    'type',
    'deck',
    'tags',
    'uid',
    'Recto',
    'Verso',
    'text',
    'extra',
    'hint',
    'explanation',
    'question',
    'choice1',
    'choice2',
    'choice3',
    'choice4',
    'correct',
  ];
  const rows = doc.notes.map((n) => {
    const note = n as AnyNote;
    const choices = (note.choices ?? []) as { text: string; correct: boolean }[];
    const cell: Record<string, string> = {
      type: note.type,
      deck: note.deck ?? '',
      tags: ['revision', ...asList(note.tags)].join(' '),
      uid: note.uid ?? '',
      Recto: typeof note.front === 'string' ? note.front : '',
      Verso: typeof note.back === 'string' ? note.back : '',
      text: typeof note.text === 'string' ? note.text : '',
      extra: typeof note.extra === 'string' ? note.extra : '',
      hint: asList(note.hint).join(' | '),
      explanation: typeof note.explanation === 'string' ? note.explanation : '',
      question: typeof note.question === 'string' ? note.question : '',
      correct: choices.flatMap((c, i) => (c.correct ? [String(i + 1)] : [])).join('|'),
    };
    choices.forEach((c, i) => (cell[`choice${i + 1}`] = c.text));
    return headers.map((h) => csvCell(cell[h] ?? '')).join(',');
  });
  return `Voici le fichier CSV :\n${headers.join(',')}\n${rows.join('\n')}\n`;
}

/** A2: exactly five problems (type alias, cloze without hole, MCQ without answer, duplicate uid, missing image). */
function withErrors(): string {
  return `format: mnemo/1
meta:
  title: Chapitre 2 — la cellule
defaults:
  deck: Biologie::Cellule
  tags: [cellule]
notes:
  - type: basic
    uid: bio-9-001
    front: Quel organite réalise la respiration cellulaire ?
    back: La mitochondrie.
  - type: qcm
    uid: bio-9-002
    question: Quelles structures trouve-t-on uniquement dans la cellule végétale ?
    choices:
      - text: La paroi cellulosique
        correct: true
      - text: Le chloroplaste
        correct: true
      - text: Le ribosome
        correct: false
  - type: cloze
    uid: bio-9-003
    text: Le réticulum endoplasmique rugueux est couvert de ribosomes.
  - type: mcq
    uid: bio-9-004
    question: Quelle molécule stocke l’énergie utilisable par la cellule ?
    choices:
      - text: Le glucose
      - text: L’ATP
      - text: L’ADN
  - type: basic
    uid: bio-9-005
    front: Quel est le rôle des lysosomes ?
    back: Digérer les déchets de la cellule.
  - type: basic
    uid: bio-9-005
    front: Quel est le rôle de l’appareil de Golgi ?
    back: Trier et expédier les protéines.
  - type: basic
    uid: bio-9-006
    front: "Identifie l’organite sur ce schéma : ![coupe d’une cellule](media:fig-x)"
    back: Le noyau.
  - type: cloze
    uid: bio-9-007
    text: La {{c1::membrane plasmique}} contrôle les échanges avec le milieu extérieur.
`;
}

/** A3: a JSON output cut in the middle of the 41st note. */
function truncatedJson(): string {
  const json = JSON.stringify(longPack(), null, 2);
  const uid41 = String((longPack().notes[40] as AnyNote).uid);
  const cutAt = json.indexOf('"front"', json.indexOf(`"uid": "${uid41}"`));
  if (cutAt < 0) throw new Error('unexpected pack layout');
  return json.slice(0, cutAt + 20);
}

const files: Record<string, string> = {
  'course-pack.json': toJson(coursePack()),
  'course-pack.yaml': toYaml(coursePack()),
  'course-pack.md': toMarkdown(coursePack()),
  'course-pack.csv': toCsv(coursePack()),
  'with-errors.yaml': withErrors(),
  'truncated.json': truncatedJson(),
};

mkdirSync(OUT, { recursive: true });
for (const [name, text] of Object.entries(files)) writeFileSync(join(OUT, name), text);
console.log(`Wrote ${Object.keys(files).length} files to ${OUT}`);
