import { useId, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { inputClass } from '../../components/ui/Field';

interface Props {
  busy: boolean;
  onFile: (file: File) => void;
  onText: (text: string) => void;
}

/** "I have the AI's answer": drop or pick a file, or paste the text. */
export function AnswerDropZone({ busy, onFile, onText }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
    else {
      const dropped = e.dataTransfer.getData('text/plain');
      if (dropped) setText(dropped);
    }
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        {t('wizard.answerTitle')}
      </h2>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${over ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-slate-300 dark:border-slate-600'}`}
      >
        <Upload aria-hidden size={28} className="text-slate-500" />
        <p>{t('wizard.dropHere')}</p>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {t('wizard.chooseFile')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,.yaml,.yml,.json,.csv,.tsv,.zip"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('wizard.chooseFile')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
      </div>
      <label htmlFor={`${id}-paste`} className="font-medium">
        {t('wizard.pasteLabel')}
      </label>
      <textarea
        id={`${id}-paste`}
        rows={6}
        className={`${inputClass} font-mono text-sm`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <Button
        variant="primary"
        className="self-start"
        disabled={busy || !text.trim()}
        aria-busy={busy}
        onClick={() => {
          onText(text);
        }}
      >
        {busy ? t('wizard.analysing') : t('wizard.analyse')}
      </Button>
    </section>
  );
}
