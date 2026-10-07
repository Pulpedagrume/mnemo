import type { I18nString } from '@mnemo/core';
import type { ImportIssue, IssueCode, IssueSeverity } from '../report';

/** Builds a bilingual string. */
export function t(fr: string, en: string): I18nString {
  return { fr, en };
}

export interface IssueLocation {
  path?: string;
  line?: number;
  column?: number;
  noteIndex?: number;
  uid?: string;
  suggestion?: I18nString;
  excerpt?: string;
}

export const EXCERPT_MAX = 200;

export function excerptOf(s: string): string {
  const trimmed = s.trim();
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX - 1)}…` : trimmed;
}

export function makeIssue(
  code: IssueCode,
  severity: IssueSeverity,
  message: I18nString,
  howToFix: I18nString,
  loc: IssueLocation = {},
): ImportIssue {
  const issue: ImportIssue = { code, severity, path: loc.path ?? '', message, howToFix };
  if (loc.line !== undefined) issue.line = loc.line;
  if (loc.column !== undefined) issue.column = loc.column;
  if (loc.noteIndex !== undefined) issue.noteIndex = loc.noteIndex;
  if (loc.uid !== undefined) issue.uid = loc.uid;
  if (loc.suggestion !== undefined) issue.suggestion = loc.suggestion;
  if (loc.excerpt !== undefined && loc.excerpt !== '') issue.excerpt = excerptOf(loc.excerpt);
  return issue;
}

/** Collects issues; `strict` turns would-be automatic fixes into errors. */
export class IssueSink {
  readonly issues: ImportIssue[] = [];
  constructor(readonly strict: boolean) {}

  add(issue: ImportIssue): void {
    this.issues.push(issue);
  }

  error(code: IssueCode, message: I18nString, howToFix: I18nString, loc?: IssueLocation): void {
    this.add(makeIssue(code, 'error', message, howToFix, loc));
  }

  warn(code: IssueCode, message: I18nString, howToFix: I18nString, loc?: IssueLocation): void {
    this.add(makeIssue(code, 'warning', message, howToFix, loc));
  }

  info(code: IssueCode, message: I18nString, howToFix: I18nString, loc?: IssueLocation): void {
    this.add(makeIssue(code, 'info', message, howToFix, loc));
  }

  /** An automatic fix: a warning in tolerant mode, an error in strict mode. */
  fix(code: IssueCode, message: I18nString, howToFix: I18nString, loc?: IssueLocation): void {
    this.add(makeIssue(code, this.strict ? 'error' : 'warning', message, howToFix, loc));
  }

  hasErrors(): boolean {
    return this.issues.some((i) => i.severity === 'error');
  }
}

/** `notes[3].choices[1]` style path. */
export function joinPath(base: string, segments: readonly PropertyKey[]): string {
  let out = base;
  for (const seg of segments) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += out === '' ? String(seg) : `.${String(seg)}`;
  }
  return out;
}

export function notePath(index: number, ...segments: PropertyKey[]): string {
  return joinPath(`notes[${index}]`, segments);
}
