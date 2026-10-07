/** Saves bytes or text as a file through a temporary link. */
export function downloadFile(content: Uint8Array | string, fileName: string, mime: string): void {
  const part = typeof content === 'string' ? content : new Uint8Array(content);
  const url = URL.createObjectURL(new Blob([part], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** File name with a local date stamp, e.g. mnemo-backup-2026-10-07.zip. */
export function datedFileName(prefix: string, ext: string, now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefix}-${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}
