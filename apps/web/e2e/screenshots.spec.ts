import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

/**
 * Generates the README screenshots (`pnpm screenshots`). Tagged @screenshots: excluded from the
 * regular e2e runs.
 */
test.use({ locale: 'fr-FR', viewport: { width: 1280, height: 800 }, colorScheme: 'light' });

const OUT = (name: string) =>
  fileURLToPath(new URL(`../../../docs/screenshots/${name}.png`, import.meta.url));
const EXAMPLE = fileURLToPath(
  new URL('../../../examples/ai-outputs/course-pack.md', import.meta.url),
);

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(300); // let fonts and KaTeX settle
  await page.screenshot({ path: OUT(name) });
}

test('README screenshots @screenshots', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
  await openApp(page);
  // Keep the screenshots clean: dismiss the storage banner and the offline-ready notice.
  await page.getByRole('button', { name: 'Masquer' }).click();
  const close = page.getByRole('button', { name: 'Fermer' });
  if (await close.isVisible()) await close.click();

  await page.goto('./#/import');
  await shot(page, 'import-wizard');

  await page.locator('input[type=file]').setInputFiles(EXAMPLE);
  await expect(page.getByRole('heading', { name: /Aperçu de/ })).toBeVisible();
  await shot(page, 'import-preview');
  await page.getByRole('button', { name: 'Importer 120 notes' }).click();
  await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();

  await page.goto('./');
  await expect(page.getByRole('list', { name: 'Liste des paquets' })).toBeVisible();
  await shot(page, 'decks');

  await page.getByRole('list', { name: 'Liste des paquets' }).getByRole('link').first().click();
  await expect(page.getByRole('article')).toBeVisible();
  const check = page.getByRole('article').getByRole('button', { name: 'Valider' });
  if (await check.isVisible()) {
    await page.getByRole('article').locator('input').first().check();
    await check.click();
  } else {
    await page.getByRole('button', { name: 'Afficher la réponse' }).click();
  }
  await shot(page, 'study');
  await page.getByRole('button', { name: /^Facile/ }).click();

  await page.goto('./#/stats');
  await expect(page.getByRole('heading', { level: 1, name: 'Statistiques' })).toBeVisible();
  await shot(page, 'stats');

  await page.goto('./#/presets');
  await page.getByRole('button', { name: 'Lancer la simulation' }).click();
  await expect(page.getByText(/révisions par jour en moyenne/).first()).toBeVisible();
  await page
    .getByRole('heading', { name: 'Simuler la charge de travail' })
    .scrollIntoViewIfNeeded();
  await shot(page, 'simulator');
});
