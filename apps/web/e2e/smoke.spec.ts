import { expect, test } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('home page loads in French and switches to English from the settings', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/Mnemo/);
  await expect(page.getByRole('heading', { level: 1, name: 'Paquets' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('link', { name: 'Par défaut' })).toBeVisible();

  await page.goto('./#/settings');
  await page.getByLabel('Langue').selectOption('en');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // The choice persists across reloads.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
});

test('switches to dark theme', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByLabel('Thème', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
});
