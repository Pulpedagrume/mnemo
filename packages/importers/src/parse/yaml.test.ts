import { describe, expect, it } from 'vitest';
import { parseImport } from './pipeline';

const codes = (r: ReturnType<typeof parseImport>): string[] => r.report.issues.map((i) => i.code);

const YAML = `format: mnemo/1
defaults:
  deck: Biologie::Cellule
  tags: [bio]
notes:
  - type: basic
    uid: bio-1-001
    front: Quel organite produit l’ATP ?
    back: La mitochondrie.
  - type: cloze
    uid: bio-1-002
    fields:
      text: La {{c1::membrane plasmique}} délimite la cellule.
  - type: truefalse
    statement: Les ribosomes sont entourés d’une membrane.
    answer: faux
`;

describe('parseImport — YAML', () => {
  it('parses notes with line numbers, nested fields and boolean words', () => {
    const r = parseImport(YAML, { format: 'yaml' });
    expect(codes(r)).toEqual(['alias', 'alias']);
    expect(r.notes.map((n) => n.line)).toEqual([6, 10, 14]);
    expect(r.notes[1]?.fields.text).toContain('{{c1::');
    expect(r.notes[2]?.data).toEqual({ kind: 'truefalse', answer: false });
    expect(r.notes[0]).toMatchObject({ deck: 'Biologie::Cellule', tags: ['bio'] });
  });

  it('converts tab indentation and drops prose', () => {
    const text = `Voici le fichier demandé :\n\nformat: mnemo/1\nnotes:\n\t- type: basic\n\t  front: Rôle du noyau ?\n\t  back: Contenir l’ADN.\n\nBonne révision !\n`;
    const r = parseImport(text, { format: 'yaml' });
    expect(codes(r)).toEqual(['yaml_tabs_converted', 'prose_removed']);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]?.line).toBe(5);
  });

  it('reports syntax errors with their line', () => {
    const r = parseImport(
      'format: mnemo/1\nnotes:\n  - type: basic\n    front: "a\n    back: b\n',
      { format: 'yaml' },
    );
    expect(codes(r)[0]).toBe('parse_error');
    expect(r.report.issues[0]?.line).toBeGreaterThan(1);
  });

  it('detects a truncated output', () => {
    const notes = Array.from(
      { length: 4 },
      (_, i) =>
        `  - type: basic\n    uid: y-${i + 1}\n    front: Question ${i + 1} ?\n    back: Réponse ${i + 1}`,
    ).join('\n');
    const text = `format: mnemo/1\nnotes:\n${notes}`;
    const cut = text.slice(0, text.lastIndexOf('back:') + 3);
    const r = parseImport(cut, { format: 'yaml' });
    expect(r.notes).toHaveLength(3);
    expect(r.report.truncated).toEqual({ recovered: 3, lastUid: 'y-3' });
    expect(codes(r)).toEqual(['truncated']);
    // A complete file without final newline is not truncated.
    expect(parseImport(text, { format: 'yaml' }).notes).toHaveLength(4);
  });

  it('reports continuation', () => {
    const r = parseImport(
      'format: mnemo/1\ncontinuation: "Reste : chapitre 3"\nnotes:\n  - type: basic\n    front: Qu’est-ce qu’un gène ?\n    back: Un segment d’ADN.\n',
      { format: 'yaml' },
    );
    expect(r.report.continuation).toBe('Reste : chapitre 3');
  });
});
