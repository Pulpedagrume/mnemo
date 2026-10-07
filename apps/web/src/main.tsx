import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveLocale } from '@mnemo/core';
import { initI18n } from './i18n';
import { App } from './App';
import './index.css';

initI18n(resolveLocale(navigator.language));

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
