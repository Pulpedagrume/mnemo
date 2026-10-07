import { describe, expect, it } from 'vitest';
import { parseImport } from './pipeline';

const codes = (r: ReturnType<typeof parseImport>): string[] => r.report.issues.map((i) => i.code);
const csv = (text: string, strict = false) => parseImport(text, { format: 'csv', strict });

describe('parseImport — CSV/TSV', () => {
  it('reads headers, quoted cells with newlines and MCQ columns', () => {
    const r = csv(
      [
        'type;deck;tags;uid;front;back;text;question;choice1;choice2;choice3;correct;hint',
        'basic;Histoire::Rome;antiquite;h-1;"Qui a fondé Rome ; selon la légende ?";"Romulus,',
        'et Rémus";;;;;;;indice 1 | indice 2',
        'cloze;Histoire::Rome;;h-2;;;La République romaine naît en {{c1::-509}}.;;;;;;',
        'mcq;Histoire::Rome;;h-3;;;;Qui franchit le Rubicon ?;César;Pompée;"Crassus ""le riche""";1;',
      ].join('\n'),
    );
    expect(r.report.issues).toEqual([]);
    expect(r.notes.map((n) => n.line)).toEqual([2, 4, 5]);
    expect(r.notes[0]).toMatchObject({
      fields: { front: 'Qui a fondé Rome ; selon la légende ?', back: 'Romulus,\net Rémus' },
      hints: ['indice 1', 'indice 2'],
      deck: 'Histoire::Rome',
      tags: ['antiquite'],
    });
    expect(r.notes[2]?.data).toMatchObject({
      choices: [
        { text: 'César', correct: true },
        { text: 'Pompée', correct: false },
        { text: 'Crassus "le riche"', correct: false },
      ],
    });
  });

  it('detects tabs, BOM and aliased headers', () => {
    const r = parseImport(
      String.fromCharCode(0xfeff) + 'Recto\tVerso\nCapitale de l’Égypte antique ?\tThèbes\n',
      { fileName: 'cours.tsv' },
    );
    expect(codes(r)).toEqual(['bom_removed', 'alias', 'alias']);
    expect(r.notes[0]?.fields).toEqual({ front: 'Capitale de l’Égypte antique ?', back: 'Thèbes' });
  });

  it('reads two columns without headers', () => {
    const r = csv('Année de la prise de la Bastille ?,1789\nPremier empereur romain ?,Auguste\n');
    expect(codes(r)).toEqual(['csv_no_headers']);
    expect(r.notes).toHaveLength(2);
    expect(csv('a b c,d\n', true).report.issues[0]?.severity).toBe('error');
  });

  it('reports bad answer references, extra cells and unknown columns', () => {
    const r = csv(
      'type,question,choice1,choice2,correct,couleur\nmcq,Quel fleuve traverse Rome ?,Tibre,Pô,3,\nbasic,,,,,,extra\n',
    );
    expect(codes(r)).toEqual([
      'unknown_key',
      'mcq_bad_answer_ref',
      'csv_bad_row',
      'mcq_no_correct',
      'missing_field',
      'missing_field',
    ]);
    expect(r.notes).toHaveLength(0);
  });

  it('drops prose before the header', () => {
    const r = csv(
      'Voici le fichier CSV demandé :\n\ntype,front,back\nbasic,Date de la chute de Constantinople ?,1453\n',
    );
    expect(codes(r)).toEqual(['prose_removed']);
    expect(r.notes[0]?.line).toBe(4);
  });
});
