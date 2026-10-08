import { useTranslation } from 'react-i18next';
import { getSettings } from '@mnemo/services';
import { useQuery, useServices } from '../../app/services';

const TIPS = [
  'calm.tip0',
  'calm.tip1',
  'calm.tip2',
  'calm.tip3',
  'calm.tip4',
  'calm.tip5',
  'calm.tip6',
] as const;
const DAY_MS = 86_400_000;

const INK = '#463f35';
const CREAM = '#fffdf8';
/** Cloud bumps of the body: drawn twice (ink then cream) so only the outer outline shows. */
const BODY: readonly [number, number, number][] = [
  [35, 62, 18],
  [52, 50, 20],
  [72, 50, 20],
  [88, 62, 18],
  [60, 72, 24],
  [40, 76, 16],
  [80, 76, 16],
];

/** "Pétale", the calm theme's original mascot: a small sleepy cloud-sheep wearing a daisy. */
function Petale({ size }: { size: number }) {
  return (
    <svg aria-hidden focusable="false" width={size} height={size} viewBox="0 0 120 110">
      {[38, 52, 66, 80].map((x) => (
        <rect key={x} x={x} y="84" width="8" height="16" rx="4" fill={INK} />
      ))}
      {BODY.map(([cx, cy, r]) => (
        <circle key={`o${String(cx)}-${String(cy)}`} cx={cx} cy={cy} r={r + 2.5} fill={INK} />
      ))}
      {BODY.map(([cx, cy, r]) => (
        <circle key={`f${String(cx)}-${String(cy)}`} cx={cx} cy={cy} r={r} fill={CREAM} />
      ))}
      <ellipse
        cx="44"
        cy="58"
        rx="6"
        ry="3.5"
        transform="rotate(-25 44 58)"
        fill="#f4e6dc"
        stroke={INK}
        strokeWidth="2"
      />
      <ellipse
        cx="76"
        cy="58"
        rx="6"
        ry="3.5"
        transform="rotate(25 76 58)"
        fill="#f4e6dc"
        stroke={INK}
        strokeWidth="2"
      />
      <ellipse cx="60" cy="65" rx="15" ry="13" fill="#f4e6dc" stroke={INK} strokeWidth="2" />
      <g fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d="M51.5 62 q3 3 6 0" />
        <path d="M62.5 62 q3 3 6 0" />
        <path d="M57 70 q3 2.5 6 0" />
      </g>
      <circle cx="49" cy="68" r="3" fill="#f2b8b0" />
      <circle cx="71" cy="68" r="3" fill="#f2b8b0" />
      <g transform="translate(66 30)">
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <ellipse
            key={a}
            cx="0"
            cy="-6"
            rx="3.2"
            ry="5.6"
            transform={`rotate(${String(a)})`}
            fill="#ffffff"
            stroke={INK}
            strokeWidth="1.5"
          />
        ))}
        <circle r="3.6" fill="#f2c96b" stroke={INK} strokeWidth="1.5" />
      </g>
    </svg>
  );
}

/** The mascot and a comic-strip speech bubble; rendered only with the calm theme. */
export function Mascot({ message, className = '' }: { message: string; className?: string }) {
  const { t } = useTranslation();
  const settings = useQuery((ctx) => getSettings(ctx), []);
  const image = settings.data?.mascotImage;
  return (
    <div className={`calm:flex hidden items-end gap-3 ${className}`}>
      {image ? (
        <img
          src={image}
          alt={t('calm.mascotAlt')}
          width={88}
          height={88}
          className="calm-sketch size-22 shrink-0 object-cover"
        />
      ) : (
        <Petale size={96} />
      )}
      <p className="calm-bubble mb-8 max-w-sm px-4 py-2">{message}</p>
    </div>
  );
}

/** The mascot with a gentle tip that changes every day. */
export function DailyMascot({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { clock } = useServices();
  const tip = TIPS[Math.floor(clock.now() / DAY_MS) % TIPS.length] ?? TIPS[0];
  return <Mascot message={t(tip)} className={className} />;
}
