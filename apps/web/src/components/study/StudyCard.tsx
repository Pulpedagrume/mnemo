import { useTranslation } from 'react-i18next';
import type { NoteData, RenderedCard } from '@mnemo/core';
import { Markdown } from '../Markdown';
import { HintButton } from './HintButton';
import type { WidgetOutcome } from './widgets/common';
import { ListWidget } from './widgets/ListWidget';
import { MatchingWidget } from './widgets/MatchingWidget';
import { McqWidget } from './widgets/McqWidget';
import { OrderingWidget } from './widgets/OrderingWidget';
import { TrueFalseWidget } from './widgets/TrueFalseWidget';
import { TypedWidget } from './widgets/TypedWidget';

export type CardPhase = 'question' | 'answer';

interface StudyCardProps {
  rendered: RenderedCard;
  data: NoteData | undefined;
  phase: CardPhase;
  hintsShown: number;
  onShowHint: () => void;
  /** Called when the answer is revealed; interactive cards pass their automatic grading. */
  onReveal: (outcome?: WidgetOutcome) => void;
}

/** Interactive part of a card (MCQ, matching…), or null for flip cards. */
function Interaction({
  rendered,
  data,
  onReveal,
}: Pick<StudyCardProps, 'rendered' | 'data' | 'onReveal'>) {
  const p = rendered.interactive;
  if (!p || !data) return null;
  if (p.kind === 'mcq' && data.kind === 'mcq')
    return (
      <McqWidget
        choices={data.choices}
        display={p.choices}
        multiple={p.multiple}
        onValidate={onReveal}
      />
    );
  if (p.kind === 'truefalse' && data.kind === 'truefalse')
    return <TrueFalseWidget answer={data.answer} onValidate={onReveal} />;
  if (p.kind === 'matching' && data.kind === 'matching')
    return (
      <MatchingWidget pairs={data.pairs} left={p.left} right={p.right} onValidate={onReveal} />
    );
  if (p.kind === 'ordering' && data.kind === 'ordering')
    return <OrderingWidget steps={data.steps} initial={p.steps} onValidate={onReveal} />;
  if (p.kind === 'typed' && data.kind === 'typed')
    return (
      <TypedWidget
        answers={data.answers}
        caseSensitive={p.caseSensitive}
        ignoreAccents={p.ignoreAccents}
        onValidate={onReveal}
      />
    );
  if (p.kind === 'list' && data.kind === 'list')
    return (
      <ListWidget
        items={data.items}
        ordered={p.ordered}
        onValidate={onReveal}
        onReveal={() => {
          onReveal();
        }}
      />
    );
  return null;
}

/**
 * Displays one card exactly as during study: question, hints, interaction, then the answer
 * with extra and explanation. Used by the study screen and by previews (editor, import).
 */
export function StudyCard({
  rendered,
  data,
  phase,
  hintsShown,
  onShowHint,
  onReveal,
}: StudyCardProps) {
  const { t } = useTranslation();
  const interactive = rendered.interactive !== undefined;
  const showBack = phase === 'answer' && !interactive;
  return (
    <article
      aria-label={phase === 'answer' ? t('study.answerSide') : t('study.questionSide')}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-lg shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <Markdown source={showBack ? rendered.back : rendered.front} />
      {phase === 'question' && (
        <HintButton hints={rendered.hints} shown={hintsShown} onShowNext={onShowHint} />
      )}
      <Interaction rendered={rendered} data={data} onReveal={onReveal} />
      {phase === 'answer' && (rendered.extra || rendered.explanation) && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 text-base dark:border-slate-700">
          {rendered.extra && <Markdown source={rendered.extra} />}
          {rendered.explanation && (
            <section aria-label={t('study.explanation')}>
              <h3 className="text-sm font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
                {t('study.explanation')}
              </h3>
              <Markdown source={rendered.explanation} />
            </section>
          )}
        </div>
      )}
    </article>
  );
}
