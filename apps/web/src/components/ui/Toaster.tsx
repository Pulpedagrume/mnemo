import { create } from 'zustand';
import { useEffect } from 'react';

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export function toast(message: string, tone: Toast['tone'] = 'info'): void {
  useToasts.getState().push(message, tone);
}

const TONES: Record<Toast['tone'], string> = {
  info: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
  success: 'bg-emerald-800 text-white',
  error: 'bg-red-800 text-white',
};

function ToastItem({ toast: item }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => {
      dismiss(item.id);
    }, 5_000);
    return () => {
      clearTimeout(timer);
    };
  }, [dismiss, item.id]);
  return <li className={`rounded-lg px-4 py-3 shadow-lg ${TONES[item.tone]}`}>{item.message}</li>;
}

/** Live region announcing toasts to assistive technologies. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6"
    >
      <ul className="flex w-full max-w-md flex-col gap-2">
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} />
        ))}
      </ul>
    </div>
  );
}
