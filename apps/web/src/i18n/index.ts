import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@mnemo/core';
import fr from './locales/fr.json';
import en from './locales/en.json';

const resources = { fr: { translation: fr }, en: { translation: en } } as const;

function syncDocumentLang(lng: string): void {
  document.documentElement.lang = lng;
}

export function initI18n(locale: Locale): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...LOCALES],
      interpolation: { escapeValue: false }, // React already escapes
      initAsync: false,
    });
    i18n.on('languageChanged', syncDocumentLang);
  } else {
    void i18n.changeLanguage(locale);
  }
  syncDocumentLang(locale);
  return i18n;
}
