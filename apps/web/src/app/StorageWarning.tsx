import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DAY_MS } from '@mnemo/core';
import { getSettings } from '@mnemo/services';
import { useQuery, useServices } from './services';

const DISMISS_KEY = 'mnemo.storageWarningDismissed';

/** Asks for persistent storage once; reports whether the browser may evict our data. */
function usePersistence(): 'unknown' | 'persisted' | 'best-effort' {
  const [state, setState] = useState<'unknown' | 'persisted' | 'best-effort'>('unknown');
  useEffect(() => {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage?.persisted) return;
    void (async () => {
      let persisted = await storage.persisted();
      if (!persisted && typeof storage.persist === 'function') persisted = await storage.persist();
      setState(persisted ? 'persisted' : 'best-effort');
    })();
  }, []);
  return state;
}

/**
 * Banner shown when the browser may erase local data (e.g. Safari without persistent storage)
 * or when the last backup is older than the configured reminder.
 */
export function StorageWarning() {
  const { t } = useTranslation();
  const { clock } = useServices();
  const persistence = usePersistence();
  const settings = useQuery((ctx) => getSettings(ctx), []);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || settings.status !== 'success') return null;

  const s = settings.data;
  const backupDue =
    s.backupReminderDays > 0 &&
    s.lastBackupAt !== undefined &&
    clock.now() - s.lastBackupAt > s.backupReminderDays * DAY_MS;
  const message =
    persistence === 'best-effort'
      ? t('storage.mayBeErased')
      : backupDue
        ? t('storage.backupReminder', { days: s.backupReminderDays })
        : null;
  if (!message) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <p className="flex-1">{message}</p>
        <Link to="/settings#backup" className="font-semibold underline">
          {t('storage.backupNow')}
        </Link>
        <button
          type="button"
          className="underline"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, '1');
            } catch {
              // Storage unavailable: the banner just comes back next time.
            }
            setDismissed(true);
          }}
        >
          {t('common.dismiss')}
        </button>
      </div>
    </div>
  );
}
