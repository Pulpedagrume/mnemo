import { FORMAT_ID, type I18nString } from '@mnemo/core';
import { TYPE_ALIASES } from '../../format/aliases';
import type { IssueCode } from '../../report';
import { excerptOf, makeIssue, notePath, t, type IssueSink } from '../issue';
import { foldName } from '../text';
import type { FormatOutput, NoteLoc } from '../types';
import { CodeTracker } from './code';
import { parseBlockBody } from './fields';
import { parseFrontMatter, type FrontMatter } from './frontmatter';
import { parseHeader } from './header';

const OPEN = /^:::(.*)$/;
const CLOSE = /^:::\s*$/;
const DIRECTIVE = /^@(deck|tags|continuation)\b[ \t]*(.*)$/i;

interface State {
  sink: IssueSink;
  lines: string[];
  notes: unknown[];
  locs: NoteLoc[];
  deck?: string;
  tags: string[];
  continuation?: string;
  front: FrontMatter;
  truncated: boolean;
}

function reportAt(
  st: State,
  kind: 'fix' | 'warn' | 'error',
  code: IssueCode,
  message: I18nString,
  howToFix: I18nString,
  loc: { line: number; noteIndex?: number; path?: string; uid?: string; excerpt?: string },
): void {
  const severity = kind === 'error' || (kind === 'fix' && st.sink.strict) ? 'error' : 'warning';
  st.sink.add(makeIssue(code, severity, message, howToFix, loc));
}

/** Index just after the closing `:::` of the block opened at `start`, or where it stops. */
function findBlockEnd(lines: readonly string[], start: number): { end: number; closed: boolean } {
  const code = new CodeTracker();
  for (let j = start + 1; j < lines.length; j++) {
    const line = lines[j] ?? '';
    if (code.inside() || code.opens(line)) {
      code.feed(line);
      continue;
    }
    if (CLOSE.test(line)) return { end: j, closed: true };
    if (OPEN.test(line)) return { end: j, closed: false };
  }
  return { end: lines.length, closed: false };
}

function readBlock(st: State, start: number, header: string): number {
  const { end, closed } = findBlockEnd(st.lines, start);
  const line = start + 1;
  const excerpt = excerptOf(st.lines.slice(start, Math.min(end + 1, start + 12)).join('\n'));
  if (!closed && end >= st.lines.length) {
    // Unclosed block at the end of the file: the AI output was cut off.
    st.truncated = true;
    return end;
  }
  const index = st.notes.length;
  const h = parseHeader(header, st.front.type);
  const uid = typeof h.attrs.uid === 'string' ? h.attrs.uid : undefined;
  const base = { noteIndex: index, excerpt, ...(uid === undefined ? {} : { uid }) };
  if (h.spacing) {
    reportAt(
      st,
      'fix',
      'markdown_spacing_fixed',
      t(
        'Mise en forme Markdown corrigée : espaces autour de « ::: type ».',
        'Markdown layout fixed: spaces around "::: type".',
      ),
      t('Écrivez « ::: type » (un seul espace).', 'Write "::: type" (a single space).'),
      { ...base, line },
    );
  }
  for (const junk of h.junk) {
    reportAt(
      st,
      'fix',
      'unknown_key',
      t(
        `Texte ignoré dans l’en-tête du bloc : « ${junk} ».`,
        `Text ignored in the block header: "${junk}".`,
      ),
      t(
        'L’en-tête ne contient que le type et des attributs clé=valeur (uid=…, deck="…", tags="…").',
        'The header only holds the type and key=value attributes (uid=…, deck="…", tags="…").',
      ),
      { ...base, line, path: notePath(index) },
    );
  }
  if (!closed) {
    reportAt(
      st,
      'error',
      'unclosed_block',
      t(
        `Bloc « ::: ${h.type} » non fermé (ligne ${line}) : il manque « ::: » avant le bloc suivant.`,
        `Block "::: ${h.type}" not closed (line ${line}): ":::" is missing before the next block.`,
      ),
      t('Ajoutez une ligne « ::: » à la fin du bloc.', 'Add a ":::" line at the end of the block.'),
      { ...base, line, path: notePath(index) },
    );
  }
  const canonical = TYPE_ALIASES[foldName(h.type)] ?? h.type.toLowerCase();
  const body = parseBlockBody(
    canonical,
    st.lines.slice(start + 1, end),
    line + 1,
    (kind, code, message, howToFix, at, path) => {
      reportAt(st, kind, code, message, howToFix, {
        ...base,
        line: at,
        path: notePath(index, ...(path === undefined ? [] : [path])),
      });
    },
  );
  const note: Record<string, unknown> = { type: h.type, ...h.attrs, ...body };
  const deck = h.attrs.deck ?? st.deck;
  if (deck !== undefined) note.deck = deck;
  // Tags: front-matter tags are document defaults (merged by the pipeline); `@tags` directive
  // tags are ADDED to them for the following blocks, then the block's own tags.
  const tags = [...st.tags, ...asTags(h.attrs.tags), ...asTags(body.tags)];
  if (tags.length > 0) note.tags = tags;
  else delete note.tags;
  st.notes.push(note);
  st.locs.push({ line, excerpt });
  return closed ? end + 1 : end;
}

function asTags(v: unknown): string[] {
  if (typeof v === 'string') return v.split(/[\s,]+/).filter((s) => s !== '');
  return [];
}

function directive(st: State, name: string, value: string): void {
  const v = value.trim();
  switch (name.toLowerCase()) {
    case 'deck':
      st.deck = v === '' ? undefined : v;
      return;
    case 'tags':
      st.tags = asTags(v);
      return;
    default:
      if (v !== '') st.continuation = st.continuation === undefined ? v : `${st.continuation} ${v}`;
  }
}

/** Parses Mnemo Markdown into a canonical document object. */
export function parseMarkdownText(text: string, sink: IssueSink): FormatOutput {
  const lines = text.split('\n');
  const fm = parseFrontMatter(lines, sink);
  const st: State = {
    sink,
    lines,
    notes: [],
    locs: [],
    tags: [],
    front: fm.front,
    truncated: false,
  };
  const code = new CodeTracker();
  let i = fm.next;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (code.inside() || code.opens(line)) {
      code.feed(line);
      i++;
      continue;
    }
    const open = OPEN.exec(line);
    if (open) {
      if ((open[1] ?? '').trim() === '') {
        sink.error(
          'orphan_block_end',
          t(
            `« ::: » sans bloc ouvert (ligne ${i + 1}).`,
            `":::" without an open block (line ${i + 1}).`,
          ),
          t(
            'Supprimez cette ligne, ou ouvrez le bloc avec « ::: type ».',
            'Remove this line, or open the block with "::: type".',
          ),
          { line: i + 1 },
        );
        i++;
      } else i = readBlock(st, i, open[1] ?? '');
      continue;
    }
    const d = DIRECTIVE.exec(line);
    if (d) directive(st, d[1] ?? '', d[2] ?? '');
    i++;
  }
  const root: Record<string, unknown> = { format: fm.front.format ?? FORMAT_ID, notes: st.notes };
  if (Object.keys(fm.meta).length > 0) root.meta = fm.meta;
  if (Object.keys(fm.defaults).length > 0) root.defaults = fm.defaults;
  if (st.continuation !== undefined) root.continuation = st.continuation;
  return { root, locs: st.locs, truncated: st.truncated };
}
