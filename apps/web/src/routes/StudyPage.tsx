import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Flag, Keyboard, Undo2 } from 'lucide-react';
import type { Rating } from '@mnemo/core';
import { ratingsForButtons, summarizeSession } from '@mnemo/core';
import { getSettings, nextDueAfterNow } from '@mnemo/services';
import { useQuery, useServices } from '../app/services';
import { errorMessage } from '../app/errors';
import { PageTitle } from '../components/PageTitle';
import { Button, focusRing } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { StudyCard } from '../components/study/StudyCard';
import { decodeCustom } from '../features/study/customStudy';
import { useStudySession } from '../features/study/useStudySession';
import { useStudyShortcuts } from '../features/study/useStudyShortcuts';

const RATING_STYLE: Record<Rating, string> = {
  1: 'border-red-600 text-red-800 dark:text-red-300',
  2: 'border-amber-600 text-amber-900 dark:text-amber-200',
  3: 'border-emerald-600 text-emerald-900 dark:text-emerald-200',
  4: 'border-sky-600 text-sky-900 dark:text-sky-200',
};

function Timer({ since }: { since: number }) {
  const { clock } = useServices();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTick((x) => x + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);
  const s = Math.max(0, Math.floor((clock.now() - since) / 1000));
  return (
    <span
      className="tabular-nums text-sm text-slate-600 dark:text-slate-400"
      aria-hidden
    >{`${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`}</span>
  );
}

function Summary({ deckId }: { deckId: string }) {
  return <NextDue deckId={deckId} />;
}

