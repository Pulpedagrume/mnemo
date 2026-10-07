import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createHashRouter, RouterProvider, Link } from 'react-router';
import type { ServiceContext } from '@mnemo/services';
import { getSettings } from '@mnemo/services';
import { AppShell } from './app/AppShell';
import { ServicesProvider, useQuery } from './app/services';
import { applyAppearance } from './app/theme';
import { PageTitle } from './components/PageTitle';
import { DeckListPage } from './routes/DeckListPage';

function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle title={t('notFound.title')} />
      <Link to="/" className="underline">
        {t('notFound.back')}
      </Link>
    </>
  );
}

/** Keeps theme, text size and language in sync with the stored settings. */
function SettingsSync() {
  const { i18n } = useTranslation();
  const settings = useQuery((ctx) => getSettings(ctx), []);
  const s = settings.data;
  useEffect(
    () => (s ? applyAppearance(s.theme, s.textScale) : undefined),
    [s?.theme, s?.textScale, s],
  );
  useEffect(() => {
    if (s && i18n.language !== s.locale) void i18n.changeLanguage(s.locale);
  }, [s, i18n]);
  return null;
}

function Shell() {
  return (
    <>
      <SettingsSync />
      <AppShell />
    </>
  );
}

/** Secondary screens are code-split so the deck list and study screen load first. */
/** Hash routing: works on static hosting (GitHub Pages) and offline without server rewrites. */
export function createAppRouter() {
  return createHashRouter([
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <DeckListPage /> },
        {
          path: 'study/:deckId',
          lazy: async () => ({ Component: (await import('./routes/StudyPage')).StudyPage }),
        },
        {
          path: 'browse',
          lazy: async () => ({ Component: (await import('./routes/BrowsePage')).BrowsePage }),
        },
        {
          path: 'notes/new',
          lazy: async () => ({ Component: (await import('./routes/NoteEditPage')).NoteEditPage }),
        },
        {
          path: 'notes/:id',
          lazy: async () => ({ Component: (await import('./routes/NoteEditPage')).NoteEditPage }),
        },
        {
          path: 'presets',
          lazy: async () => ({ Component: (await import('./routes/PresetsPage')).PresetsPage }),
        },
        {
          path: 'stats',
          lazy: async () => ({ Component: (await import('./routes/StatsPage')).StatsPage }),
        },
        {
          path: 'settings',
          lazy: async () => ({ Component: (await import('./routes/SettingsPage')).SettingsPage }),
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ]);
}

export function App({
  ctx,
  router = createAppRouter(),
}: {
  ctx: ServiceContext;
  router?: ReturnType<typeof createAppRouter>;
}) {
  return (
    <ServicesProvider value={ctx}>
      <RouterProvider router={router} />
    </ServicesProvider>
  );
}
