import { Check, CircleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Outcome reported by every interactive widget once the user validates. */
export interface WidgetOutcome {
  correct: boolean;
  suggestedRating: 1 | 3;
  /** Serialized answer stored in the review log. */
  answer?: string;
}

export type Status = 'correct' | 'wrong' | 'missing';

const STYLES: Record<Status, string> = {
  correct:
    'border-emerald-600 bg-emerald-50 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-100',
  wrong:
    'border-red-600 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950 dark:text-red-100',
  missing:
    'border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-100',
};

export function statusClass(status: Status | null): string {
  return status
    ? STYLES[status]
    : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900';
}

/** Icon + text label: meaning is never carried by color alone. */
export function StatusBadge({ status, label }: { status: Status; label: string }) {
  const Icon = status === 'correct' ? Check : status === 'wrong' ? X : CircleAlert;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
      <Icon aria-hidden size={16} />
      {label}
    </span>
  );
}

/** Announces the overall result to screen readers. */
export function ResultBanner({ correct }: { correct: boolean }) {
  const { t } = useTranslation();
  return (
    <p
      role="status"
      aria-live="assertive"
      className={`rounded-lg border px-3 py-2 font-semibold ${statusClass(correct ? 'correct' : 'wrong')}`}
    >
      <StatusBadge
        status={correct ? 'correct' : 'wrong'}
        label={correct ? t('grade.allCorrect') : t('grade.someWrong')}
      />
    </p>
  );
}
