import type { Theme } from '@mnemo/core';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Applies light/dark/system theme and text scale to <html>. Returns a cleanup for `system`. */
export function applyAppearance(theme: Theme, textScale: number): () => void {
  const root = document.documentElement;
  root.style.fontSize = `${Math.round(textScale * 100)}%`;
  const update = () => {
    const dark = theme === 'dark' || (theme === 'system' && media().matches);
    root.classList.toggle('dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
  };
  update();
  if (theme !== 'system') return () => undefined;
  const mq = media();
  mq.addEventListener('change', update);
  return () => {
    mq.removeEventListener('change', update);
  };
}
