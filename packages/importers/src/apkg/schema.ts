/**
 * Legacy Anki collection schema (version 11) and the minimal JSON written into the `col` row,
 * written from the publicly documented collection format.
 */

export const ANKI_SCHEMA_SQL = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null,
  scm integer not null, ver integer not null, dty integer not null, usn integer not null,
  ls integer not null, conf text not null, models text not null, decks text not null,
  dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null,
  mod integer not null, usn integer not null, tags text not null, flds text not null,
  sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null,
  ord integer not null, mod integer not null, usn integer not null, type integer not null,
  queue integer not null, due integer not null, ivl integer not null, factor integer not null,
  reps integer not null, lapses integer not null, left integer not null, odue integer not null,
  odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
  time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_cid ON revlog (cid);
CREATE INDEX ix_notes_csum ON notes (csum);
`;

/** Fixed model ids, so that re-exports map to the same Anki note types. */
export const MODEL_IDS = {
  basic: 1_342_697_561_419,
  basic_reversed: 1_342_697_561_420,
  cloze: 1_342_697_561_421,
} as const;
export type ExportModelKind = keyof typeof MODEL_IDS;

const CSS = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}
.cloze {
  font-weight: bold;
  color: blue;
}`;

const field = (name: string, ord: number) => ({
  name,
  ord,
  sticky: false,
  rtl: false,
  font: 'Arial',
  size: 20,
  media: [],
});

const template = (name: string, ord: number, qfmt: string, afmt: string) => ({
  name,
  ord,
  qfmt,
  afmt,
  did: null,
  bqfmt: '',
  bafmt: '',
});

const ANSWER = '{{FrontSide}}\n\n<hr id=answer>\n\n';

export function modelsJson(mod: number): Record<string, unknown> {
  const base = (kind: ExportModelKind, name: string, type: number) => ({
    id: MODEL_IDS[kind],
    name,
    type,
    mod,
    usn: -1,
    sortf: 0,
    did: 1,
    css: CSS,
    latexPre:
      '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    latexsvg: false,
    tags: [],
    vers: [],
  });
  return {
    [MODEL_IDS.basic]: {
      ...base('basic', 'Basic', 0),
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [template('Card 1', 0, '{{Front}}', `${ANSWER}{{Back}}`)],
      req: [[0, 'any', [0]]],
    },
    [MODEL_IDS.basic_reversed]: {
      ...base('basic_reversed', 'Basic (and reversed card)', 0),
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [
        template('Card 1', 0, '{{Front}}', `${ANSWER}{{Back}}`),
        template('Card 2', 1, '{{Back}}', `${ANSWER}{{Front}}`),
      ],
      req: [
        [0, 'any', [0]],
        [1, 'any', [1]],
      ],
    },
    [MODEL_IDS.cloze]: {
      ...base('cloze', 'Cloze', 1),
      flds: [field('Text', 0), field('Back Extra', 1)],
      tmpls: [template('Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>\n{{Back Extra}}')],
      req: [[0, 'any', [0]]],
    },
  };
}

export function deckJson(id: number, name: string, desc: string, mod: number) {
  return {
    id,
    name,
    desc,
    mod,
    usn: -1,
    collapsed: false,
    browserCollapsed: false,
    newToday: [0, 0],
    revToday: [0, 0],
    lrnToday: [0, 0],
    timeToday: [0, 0],
    dyn: 0,
    conf: 1,
    extendNew: 0,
    extendRev: 0,
  };
}

export function dconfJson(mod: number): Record<string, unknown> {
  return {
    '1': {
      id: 1,
      name: 'Default',
      mod,
      usn: -1,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      dyn: false,
      new: {
        delays: [1, 10],
        ints: [1, 4, 0],
        initialFactor: 2500,
        order: 1,
        perDay: 20,
        bury: false,
      },
      rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36_500, bury: false, hardFactor: 1.2 },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 1 },
    },
  };
}

export function confJson(): Record<string, unknown> {
  return {
    activeDecks: [1],
    curDeck: 1,
    newSpread: 0,
    collapseTime: 1200,
    timeLim: 0,
    estTimes: true,
    dueCounts: true,
    curModel: String(MODEL_IDS.basic),
    nextPos: 1,
    sortType: 'noteFld',
    sortBackwards: false,
    addToCur: true,
  };
}
