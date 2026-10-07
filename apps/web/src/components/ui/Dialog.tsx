import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button, focusRing } from './Button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: DialogProps) {
  const { t } = useTranslation();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-slate-950/60" />
        <RadixDialog.Content
          className={`fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-lg font-semibold">{title}</RadixDialog.Title>
            <RadixDialog.Close
              className={`rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${focusRing}`}
              aria-label={t('common.close')}
            >
              <X aria-hidden size={20} />
            </RadixDialog.Close>
          </div>
          {description && (
            <RadixDialog.Description className="mb-4 text-slate-700 dark:text-slate-300">
              {description}
            </RadixDialog.Description>
          )}
          {children}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

export function ConfirmDialog(props: ConfirmProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      description={props.description}
      footer={
        <>
          <Button
            onClick={() => {
              props.onOpenChange(false);
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant={props.danger ? 'danger' : 'primary'}
            onClick={() => {
              props.onConfirm();
              props.onOpenChange(false);
            }}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      {props.children}
    </Dialog>
  );
}
