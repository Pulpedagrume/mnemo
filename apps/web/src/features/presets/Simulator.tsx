import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Preset, SimulationResult } from '@mnemo/core';
import { Button } from '../../components/ui/Button';
import { Field, inputClass } from '../../components/ui/Field';
import { ChartFrame, Legend, LineChart } from '../../components/charts/Charts';
import { runSimulations } from './simulate';

interface Props {
  preset: Preset;
  presets: readonly Preset[];
}

/** Workload simulator: daily reviews over a horizon, optionally compared with another preset. */
export function Simulator({ preset, presets }: Props) {
  const { t } = useTranslation();
  const [days, setDays] = useState(90);
  const [newPerDay, setNewPerDay] = useState(preset.limits.newPerDay);
  const [retention, setRetention] = useState(0.9);
  const [seed, setSeed] = useState(42);
  const [compareId, setCompareId] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ labels: string[]; data: SimulationResult[] } | null>(
    null,
  );
  const [error, setError] = useState<string>();

  const run = () => {
    const chosen = [preset, ...presets.filter((p) => p.id === compareId && p.id !== preset.id)];
    setRunning(true);
    setError(undefined);
    runSimulations(
      chosen.map((p) => ({
        scheduler: p.algorithm,
        params: p.params,
        days,
        newPerDay,
        reviewsPerDay: p.limits.reviewsPerDay,
        retention,
        seed,
      })),
    )
      .then((data) => {
        setResults({ labels: chosen.map((p) => p.name), data });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setRunning(false);
      });
  };

  const dayLabels = results?.data[0]?.days.map((d) => String(d.day + 1)) ?? [];
  return (
    <section
      aria-labelledby="sim-title"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id="sim-title" className="text-lg font-semibold">
        {t('sim.title')}
      </h2>
      <p className="text-sm text-slate-700 dark:text-slate-300">{t('sim.help')}</p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label={t('sim.days')}>
          {({ id }) => (
            <select
              id={id}
              className={inputClass}
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
              }}
            >
              {[30, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('sim.newPerDay')}>
          {({ id }) => (
            <input
              id={id}
              type="number"
              min={0}
              max={500}
              className={inputClass}
              value={newPerDay}
              onChange={(e) => {
                setNewPerDay(Math.max(0, Number(e.target.value) || 0));
              }}
            />
          )}
        </Field>
        <Field label={t('sim.retention')}>
          {({ id }) => (
            <input
              id={id}
              type="number"
              min={0.5}
              max={0.99}
              step={0.01}
              className={inputClass}
              value={retention}
              onChange={(e) => {
                setRetention(Math.min(0.99, Math.max(0.5, Number(e.target.value) || 0.9)));
              }}
            />
          )}
        </Field>
        <Field label={t('sim.seed')}>
          {({ id }) => (
            <input
              id={id}
              type="number"
              className={inputClass}
              value={seed}
              onChange={(e) => {
                setSeed(Math.trunc(Number(e.target.value) || 0));
              }}
            />
          )}
        </Field>
        <Field label={t('sim.compare')}>
          {({ id }) => (
            <select
              id={id}
              className={inputClass}
              value={compareId}
              onChange={(e) => {
                setCompareId(e.target.value);
              }}
            >
              <option value="">{t('sim.noCompare')}</option>
              {presets
                .filter((p) => p.id !== preset.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
      </div>
      <Button
        variant="primary"
        className="self-start"
        onClick={run}
        disabled={running}
        aria-busy={running}
      >
        {running ? t('sim.running') : t('sim.run')}
      </Button>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {results && (
        <>
          <dl className="grid gap-2 sm:grid-cols-2" aria-live="polite">
            {results.data.map((r, i) => (
              <div
                key={results.labels[i]}
                className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800"
              >
                <dt className="font-semibold">{results.labels[i]}</dt>
                <dd>
                  {t('sim.average', {
                    reviews: Math.round(r.avgReviewsPerDay),
                    minutes: Math.round(
                      r.days.reduce((s, d) => s + d.minutes, 0) / Math.max(1, r.days.length),
                    ),
                  })}
                </dd>
              </div>
            ))}
          </dl>
          <ChartFrame
            title={t('sim.chartTitle')}
            summary={t('sim.chartSummary', { seed })}
            legend={<Legend items={results.labels} />}
            table={{
              headers: [t('sim.day'), ...results.labels],
              rows: dayLabels.map((d, i) => [
                d,
                ...results.data.map((r) => r.days[i]?.reviews ?? 0),
              ]),
            }}
          >
            <LineChart
              labels={dayLabels}
              series={results.data.map((r, i) => ({
                label: results.labels[i] ?? '',
                values: r.days.map((d) => d.reviews),
              }))}
            />
          </ChartFrame>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {t('sim.seedNote', { seed })}
          </p>
        </>
      )}
    </section>
  );
}
