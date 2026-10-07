import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { DAY_MS } from '@mnemo/core';
import { activityCsv, listDecks, statsSummary } from '@mnemo/services';
import { useQuery, useServices } from '../app/services';
import { PageTitle } from '../components/PageTitle';
import { Button, focusRing } from '../components/ui/Button';
import { inputClass } from '../components/ui/Field';
import { BarChart, ChartFrame, Heatmap } from '../components/charts/Charts';
import { datedFileName, downloadFile } from '../lib/download';

const pct = (rate: number | null) => (rate === null ? '—' : `${String(Math.round(rate * 100))} %`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <dt className="text-sm text-slate-600 dark:text-slate-400">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function StatsPage() {
  const { t, i18n } = useTranslation();
  const ctx = useServices();
  const [params, setParams] = useSearchParams();
  const deckId = params.get('deck') ?? undefined;
  const decks = useQuery((c) => listDecks(c), []);
  const stats = useQuery((c) => statsSummary(c, deckId), [deckId]);
  const minutes = (ms: number) => t('stats.minutes', { count: Math.round(ms / 60_000) });
  const dayLabel = (day: number) =>
    new Date(day * DAY_MS).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <>
      <PageTitle
        title={t('stats.title')}
        actions={
          stats.data && (
            <Button
              onClick={() => {
                downloadFile(
                  activityCsv(stats.data),
                  datedFileName('activity', 'csv', ctx.clock.now()),
                  'text/csv',
                );
              }}
            >
              {t('stats.exportCsv')}
            </Button>
          )
        }
      />
      <select
        aria-label={t('stats.scope')}
        className={`${inputClass} mb-4 sm:w-80`}
        value={deckId ?? ''}
        onChange={(e) => {
          setParams(e.target.value ? { deck: e.target.value } : {});
        }}
      >
        <option value="">{t('stats.allDecks')}</option>
        {(decks.data ?? [])
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
      </select>
      {stats.status !== 'success' ? (
        <p aria-busy="true">{t('common.loading')}</p>
      ) : (
        (() => {
          const s = stats.data;
          const activity = new Map(s.activity.map((a) => [a.day, a.reviews] as const));
          const forecastLabels = s.forecast.map((_, i) =>
            i === 0 ? t('stats.today') : `+${String(i)}`,
          );
          const states = (['new', 'learning', 'review', 'relearning', 'suspended'] as const).map(
            (k) => [t(`cardState.${k}`), s.states[k]] as const,
          );
          const intervalLabels = s.intervals.map((b) =>
            b.upTo === null ? t('stats.more') : `≤ ${String(b.upTo)} ${t('stats.daysShort')}`,
          );
          return (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('stats.streak')} value={t('stats.days', { count: s.streak })} />
                <Stat label={t('stats.timeToday')} value={minutes(s.time.todayMs)} />
                <Stat label={t('stats.retentionMonth')} value={pct(s.retention.month.rate)} />
                <Stat label={t('stats.totalCards')} value={String(s.totalCards)} />
              </dl>
              <ChartFrame
                title={t('stats.activity')}
                summary={t('stats.activitySummary', {
                  count: s.activity.reduce((a, b) => a + b.reviews, 0),
                })}
                table={{
                  headers: [t('stats.date'), t('stats.reviews')],
                  rows: s.activity.map((a) => [dayLabel(a.day), a.reviews]),
                }}
              >
                <Heatmap
                  days={activity}
                  today={s.today}
                  valueOf={(v) => t('stats.reviewsCount', { count: v })}
                />
              </ChartFrame>
              <ChartFrame
                title={t('stats.forecast')}
                summary={t('stats.forecastSummary', {
                  count: s.forecast.reduce((a, b) => a + b, 0),
                })}
                table={{
                  headers: [t('stats.day'), t('stats.cardsDue')],
                  rows: s.forecast.map((v, i) => [forecastLabels[i] ?? '', v]),
                }}
              >
                <BarChart values={s.forecast} labels={forecastLabels} />
              </ChartFrame>
              <div className="grid gap-4 md:grid-cols-2">
                <ChartFrame
                  title={t('stats.states')}
                  summary={states.map(([l, v]) => `${l} ${String(v)}`).join(', ')}
                  table={{
                    headers: [t('stats.state'), t('stats.cards')],
                    rows: states.map(([l, v]) => [l, v]),
                  }}
                >
                  <BarChart
                    values={states.map(([, v]) => v)}
                    labels={states.map(([l]) => l)}
                    color="#059669"
                  />
                </ChartFrame>
                <ChartFrame
                  title={t('stats.intervals')}
                  summary={t('stats.intervalsSummary')}
                  table={{
                    headers: [t('stats.interval'), t('stats.cards')],
                    rows: s.intervals.map((b, i) => [intervalLabels[i] ?? '', b.count]),
                  }}
                >
                  <BarChart
                    values={s.intervals.map((b) => b.count)}
                    labels={intervalLabels}
                    color="#d97706"
                  />
                </ChartFrame>
              </div>
              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-2 font-semibold">{t('stats.retention')}</h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className="text-left">
                          {t('stats.period')}
                        </th>
                        <th scope="col" className="text-right">
                          {t('stats.reviews')}
                        </th>
                        <th scope="col" className="text-right">
                          {t('stats.rate')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['week', 'month', 'year'] as const).map((p) => (
                        <tr key={p}>
                          <th scope="row" className="text-left font-normal">
                            {t(`stats.periods.${p}`)}
                          </th>
                          <td className="text-right tabular-nums">{s.retention[p].total}</td>
                          <td className="text-right tabular-nums">{pct(s.retention[p].rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-2 font-semibold">{t('stats.buttons')}</h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th scope="col" className="text-left">
                          {t('stats.bucket')}
                        </th>
                        {([1, 2, 3, 4] as const).map((r) => (
                          <th key={r} scope="col" className="text-right">
                            {t(`rating.${r}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(['learning', 'young', 'mature'] as const).map((b) => (
                        <tr key={b}>
                          <th scope="row" className="text-left font-normal">
                            {t(`stats.buckets.${b}`)}
                          </th>
                          {([1, 2, 3, 4] as const).map((r) => (
                            <td key={r} className="text-right tabular-nums">
                              {s.buttons[b][r]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-2 font-semibold">{t('stats.time')}</h2>
                  <p>{t('stats.timeWeek', { time: minutes(s.time.weekMs) })}</p>
                  <p>{t('stats.timeMonth', { time: minutes(s.time.monthMs) })}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="mb-2 font-semibold">{t('stats.hints')}</h2>
                  <p>{t('stats.hintsUsed', { count: s.hints.withHint, total: s.hints.reviews })}</p>
                  <p>
                    {t('stats.hintsPass', {
                      with: pct(s.hints.passRateWithHint),
                      without: pct(s.hints.passRateWithoutHint),
                    })}
                  </p>
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-2 font-semibold">
                  {t('stats.leeches', { count: s.leeches.length })}
                </h2>
                {s.leeches.length === 0 ? (
                  <p className="text-slate-600 dark:text-slate-400">{t('stats.noLeeches')}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {s.leeches.slice(0, 50).map((l) => (
                      <li key={l.cardId}>
                        <Link
                          to={`/notes/${l.noteId}`}
                          className={`rounded underline ${focusRing}`}
                        >
                          {t('stats.leechItem', { count: l.lapses })}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          );
        })()
      )}
    </>
  );
}
