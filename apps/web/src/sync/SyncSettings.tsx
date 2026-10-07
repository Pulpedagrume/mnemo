import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import { Field, inputClass } from '../components/ui/Field';
import { toast } from '../components/ui/Toaster';
import { HttpError } from './httpTransport';
import {
  connectWithSession,
  connectWithToken,
  disconnect,
  login,
  syncNow,
  useSync,
} from './syncManager';

function defaultServer(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** Settings section: connect this device to a self-hosted server and sync. */
export function SyncSettings() {
  const { t, i18n } = useTranslation();
  const { config, status, lastSync, lastReport, error } = useSync();
  const [url, setUrl] = useState(config?.url ?? defaultServer());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [needLogin, setNeedLogin] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    fn()
      .then(() => {
        if (success) toast(success, 'success');
      })
      .catch((e: unknown) => {
        if (e instanceof HttpError && e.status === 401) {
          setNeedLogin(true);
          toast(t('sync.loginNeeded'), 'info');
        } else {
          toast(t('sync.failed', { error: e instanceof HttpError ? e.code : String(e) }), 'error');
        }
      })
      .finally(() => {
        setBusy(false);
      });
  };

  if (config) {
    return (
      <div className="flex flex-col gap-3">
        <p>
          {t('sync.connected', { url: config.url })}
          {config.email && ` (${config.email})`}
        </p>
        <p aria-live="polite" className="text-sm text-slate-700 dark:text-slate-300">
          {t(`sync.status.${status}`)}
          {lastSync !== undefined &&
            ` · ${t('sync.last', { date: new Date(lastSync).toLocaleString(i18n.language) })}`}
          {lastReport &&
            ` · ${t('sync.report', { pushed: lastReport.pushed, pulled: lastReport.pulled })}`}
          {status === 'error' && error && ` · ${error}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={status === 'syncing'}
            aria-busy={status === 'syncing'}
            onClick={() => {
              void syncNow();
            }}
          >
            {t('sync.now')}
          </Button>
          <Button
            onClick={() => {
              run(disconnect, t('sync.disconnected'));
            }}
          >
            {t('sync.disconnect')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-slate-700 dark:text-slate-300">{t('sync.help')}</p>
      <Field label={t('sync.server')} help={t('sync.serverHelp')}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            type="url"
            className={inputClass}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
        )}
      </Field>
      {!needLogin ? (
        <Button
          variant="primary"
          className="self-start"
          disabled={busy || !url}
          onClick={() => {
            run(() => connectWithSession(url), t('sync.connectedToast'));
          }}
        >
          {t('sync.connect')}
        </Button>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => login(url, email, password), t('sync.connectedToast'));
          }}
        >
          <Field label={t('sync.email')}>
            {({ id }) => (
              <input
                id={id}
                type="email"
                autoComplete="username"
                className={inputClass}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label={t('sync.password')}>
            {({ id }) => (
              <input
                id={id}
                type="password"
                autoComplete="current-password"
                className={inputClass}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="self-start"
            disabled={busy || !email || !password}
          >
            {t('sync.login')}
          </Button>
        </form>
      )}
      <details>
        <summary className="cursor-pointer font-medium">{t('sync.tokenTitle')}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <Field label={t('sync.token')} help={t('sync.tokenHelp')}>
            {({ id, describedBy }) => (
              <input
                id={id}
                aria-describedby={describedBy}
                type="password"
                autoComplete="off"
                className={inputClass}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                }}
              />
            )}
          </Field>
          <Button
            className="self-start"
            disabled={busy || !url || !token}
            onClick={() => {
              run(() => connectWithToken(url, token.trim()), t('sync.connectedToast'));
            }}
          >
            {t('sync.useToken')}
          </Button>
        </div>
      </details>
    </div>
  );
}
