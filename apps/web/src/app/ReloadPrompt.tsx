import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui/Button';

/**
 * Offers to reload when a new version is ready. Never reloads by itself, so an ongoing study
 * session is not interrupted.
 */
export function ReloadPrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-20 z-50 flex max-w-sm flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:bottom-4 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <p>{needRefresh ? t('pwa.updateAvailable') : t('pwa.offlineReady')}</p>
      <div className="flex justify-end gap-2">
        {needRefresh && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void updateServiceWorker(true);
            }}
          >
            {t('pwa.reload')}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
