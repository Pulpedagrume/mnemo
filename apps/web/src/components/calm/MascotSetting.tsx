import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { mascotDataUrl } from '../../lib/mascotImage';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toaster';

interface Props {
  value: string;
  onChange: (value: string) => Promise<unknown>;
}

/** Lets the user replace the calm theme's mascot with a picture of their own (kept locally). */
export function MascotSetting({ value, onChange }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (file: File) => {
    try {
      await onChange(await mascotDataUrl(file));
      toast(t('settings.mascotSaved'), 'success');
    } catch {
      toast(t('settings.mascotError'), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-2 sm:col-span-2" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="font-medium">
        {t('settings.mascot')}
      </span>
      <p id={`${id}-help`} className="text-sm text-slate-600 dark:text-slate-400">
        {t('settings.mascotHelp')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {value && (
          <img
            src={value}
            alt={t('calm.mascotAlt')}
            width={56}
            height={56}
            className="size-14 rounded-xl border border-slate-300 object-cover"
          />
        )}
        <Button aria-describedby={`${id}-help`} onClick={() => fileRef.current?.click()}>
          {t('settings.mascotChoose')}
        </Button>
        {value && (
          <Button
            onClick={() => {
              void onChange('');
            }}
          >
            {t('settings.mascotReset')}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void pick(file);
          }}
        />
      </div>
    </div>
  );
}
