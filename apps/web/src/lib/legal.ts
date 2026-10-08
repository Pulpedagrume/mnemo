/** Who publishes and hosts this copy of the app; set at build time (`VITE_LEGAL_*`, see docs). */
export interface LegalInfo {
  publisher?: string;
  contact?: string;
  host?: string;
  hostPrivacy?: string;
  source?: string;
}

type LegalEnv = Pick<
  ImportMetaEnv,
  | 'VITE_LEGAL_PUBLISHER'
  | 'VITE_LEGAL_CONTACT'
  | 'VITE_LEGAL_HOST'
  | 'VITE_LEGAL_HOST_PRIVACY'
  | 'VITE_SOURCE_URL'
>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function legalInfo(env: LegalEnv = import.meta.env): LegalInfo {
  const entries = {
    publisher: clean(env.VITE_LEGAL_PUBLISHER),
    contact: clean(env.VITE_LEGAL_CONTACT),
    host: clean(env.VITE_LEGAL_HOST),
    hostPrivacy: clean(env.VITE_LEGAL_HOST_PRIVACY),
    source: clean(env.VITE_SOURCE_URL),
  };
  return Object.fromEntries(Object.entries(entries).filter(([, v]) => v !== undefined));
}
