import { jsonrepair } from 'jsonrepair';
import { reportProse } from '../cleanup/text';
import {
  fixStructuralSmartQuotes,
  removeComments,
  removeTrailingCommas,
} from '../cleanup/json-fix';
import { t, type IssueSink } from '../issue';
import { lineColAt, lineOf, lineStarts } from '../text';
import type { FormatOutput, NoteLoc } from '../types';
import { findJsonStart, recoverTruncated, scanJson, type JsonScan } from './scan';

function tryParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function locsOf(text: string, scan: JsonScan, lineOffset: number): NoteLoc[] {
  const starts = lineStarts(text);
  return scan.notes.map((span) => ({
    line: lineOf(starts, span.start) + lineOffset,
    excerpt: text.slice(span.start, Math.min(span.end, span.start + 400)),
  }));
}

function reportSyntax(sink: IssueSink, text: string, error: string, lineOffset: number): void {
  const pos = /position (\d+)/.exec(error);
  const loc = pos ? lineColAt(text, Number(pos[1])) : undefined;
  const lineEnd = loc ? text.indexOf('\n', Number(pos?.[1])) : -1;
  const lineText = loc
    ? text.slice(Number(pos?.[1]) - (loc.column - 1), lineEnd < 0 ? undefined : lineEnd)
    : '';
  sink.error(
    'parse_error',
    t(`JSON invalide : ${error}`, `Invalid JSON: ${error}`),
    t(
      'Corrigez la syntaxe à l’endroit indiqué (guillemets droits " ", virgules entre les éléments, accolades et crochets fermés).',
      'Fix the syntax at the given location (straight quotes " ", commas between items, closed braces and brackets).',
    ),
    loc ? { line: loc.line + lineOffset, column: loc.column, excerpt: lineText } : {},
  );
}

function applyFixes(text: string, sink: IssueSink): string {
  const quotes = fixStructuralSmartQuotes(text);
  if (quotes.count > 0) {
    sink.fix(
      'smart_quotes_fixed',
      t(
        `${quotes.count} guillemet(s) typographique(s) « “ ” » remplacé(s) par des guillemets droits.`,
        `${quotes.count} typographic quote(s) “ ” replaced by straight quotes.`,
      ),
      t(
        'Utilisez des guillemets droits " pour délimiter les chaînes JSON.',
        'Use straight quotes " to delimit JSON strings.',
      ),
    );
  }
  const comments = removeComments(quotes.text);
  if (comments.count > 0) {
    sink.fix(
      'comments_removed',
      t(`${comments.count} commentaire(s) supprimé(s).`, `${comments.count} comment(s) removed.`),
      t(
        'Le JSON n’accepte pas de commentaires : retirez-les.',
        'JSON has no comments: remove them.',
      ),
    );
  }
  const commas = removeTrailingCommas(comments.text);
  if (commas.count > 0) {
    sink.fix(
      'trailing_commas_removed',
      t(
        `${commas.count} virgule(s) en trop avant « ] » ou « } » supprimée(s).`,
        `${commas.count} trailing comma(s) before "]" or "}" removed.`,
      ),
      t(
        'Ne mettez pas de virgule après le dernier élément d’une liste ou d’un objet.',
        'Do not put a comma after the last item of a list or object.',
      ),
    );
  }
  return commas.text;
}

/** Parses a JSON import, repairing it in tolerant mode. Never throws. */
export function parseJsonText(input: string, sink: IssueSink): FormatOutput {
  const start = findJsonStart(input);
  if (start < 0) {
    const direct = tryParse(input.trim());
    if (direct.ok) return { root: direct.value, locs: [] };
    sink.error(
      'parse_error',
      t('Aucun objet JSON trouvé dans le fichier.', 'No JSON object found in the file.'),
      t(
        'Le fichier doit commencer par « { » et contenir « "format": "mnemo/1" » et « "notes": [...] ».',
        'The file must start with "{" and contain "format": "mnemo/1" and "notes": [...].',
      ),
    );
    return { root: undefined, locs: [] };
  }
  const before = input.slice(0, start).trim();
  if (before !== '') reportProse(sink, before);
  const cut = sink.strict ? 0 : start;
  const lineOffset = lineColAt(input, cut).line - 1;
  let text = input.slice(cut);
  let scan = scanJson(text);
  const trailing = scan.end >= 0 ? text.slice(scan.end).trim() : '';
  // Text after the closing bracket is prose unless it still looks like JSON (mismatched brackets).
  if (trailing !== '' && !/^[,}\]":{[]/.test(trailing)) {
    reportProse(sink, text.slice(scan.end));
    if (!sink.strict) text = text.slice(0, scan.end);
  }
  const first = tryParse(text);
  if (first.ok) return { root: first.value, locs: locsOf(text, scan, lineOffset) };
  if (sink.strict) {
    reportSyntax(sink, text, first.error, lineOffset);
    return { root: undefined, locs: [], truncated: scan.end < 0 && scan.start >= 0 };
  }
  text = applyFixes(text, sink);
  scan = scanJson(text);
  const fixed = tryParse(text);
  if (fixed.ok) return { root: fixed.value, locs: locsOf(text, scan, lineOffset) };
  let truncated = false;
  if (scan.end < 0) {
    truncated = true;
    const recovered = recoverTruncated(text, scan);
    if (recovered === undefined) return { root: undefined, locs: [], truncated };
    text = recovered;
    const parsed = tryParse(text);
    if (parsed.ok) return { root: parsed.value, locs: locsOf(text, scan, lineOffset), truncated };
  }
  try {
    const repaired = jsonrepair(text);
    const parsed = tryParse(repaired);
    if (parsed.ok) {
      sink.fix(
        'json_repaired',
        t(
          'JSON réparé automatiquement (syntaxe incorrecte) : vérifiez le contenu importé.',
          'JSON repaired automatically (invalid syntax): check the imported content.',
        ),
        t(
          'Produisez un JSON strictement valide (guillemets droits, virgules, crochets fermés).',
          'Produce strictly valid JSON (straight quotes, commas, closed brackets).',
        ),
      );
      const repairedScan = scanJson(repaired);
      return { root: parsed.value, locs: locsOf(repaired, repairedScan, lineOffset), truncated };
    }
  } catch {
    // Fall through to the syntax error below.
  }
  const failure = tryParse(text);
  reportSyntax(sink, text, failure.ok ? 'unknown error' : failure.error, lineOffset);
  return { root: undefined, locs: [], truncated };
}
