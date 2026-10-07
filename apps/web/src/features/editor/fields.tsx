import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { inputClass } from '../../components/ui/Field';
import { Markdown } from '../../components/Markdown';

interface MarkdownFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  help?: ReactNode;
  required?: boolean;
  preview?: boolean;
  textareaRef?: (el: HTMLTextAreaElement | null) => void;
}

/** Markdown textarea with a live preview (KaTeX, code, tables). */
export function MarkdownField({
  label,
  value,
  onChange,
  rows = 3,
  help,
  required,
  preview = true,
  textareaRef,
}: MarkdownFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
        {required && <span aria-hidden> *</span>}
      </label>
      <textarea
        id={id}
        ref={textareaRef}
        rows={rows}
        required={required}
        aria-describedby={help ? `${id}-help` : undefined}
        className={`${inputClass} font-mono text-sm`}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      />
      {help && (
        <p id={`${id}-help`} className="text-sm text-slate-600 dark:text-slate-400">
          {help}
        </p>
      )}
      {preview && value.trim() && (
        <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 dark:border-slate-700">
          <span className="text-xs font-semibold tracking-wide text-slate-600 uppercase dark:text-slate-400">
            {t('editor.preview')}
          </span>
          <Markdown source={value} />
        </div>
      )}
    </div>
  );
}

interface ListEditorProps<T> {
  label: ReactNode;
  items: readonly T[];
  onChange: (items: T[]) => void;
  create: () => T;
  render: (item: T, update: (item: T) => void, index: number) => ReactNode;
  itemLabel: (index: number) => string;
  min?: number;
  max?: number;
  addLabel: string;
}

/** Editable, reorderable list (choices, steps, pairs, hints…). */
export function ListEditor<T>({
  label,
  items,
  onChange,
  create,
  render,
  itemLabel,
  min = 0,
  max = 50,
  addLabel,
}: ListEditorProps<T>) {
  const { t } = useTranslation();
  const set = (index: number, item: T) => {
    onChange(items.map((cur, i) => (i === index ? item : cur)));
  };
  const swap = (a: number, b: number) => {
    const next = items.slice();
    const tmp = next[a] as T;
    next[a] = next[b] as T;
    next[b] = tmp;
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{label}</legend>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
          >
            <span className="mt-2 w-6 shrink-0 text-right text-sm text-slate-600 dark:text-slate-400">
              {i + 1}.
            </span>
            <div className="min-w-0 flex-1">
              {render(
                item,
                (next) => {
                  set(i, next);
                },
                i,
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('editor.moveUp', { item: itemLabel(i) })}
                disabled={i === 0}
                onClick={() => {
                  swap(i, i - 1);
                }}
              >
                <ArrowUp aria-hidden size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('editor.moveDown', { item: itemLabel(i) })}
                disabled={i === items.length - 1}
                onClick={() => {
                  swap(i, i + 1);
                }}
              >
                <ArrowDown aria-hidden size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('editor.remove', { item: itemLabel(i) })}
                disabled={items.length <= min}
                onClick={() => {
                  onChange(items.filter((_, j) => j !== i));
                }}
              >
                <Trash2 aria-hidden size={16} />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        className="self-start"
        disabled={items.length >= max}
        onClick={() => {
          onChange([...items, create()]);
        }}
      >
        <Plus aria-hidden size={16} />
        {addLabel}
      </Button>
    </fieldset>
  );
}

/** Single-line text input used inside list rows. */
export function RowInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      className={inputClass}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}
