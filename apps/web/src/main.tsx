import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveLocale, seededRng, systemClock } from '@mnemo/core';
import { createServiceContext, ensureCollection, updateSettings } from '@mnemo/services';
import { DB_NAME } from '@mnemo/storage';
import { createDexieRepository } from '@mnemo/storage/dexie';
import { initI18n } from './i18n';
import { App } from './App';
import { ReloadPrompt } from './app/ReloadPrompt';
import 'katex/dist/katex.min.css';
import './index.css';

async function bootstrap(): Promise<void> {
  const repo = createDexieRepository({ name: DB_NAME });
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const ctx = createServiceContext({
    repo,
    clock: systemClock,
    rng: seededRng(seed),
    deviceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  // First launch: adopt the browser language, then keep the user's choice.
  const stored = await repo.settings.get('locale');
  const locale = resolveLocale(
    typeof stored?.value === 'string' ? stored.value : navigator.language,
  );
  if (!stored) await updateSettings(ctx, { locale });
  initI18n(locale);
  await ensureCollection(ctx, locale);

  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  createRoot(root).render(
    <StrictMode>
      <App ctx={ctx} />
      <ReloadPrompt />
    </StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  const root = document.getElementById('root');
  if (root)
    root.textContent = `Startup error: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
});
