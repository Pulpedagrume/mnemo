import { Link, NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BarChart3, Layers, Search, Settings, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { APP_NAME } from '@mnemo/core';
import { focusRing } from '../components/ui/Button';
import { Toaster } from '../components/ui/Toaster';
import { StorageWarning } from './StorageWarning';

interface NavItem {
  to: string;
  label: 'nav.decks' | 'nav.browse' | 'nav.stats' | 'nav.presets' | 'nav.settings';
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'nav.decks', icon: Layers, end: true },
  { to: '/browse', label: 'nav.browse', icon: Search },
  { to: '/stats', label: 'nav.stats', icon: BarChart3 },
  { to: '/presets', label: 'nav.presets', icon: SlidersHorizontal },
  { to: '/settings', label: 'nav.settings', icon: Settings },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs sm:flex-row sm:gap-2 sm:text-sm ${focusRing} ${
    isActive
      ? 'bg-indigo-50 font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  }`;
}

export function AppShell() {
  const { t } = useTranslation();
  const links = NAV.map((item) => (
    <li key={item.to}>
      <NavLink to={item.to} end={item.end ?? false} className={navClass}>
        <item.icon aria-hidden size={18} />
        <span>{t(item.label)}</span>
      </NavLink>
    </li>
  ));
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-indigo-700 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
          <NavLink
            to="/"
            className={`rounded text-xl font-bold text-indigo-700 dark:text-indigo-300 ${focusRing}`}
          >
            {APP_NAME}
          </NavLink>
          <nav aria-label={t('nav.main')} className="hidden sm:block">
            <ul className="flex gap-1">{links}</ul>
          </nav>
        </div>
      </header>
      <StorageWarning />
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 pt-4 pb-8 outline-none">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-24 text-sm text-slate-600 sm:pb-6 dark:text-slate-400">
        <Link to="/legal" className={`underline ${focusRing}`}>
          {t('legal.link')}
        </Link>
      </footer>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden dark:border-slate-800 dark:bg-slate-900"
      >
        <ul className="flex justify-around py-1">{links}</ul>
      </nav>
      <Toaster />
    </div>
  );
}
