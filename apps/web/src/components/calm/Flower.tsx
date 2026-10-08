/** Hand-drawn style daisy of the calm theme (original drawing, decorative only). */
export const FLOWER_COLOURS = ['#f2b8c6', '#cacbe8', '#f7e3a1', '#f6cdb0', '#c5dcea'] as const;

const INK = '#463f35';

interface FlowerProps {
  size?: number;
  colour?: string;
  petals?: number;
  className?: string;
}

export function Flower({
  size = 20,
  colour = FLOWER_COLOURS[0],
  petals = 5,
  className = '',
}: FlowerProps) {
  const angles = Array.from({ length: petals }, (_, i) => (360 / petals) * i);
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      className={className}
    >
      {angles.map((a) => (
        <ellipse
          key={a}
          cx="0"
          cy="-6"
          rx="3.6"
          ry="5.6"
          transform={`rotate(${String(a)})`}
          fill={colour}
          stroke={INK}
          strokeWidth="0.9"
        />
      ))}
      <circle r="3.2" fill="#f2c96b" stroke={INK} strokeWidth="0.9" />
    </svg>
  );
}

/** A small row of flowers and leaves, shown only with the calm theme. */
export function FlowerGarland({ className = '' }: { className?: string }) {
  const sizes = [16, 22, 14, 20, 18, 24, 15, 21, 17];
  return (
    <div aria-hidden className={`calm:flex hidden items-end gap-2 ${className}`}>
      {sizes.map((size, i) => (
        <span key={i} className="flex items-end">
          <Flower
            size={size}
            colour={FLOWER_COLOURS[i % FLOWER_COLOURS.length]}
            petals={i % 3 === 0 ? 6 : 5}
          />
          {i % 2 === 0 && (
            <svg width="10" height="12" viewBox="0 0 10 12" focusable="false">
              <path
                d="M1 11 C2 5, 6 2, 9 1 C8 6, 5 10, 1 11 Z"
                fill="#b9d3b4"
                stroke={INK}
                strokeWidth="0.8"
              />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}
