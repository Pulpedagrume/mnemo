import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { Markdown } from '../Markdown';

interface HintButtonProps {
  hints: readonly string[];
  shown: number;
  onShowNext: () => void;
}

/**
 * Light-bulb button revealing hints one by one, from the most subtle to the most explicit.
 * The number of hints opened is recorded in the review log.
 */
export function HintButton({ hints, shown, onShowNext }: HintButtonProps) {
  const { t } = useTranslation();
  if (hints.length === 0) return null;
  const remaining = hints.length - shown;
  return (
    <div className="flex flex-col gap-2">
      {remaining > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-amber-800 dark:text-amber-300"
          onClick={onShowNext}
          aria-label={t('study.showHint')}
          aria-keyshortcuts="I"
        >
          <Lightbulb aria-hidden size={18} />
          <span>{shown === 0 ? t('study.hint') : t('study.nextHint', { count: remaining })}</span>
        </Button>
      )}
      {shown > 0 && (
        <ol aria-live="polite" className="flex flex-col gap-1">
          {hints.slice(0, shown).map((hint, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            >
              <Lightbulb aria-hidden size={16} className="mt-1 shrink-0" />
              <span className="sr-only">{t('study.hintNumber', { n: i + 1 })}</span>
              <Markdown source={hint} inline />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
