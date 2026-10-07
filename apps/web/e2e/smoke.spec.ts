import { expect, test } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('home page loads in French and switches to English', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveTitle(/Mnemo/);
  await expect(page.getByRole('heading', { level: 1, name: 'Mnemo' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.getByLabel('Langue').selectOption('en');
  await expect(page.getByText(/Configurable spaced repetition/)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
