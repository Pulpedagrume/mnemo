import { useId, type ReactNode } from 'react';

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-indigo-600 aria-[invalid=true]:border-red-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400';

interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: string | undefined;
  /** Renders the control with the ids it must use for a11y wiring. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + help text + error message, wired with aria-describedby. */
export function Field({ label, help, error, children, className = '' }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {help && (
        <p id={helpId} className="text-sm text-slate-600 dark:text-slate-400">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
