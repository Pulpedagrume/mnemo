import type { Locale } from '@mnemo/core';
import type { ImportIssue, ImportReport, IssueSeverity } from '../report';

const LABELS = {
  fr: {
    title: 'Rapport d’import',
    sep: ' : ',
    summary: (n: number, v: number, i: number, c: number) =>
      `${n} note(s) lue(s), ${v} valide(s), ${i} invalide(s), ${c} carte(s).`,
    error: 'Erreurs',
    warning: 'Avertissements',
    info: 'Informations',
    document: 'Document',
    note: 'Note',
    line: 'ligne',
    fix: 'Correction',
    suggestion: 'Suggestion',
    excerpt: 'Extrait',
    truncated: (n: number, uid: string) =>
      `Fichier coupé : ${n} note(s) récupérée(s), dernière uid : ${uid}.`,
    continuation: 'Suite à générer',
    none: 'Aucun problème.',
  },
  en: {
    title: 'Import report',
    sep: ': ',
    summary: (n: number, v: number, i: number, c: number) =>
      `${n} note(s) read, ${v} valid, ${i} invalid, ${c} card(s).`,
    error: 'Errors',
    warning: 'Warnings',
    info: 'Information',
    document: 'Document',
    note: 'Note',
    line: 'line',
    fix: 'Fix',
    suggestion: 'Suggestion',
    excerpt: 'Excerpt',
    truncated: (n: number, uid: string) =>
      `File cut off: ${n} note(s) recovered, last uid: ${uid}.`,
    continuation: 'Still to generate',
    none: 'No problem.',
  },
} as const;

const SEVERITIES: readonly IssueSeverity[] = ['error', 'warning', 'info'];

function groupLabel(issue: ImportIssue, locale: Locale): string {
  const l = LABELS[locale];
  if (issue.noteIndex === undefined) return l.document;
  const parts = [`${l.note} ${issue.noteIndex + 1}`];
  if (issue.uid !== undefined) parts.push(`uid ${issue.uid}`);
  if (issue.line !== undefined) parts.push(`${l.line} ${issue.line}`);
  return parts.length === 1 ? (parts[0] ?? '') : `${parts[0] ?? ''} (${parts.slice(1).join(', ')})`;
}

function issueLines(issue: ImportIssue, locale: Locale): string[] {
  const l = LABELS[locale];
  const where = issue.path === '' ? '' : ` ${issue.path}`;
  const at =
    issue.noteIndex === undefined && issue.line !== undefined ? ` (${l.line} ${issue.line})` : '';
  const out = [
    `    - [${issue.code}]${where}${at}${l.sep}${issue.message[locale]}`,
    `      ${l.fix}${l.sep}${issue.howToFix[locale]}`,
  ];
  if (issue.suggestion) out.push(`      ${l.suggestion}${l.sep}${issue.suggestion[locale]}`);
  if (issue.excerpt !== undefined)
    out.push(`      ${l.excerpt}${l.sep}${issue.excerpt.replace(/\s*\n\s*/g, ' ⏎ ')}`);
  return out;
}

/** Plain-text report grouped by severity, then by note (document-level issues first). */
export function formatReportText(report: ImportReport, locale: Locale): string {
  const l = LABELS[locale];
  const c = report.counts;
  const lines = [l.title, l.summary(c.notes, c.valid, c.invalid, c.cards)];
  if (report.truncated)
    lines.push(l.truncated(report.truncated.recovered, report.truncated.lastUid ?? '—'));
  if (report.continuation !== undefined)
    lines.push(`${l.continuation}${l.sep}${report.continuation}`);
  if (report.issues.length === 0) lines.push('', l.none);
  for (const severity of SEVERITIES) {
    const issues = report.issues.filter((i) => i.severity === severity);
    if (issues.length === 0) continue;
    lines.push('', `${l[severity]} (${issues.length})`);
    const groups = new Map<string, ImportIssue[]>();
    const sorted = [...issues].sort((a, b) => (a.noteIndex ?? -1) - (b.noteIndex ?? -1));
    for (const issue of sorted) {
      const key = groupLabel(issue, locale);
      groups.set(key, [...(groups.get(key) ?? []), issue]);
    }
    for (const [label, group] of groups) {
      lines.push(`  ${label}`);
      for (const issue of group) lines.push(...issueLines(issue, locale));
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Stable JSON serialization of a report (pretty-printed, for files and the correction prompt). */
export function reportToJson(report: ImportReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
