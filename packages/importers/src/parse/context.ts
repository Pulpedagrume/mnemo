import type { IssueLocation, IssueSink } from './issue';
import { notePath } from './issue';

/** Where a note comes from, for issue locations. */
export class NoteCtx {
  private readonly startIssue: number;
  constructor(
    readonly sink: IssueSink,
    readonly index: number,
    readonly line?: number,
    readonly excerpt?: string,
    public uid?: string,
  ) {
    this.startIssue = sink.issues.length;
  }

  loc(path: readonly PropertyKey[] = [], extra: IssueLocation = {}): IssueLocation {
    const loc: IssueLocation = { path: notePath(this.index, ...path), noteIndex: this.index };
    if (this.line !== undefined) loc.line = this.line;
    if (this.uid !== undefined) loc.uid = this.uid;
    if (this.excerpt !== undefined) loc.excerpt = this.excerpt;
    return { ...loc, ...extra };
  }

  /** True when an error was reported for this note since the context was created. */
  hasErrors(): boolean {
    for (let i = this.startIssue; i < this.sink.issues.length; i++) {
      if (this.sink.issues[i]?.severity === 'error') return true;
    }
    return false;
  }
}
