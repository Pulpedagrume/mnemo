import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initI18n } from './i18n';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    initI18n('fr');
  });

  it('renders the app name and a French tagline by default', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mnemo' })).toBeInTheDocument();
    expect(screen.getByText(/Répétition espacée paramétrable/)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('switches to English from the language selector', async () => {
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText('Langue'), 'en');
    expect(await screen.findByText(/Configurable spaced repetition/)).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
