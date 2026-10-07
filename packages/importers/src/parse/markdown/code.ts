const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Tracks fenced code blocks (``` / ~~~) and `$$` math blocks, which are opaque in Mnemo
 * Markdown: nothing inside them is a field, a list item or a directive.
 */
export class CodeTracker {
  private fence: string | undefined;
  private math = false;

  inside(): boolean {
    return this.fence !== undefined || this.math;
  }

  /** The line opens a code or math block. */
  opens(line: string): boolean {
    if (FENCE.test(line)) return true;
    const t = line.trim();
    return t.startsWith('$$') && !(t.length > 4 && t.endsWith('$$'));
  }

  /** Updates the state with a line that is inside, or opens, a code/math block. */
  feed(line: string): void {
    const fence = FENCE.exec(line)?.[1];
    if (this.fence !== undefined) {
      if (fence?.startsWith(this.fence) === true) this.fence = undefined;
      return;
    }
    if (!this.math && fence !== undefined) {
      this.fence = fence.slice(0, 3);
      return;
    }
    const t = line.trim();
    const sameLine = t.length > 4 && t.startsWith('$$') && t.endsWith('$$');
    if (!sameLine && (t.startsWith('$$') || (this.math && t.endsWith('$$'))))
      this.math = !this.math;
  }
}