function NextDue({ deckId }: { deckId: string }) {
  const { t, i18n } = useTranslation();
  const next = useQuery((ctx) => nextDueAfterNow(ctx, deckId), [deckId]);
  if (next.status !== 'success') return null;
  return (
    <p>
      {next.data === undefined
        ? t('study.noUpcoming')
        : t('study.nextDue', {
            date: new Date(next.data).toLocaleString(i18n.language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          })}
    </p>
  );
}

/** Remounts the session when the deck or the study mode changes. */
export function StudyPage() {
  const { deckId = '' } = useParams();
  const [params] = useSearchParams();
  return <StudySession key={`${deckId}?${params.toString()}`} />;
}

function StudySession() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { deckId = '' } = useParams();
  const [params] = useSearchParams();
  const custom = useMemo(() => decodeCustom(params), [params]);
  const session = useStudySession(deckId, custom, i18n.language);
  const { state } = session;
  const settings = useQuery((ctx) => getSettings(ctx), []);
  const [help, setHelp] = useState(false);
  const deckName = useQuery((ctx) => ctx.repo.decks.get(deckId), [deckId]);

  const current = state.current;
  const ratings = current ? ratingsForButtons(current.item.preset.behavior.buttons) : [];
  useStudyShortcuts({
    enabled: state.status !== 'loading' && state.status !== 'error' && !help,
    phase: current?.phase,
    interactive: current?.rendered.interactive !== undefined,
    ratings,
    onReveal: () => {
      session.reveal();
    },
    onRate: (r) => {
      void session.rate(r);
    },
    onHint: session.showHint,
    onUndo: () => {
      void session.undo();
    },
    onEdit: () => {
      if (current) void navigate(`/notes/${current.item.note.id}`);
    },
    onSuspend: () => {
      void session.suspend();
    },
    onBury: () => {
      void session.bury();
    },
    onFlag: () => {
      void session.toggleFlag();
    },
    onHelp: () => {
      setHelp(true);
    },
  });

  const title = deckName.data?.name ?? t('study.title');
  const counts = state.queue?.counts;
  const done = state.logs.length;
  const remaining = counts ? counts.new + counts.learning + counts.review : 0;

  if (state.status === 'error') return <p role="alert">{errorMessage(state.error, t)}</p>;
  if (state.status === 'loading')
    return (
      <>
        <PageTitle title={title} />
        <p aria-busy="true">{t('common.loading')}</p>
      </>
    );

  if (state.status === 'done' || state.status === 'wait') {
    const s = summarizeSession(state.logs);
    return (
      <>
        <PageTitle title={title} />
        <section
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          aria-live="polite"
        >
          <h2 className="text-xl font-semibold">
            {state.status === 'done' ? t('study.finished') : t('study.waitTitle')}
          </h2>
          {state.status === 'wait' && state.waitUntil !== undefined && (
            <p>
              {t('study.waitUntil', {
                time: new Date(state.waitUntil).toLocaleTimeString(i18n.language, {
                  timeStyle: 'short',
                }),
              })}
            </p>
          )}
          {s.reviewed > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t('study.summary.reviewed'), String(s.reviewed)],
                [
                  t('study.summary.success'),
                  s.successRate === null ? '—' : `${String(Math.round(s.successRate * 100))} %`,
                ],
                [
                  t('study.summary.time'),
                  t('study.summary.minutes', { count: Math.round(s.durationMs / 60_000) }),
                ],
                [t('study.summary.hints'), String(s.hintsUsed)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                  <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
                  <dd className="text-xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {state.status === 'done' && <Summary deckId={deckId} />}
          <div className="flex flex-wrap gap-2">
            {state.status === 'wait' && (
              <Button variant="primary" onClick={session.refresh}>
                {t('study.checkAgain')}
              </Button>
            )}
            {state.canUndo && (
              <Button
                onClick={() => {
                  void session.undo();
                }}
              >
                <Undo2 aria-hidden size={16} />
                {t('study.undo')}
              </Button>
            )}
            <Link
              to="/"
              className={`inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-4 dark:border-slate-600 ${focusRing}`}
            >
              {t('study.backToDecks')}
            </Link>
          </div>
        </section>
      </>
    );
  }

  if (!current) return null;
  const total = done + remaining;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {title}
          {state.cram && (
            <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100">
              {t('study.cram')}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {settings.data?.showTimer && <Timer since={current.shownAt} />}
          <span className="flex gap-2 text-sm font-semibold" aria-label={t('study.remaining')}>
            <span className="text-blue-700 dark:text-blue-300">
              {counts?.new}
              <span className="sr-only"> {t('decks.new')}</span>
            </span>
            <span className="text-orange-700 dark:text-orange-300">
              {counts?.learning}
              <span className="sr-only"> {t('decks.learning')}</span>
            </span>
            <span className="text-emerald-700 dark:text-emerald-300">
              {counts?.review}
              <span className="sr-only"> {t('decks.review')}</span>
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('study.undo')}
            aria-keyshortcuts="Z"
            disabled={!state.canUndo}
            onClick={() => {
              void session.undo();
            }}
          >
            <Undo2 aria-hidden size={18} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={current.item.card.flag ? t('study.unflag') : t('study.flag')}
            aria-pressed={current.item.card.flag > 0}
            aria-keyshortcuts="F"
            onClick={() => {
              void session.toggleFlag();
            }}
          >
            <Flag
              aria-hidden
              size={18}
              className={current.item.card.flag ? 'fill-red-600 text-red-600' : ''}
            />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('study.shortcuts')}
            aria-keyshortcuts="?"
            onClick={() => {
              setHelp(true);
            }}
          >
            <Keyboard aria-hidden size={18} />
          </Button>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={t('study.progress')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"
      >
        <div
          className="h-full bg-indigo-600 transition-[width]"
          style={{ width: `${String(total ? (done / total) * 100 : 0)}%` }}
        />
      </div>

      <StudyCard
        key={`${current.item.card.id}-${String(current.shownAt)}`}
        rendered={current.rendered}
        data={current.item.note.data}
        phase={current.phase}
        hintsShown={current.hints}
        onShowHint={session.showHint}
        onReveal={session.reveal}
      />

      {current.phase === 'question' && !current.rendered.interactive && (
        <Button
          variant="primary"
          size="lg"
          aria-keyshortcuts="Space"
          onClick={() => {
            session.reveal();
          }}
        >
          {t('study.showAnswer')}
        </Button>
      )}
      {current.phase === 'answer' && (
        <div className="flex flex-col gap-2">
          {current.outcome && (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t('study.suggested', { rating: t(`rating.${current.outcome.suggestedRating}`) })}
            </p>
          )}
          <div
            role="group"
            aria-label={t('study.rate')}
            className={`grid gap-2 ${ratings.length === 4 ? 'grid-cols-4' : ratings.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
          >
            {ratings.map((r) => {
              const suggested = current.outcome?.suggestedRating === r;
              return (
                <button
                  key={r}
                  type="button"
                  aria-keyshortcuts={String(r)}
                  onClick={() => {
                    void session.rate(r);
                  }}
                  className={`flex flex-col items-center rounded-xl border-2 bg-white px-2 py-2 font-semibold dark:bg-slate-900 ${RATING_STYLE[r]} ${suggested ? 'ring-4 ring-indigo-400' : ''} ${focusRing}`}
                >
                  <span>{t(`rating.${r}`)}</span>
                  <span className="text-sm font-normal">{current.item.labels[r]}</span>
                  {suggested && <span className="sr-only">{t('study.suggestedShort')}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={help} onOpenChange={setHelp} title={t('study.shortcuts')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {(['space', 'digits', 'i', 'z', 'e', 's', 'b', 'f', 'question'] as const).map((k) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-sm dark:border-slate-600">
                  {t(`shortcuts.${k}.key`)}
                </kbd>
              </dt>
              <dd>{t(`shortcuts.${k}.label`)}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}
