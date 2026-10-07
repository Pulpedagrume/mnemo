import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';

/** Palette distinguishable by color-blind users; series are also distinguished by dash/shape. */
export const SERIES_COLORS = ['#4f46e5', '#d97706', '#059669', '#db2777'] as const;
const DASHES = ['', '6 4', '2 3', '10 3 2 3'] as const;

export interface Series {
  label: string;
  values: number[];
}

interface ChartFrameProps {
  title: string;
  /** Short textual summary read by screen readers. */
  summary: string;
  table: { headers: string[]; rows: (string | number)[][] };
  children: ReactNode;
  legend?: ReactNode;
}

/** Card with a chart and a toggle to show the same data as an accessible table. */
export function ChartFrame({ title, summary, table, children, legend }: ChartFrameProps) {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure
      aria-labelledby={`${id}-t`}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id={`${id}-t`} className="font-semibold">
          {title}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={asTable}
          onClick={() => {
            setAsTable((v) => !v);
          }}
        >
          {asTable ? t('charts.showChart') : t('charts.showTable')}
        </Button>
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      {asTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {table.headers.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-slate-300 px-2 py-1 text-left dark:border-slate-700"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className="border-b border-slate-100 px-2 py-1 tabular-nums dark:border-slate-800"
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div aria-hidden>{children}</div>
          {legend}
        </>
      )}
    </figure>
  );
}

const W = 600;
const H = 200;
const PAD = { l: 36, r: 8, t: 8, b: 22 };

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

function Axes({ max, labels }: { max: number; labels: string[] }) {
  const ticks = [0, max / 2, max];
  const step = Math.max(1, Math.ceil(labels.length / 8));
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * (i + 0.5)) / labels.length;
  return (
    <g className="fill-slate-600 text-[11px] dark:fill-slate-400">
      {ticks.map((v) => {
        const y = PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
        return (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y}
              y2={y}
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <text x={PAD.l - 4} y={y + 4} textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        i % step === 0 ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
    </g>
  );
}

export function BarChart({
  values,
  labels,
  color = SERIES_COLORS[0],
}: {
  values: number[];
  labels: string[];
  color?: string;
}) {
  const max = niceMax(Math.max(0, ...values));
  const bw = (W - PAD.l - PAD.r) / Math.max(1, values.length);
  return (
    <svg viewBox={`0 0 ${String(W)} ${String(H)}`} className="h-auto w-full">
      <Axes max={max} labels={labels} />
      {values.map((v, i) => {
        const h = ((H - PAD.t - PAD.b) * v) / max;
        return (
          <rect
            key={i}
            x={PAD.l + i * bw + bw * 0.15}
            y={H - PAD.b - h}
            width={bw * 0.7}
            height={h}
            fill={color}
            rx={2}
          />
        );
      })}
    </svg>
  );
}

export function LineChart({ series, labels }: { series: Series[]; labels: string[] }) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = Math.max(1, labels.length);
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * (i + 0.5)) / n;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${String(W)} ${String(H)}`} className="h-auto w-full">
      <Axes max={max} labels={labels} />
      {series.map((s, si) => (
        <polyline
          key={s.label}
          fill="none"
          stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
          strokeWidth={2}
          strokeDasharray={DASHES[si % DASHES.length]}
          points={s.values.map((v, i) => `${String(x(i))},${String(y(v))}`).join(' ')}
        />
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-sm">
      {items.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <svg width="28" height="8" aria-hidden>
            <line
              x1="0"
              x2="28"
              y1="4"
              y2="4"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth="3"
              strokeDasharray={DASHES[i % DASHES.length]}
            />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Calendar heatmap: one column per week, one cell per day; intensity in 5 steps. */
export function Heatmap({
  days,
  today,
  weeks = 26,
  valueOf,
}: {
  days: Map<number, number>;
  today: number;
  weeks?: number;
  valueOf?: (v: number) => string;
}) {
  const cell = 12;
  const start = today - weeks * 7 + 1;
  const max = Math.max(1, ...days.values());
  const level = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const fills = [
    'fill-slate-200 dark:fill-slate-800',
    'fill-indigo-200 dark:fill-indigo-900',
    'fill-indigo-400 dark:fill-indigo-700',
    'fill-indigo-600 dark:fill-indigo-500',
    'fill-indigo-800 dark:fill-indigo-300',
  ];
  const cells = [];
  for (let d = start; d <= today; d++) {
    const i = d - start;
    const v = days.get(d) ?? 0;
    cells.push(
      <rect
        key={d}
        x={Math.floor(i / 7) * (cell + 2)}
        y={(i % 7) * (cell + 2)}
        width={cell}
        height={cell}
        rx={2}
        className={fills[level(v)]}
      >
        <title>{valueOf ? valueOf(v) : String(v)}</title>
      </rect>,
    );
  }
  return (
    <svg
      viewBox={`0 0 ${String(weeks * (cell + 2))} ${String(7 * (cell + 2))}`}
      className="h-auto w-full"
    >
      {cells}
    </svg>
  );
}
