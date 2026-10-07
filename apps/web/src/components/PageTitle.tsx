import { useEffect, type ReactNode } from 'react';
import { APP_NAME } from '@mnemo/core';

/** Page heading that also updates the document title (announced by screen readers on navigation). */
export function PageTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
