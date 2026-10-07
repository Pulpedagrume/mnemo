import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteContent, NoteType, Problem } from '@mnemo/core';
import {
  FIELD,
  generateCardOrds,
  getField,
  parseCloze,
  renderCard,
  resolveLocale,
} from '@mnemo/core';
import { Button } from '../ui/Button';
import { StudyCard, type CardPhase } from './StudyCard';

interface Props {
  note: NoteContent;
  noteType: NoteType;
}

function problemsOf(note: NoteContent, noteType: NoteType): Problem[] {
  return noteType.renderer === 'cloze'
    ? parseCloze(getField(note.fields, FIELD.text)).problems
    : [];
}

/** One generated card, playable exactly like in study mode. */
function PreviewCard({ note, noteType, ord, index }: Props & { ord: number; index: number }) {
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<CardPhase>('question');
  const [hints, setHints] = useState(0);
  const [nonce, setNonce] = useState(0);
  const rendered = useMemo(() => {
    try {
      return renderCard(note, noteType, ord, { locale: resolveLocale(i18n.language) });
    } catch {
      return null;
    }
  }, [note, noteType, ord, i18n.language]);
  if (!rendered) return null;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold">{t('editor.cardN', { n: index + 1 })}</h4>
        <div className="flex gap-2">
          {phase === 'question' && !rendered.interactive && (
            <Button
              size="sm"
              onClick={() => {
                setPhase('answer');
              }}
            >
              {t('study.showAnswer')}
            </Button>
          )}
          {(phase === 'answer' || hints > 0) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPhase('question');
                setHints(0);
                setNonce((n) => n + 1);
              }}
            >
              {t('editor.resetPreview')}
            </Button>
          )}
        </div>
      </div>
      <StudyCard
        key={nonce}
        rendered={rendered}
        data={note.data}
        phase={phase}
        hintsShown={hints}
        onShowHint={() => {
          setHints((h) => h + 1);
        }}
        onReveal={() => {
          setPhase('answer');
        }}
      />
    </li>
  );
}

/** Live preview of every card a note generates, plus content problems (cloze syntax…). */
export function CardPreview({ note, noteType }: Props) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const ords = generateCardOrds(note, noteType);
  const problems = problemsOf(note, noteType);
  return (
    <section aria-label={t('editor.cardsPreview')} className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">
        {t('editor.cardsPreviewCount', { count: ords.length })}
      </h3>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-1" aria-live="polite">
          {problems.map((p, i) => (
            <li
              key={i}
              className={`rounded-lg border px-3 py-2 text-sm ${p.severity === 'error' ? 'border-red-600 text-red-800 dark:text-red-300' : 'border-amber-500 text-amber-900 dark:text-amber-200'}`}
            >
              <strong>{p.severity === 'error' ? t('editor.error') : t('editor.warning')}</strong>{' '}
              {p.message[locale]}
            </li>
          ))}
        </ul>
      )}
      {ords.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-400">{t('editor.noCards')}</p>
      ) : (
        <ol className="flex flex-col gap-6">
          {ords.map((ord, i) => (
            <PreviewCard key={ord} note={note} noteType={noteType} ord={ord} index={i} />
          ))}
        </ol>
      )}
    </section>
  );
}
