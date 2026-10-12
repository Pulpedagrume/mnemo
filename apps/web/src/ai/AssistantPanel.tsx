import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Id } from '@mnemo/core';
import { resolveLocale } from '@mnemo/core';
import type { ChatMessage } from '@mnemo/services';
import { buildAssistantMessages, gatherAssistantContext, getSettings } from '@mnemo/services';
import { useQuery, useServices } from '../app/services';
import { Markdown } from '../components/Markdown';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { inputClass } from '../components/ui/Field';
import {
  ask,
  isModelDownloaded,
  loadModel,
  stopAnswer,
  useAiStatus,
  webGpuAvailable,
} from './engine';
import { AI_MODELS } from './models';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: Id;
  /** The card being studied, sent as the main context. */
  noteId?: Id;
}

/** Megabytes as a short human size ("1,1 Go", "450 Mo"). */
function size(mb: number, locale: string): string {
  return mb >= 1000
    ? `${(mb / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} ${locale.startsWith('fr') ? 'Go' : 'GB'}`
    : `${String(mb)} ${locale.startsWith('fr') ? 'Mo' : 'MB'}`;
}

/** Chat with the in-browser model about the current card and its deck. */
export function AssistantPanel({ open, onOpenChange, deckId, noteId }: Props) {
  const { t, i18n } = useTranslation();
  const ctx = useServices();
  const id = useId();
  const settings = useQuery((c) => getSettings(c), []);
  const model = settings.data?.aiModel ?? 'standard';
  const status = useAiStatus((s) => s.status);
  const gpu = useQuery(() => webGpuAvailable(), []);
  const cached = useQuery(() => isModelDownloaded(model), [model, status.kind]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [partial, setPartial] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // A model already in the browser cache is loaded as soon as the panel opens.
  const autoLoad = open && cached.data === true && status.kind === 'idle';
  useEffect(() => {
    if (autoLoad) void loadModel(model);
  }, [autoLoad, model]);

  const answering = partial !== null;
  const send = async () => {
    const question = input.trim();
    if (!question || answering) return;
    setInput('');
    setFailed(false);
    setPartial('');
    try {
      const gathered = await gatherAssistantContext(ctx, {
        deckId,
        question,
        ...(noteId ? { noteId } : {}),
      });
      const messages = buildAssistantMessages({
        locale: resolveLocale(i18n.language),
        ...gathered,
        history,
        question,
      });
      const answer = await ask(messages, setPartial);
      setHistory((h) => [
        ...h,
        { role: 'user', content: question },
        { role: 'assistant', content: answer || '…' },
      ]);
    } catch {
      setFailed(true);
      setInput(question);
    } finally {
      setPartial(null);
    }
  };

  const info = AI_MODELS[model];
  let body;
  if (gpu.data === false) {
    body = <p>{t('assistant.unsupported')}</p>;
  } else if (status.kind === 'loading') {
    const percent = Math.round(status.progress * 100);
    body = (
      <div className="flex flex-col gap-2">
        <p>{cached.data ? t('assistant.loading') : t('assistant.downloading')}</p>
        <div
          role="progressbar"
          aria-label={t('assistant.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div className="h-full bg-indigo-600" style={{ width: `${String(percent)}%` }} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">{`${String(percent)} %`}</p>
      </div>
    );
  } else if (status.kind === 'error') {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">{t('assistant.loadError')}</p>
        <Button onClick={() => void loadModel(model)}>{t('assistant.retry')}</Button>
      </div>
    );
  } else if (status.kind !== 'ready') {
    body =
      cached.data === false ? (
        <div className="flex flex-col items-start gap-3">
          <p>
            {t('assistant.consent', {
              size: size(info.downloadMB, i18n.language),
              memory: size(info.memoryMB, i18n.language),
            })}
          </p>
          <Button variant="primary" onClick={() => void loadModel(model)}>
            {t('assistant.download', { size: size(info.downloadMB, i18n.language) })}
          </Button>
        </div>
      ) : (
        <p aria-busy="true">{t('common.loading')}</p>
      );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div
          role="log"
          aria-label={t('assistant.conversation')}
          aria-busy={answering}
          className="flex max-h-[50dvh] flex-col gap-3 overflow-y-auto"
        >
          {history.length === 0 && !answering && (
            <p className="text-slate-600 dark:text-slate-400">{t('assistant.empty')}</p>
          )}
          {history.map((m, i) =>
            m.role === 'user' ? (
              <p
                key={i}
                className="self-end rounded-xl bg-indigo-50 px-3 py-2 text-slate-900 dark:bg-indigo-950 dark:text-slate-100"
              >
                <span className="sr-only">{t('assistant.you')} : </span>
                {m.content}
              </p>
            ) : (
              <div
                key={i}
                className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"
              >
                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {t('assistant.aiLabel')}
                </span>
                <Markdown source={m.content} />
              </div>
            ),
          )}
          {answering && (
            <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700">
              <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                {t('assistant.aiLabel')}
              </span>
              {partial ? <Markdown source={partial} /> : <p>{t('assistant.thinking')}</p>}
            </div>
          )}
        </div>
        {failed && <p role="alert">{t('assistant.askError')}</p>}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={`${id}-q`} className="font-medium">
            {t('assistant.question')}
          </label>
          <textarea
            id={`${id}-q`}
            rows={2}
            className={inputClass}
            value={input}
            placeholder={t('assistant.placeholder')}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            {answering ? (
              <Button onClick={stopAnswer}>{t('assistant.stop')}</Button>
            ) : (
              <Button type="submit" variant="primary" disabled={!input.trim()}>
                {t('assistant.send')}
              </Button>
            )}
            {history.length > 0 && !answering && (
              <Button
                variant="ghost"
                onClick={() => {
                  setHistory([]);
                }}
              >
                {t('assistant.reset')}
              </Button>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t('assistant.title')}
      description={t('assistant.disclaimer')}
    >
      {body}
    </Dialog>
  );
}
