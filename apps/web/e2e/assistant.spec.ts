import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

test.use({ locale: 'fr-FR' });

const NOTES = [
  '---',
  'format: mnemo/1',
  '---',
  '@deck Bio',
  '::: basic uid=ai-1\nQ: Quel organite produit l’ATP ?\nA: La mitochondrie.\n:::',
  '@deck Histoire',
  '::: basic uid=ai-2\nQ: Année de la prise de la Bastille ?\nA: 1789.\n:::',
].join('\n\n');

async function importNotes(page: Page): Promise<void> {
  await page.goto('./#/import');
  await page.getByLabel('Ou colle la réponse de l’IA').fill(NOTES);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByRole('button', { name: 'Importer 2 notes' }).click();
  await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();
}

const askButton = (page: Page) =>
  page.getByRole('button', { name: 'Poser une question à l’assistant IA' });

test('the AI assistant is off by default, then enabled deck by deck', async ({ page }) => {
  await openApp(page);
  await importNotes(page);

  // Off by default: no menu item, no button while studying.
  await page.goto('./');
  await page.getByRole('button', { name: 'Actions pour Bio' }).click();
  await expect(page.getByRole('menuitem', { name: 'Activer l’assistant IA' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Bio', exact: true }).click();
  await expect(page.getByRole('article')).toBeVisible();
  await expect(askButton(page)).toHaveCount(0);

  // Enable it globally, then for the "Bio" deck only.
  await page.goto('./#/settings');
  const enable = page.getByLabel('Activer l’assistant IA');
  await enable.click();
  await expect(enable).toBeChecked();
  await page.goto('./');
  await page.getByRole('button', { name: 'Actions pour Bio' }).click();
  await page.getByRole('menuitem', { name: 'Activer l’assistant IA' }).click();
  await expect(page.getByText('Assistant IA activé pour « Bio ».')).toBeVisible();

  await page.getByRole('link', { name: 'Histoire', exact: true }).click();
  await expect(page.getByRole('article')).toBeVisible();
  await expect(askButton(page)).toHaveCount(0);

  await page.goto('./');
  await page.getByRole('link', { name: 'Bio', exact: true }).click();
  await askButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Assistant IA' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/peuvent contenir des erreurs/)).toBeVisible();
  // Without a GPU (CI) the panel explains why; otherwise it asks before downloading anything.
  await expect(
    dialog
      .getByText(/WebGPU indisponible/)
      .or(dialog.getByRole('button', { name: /Télécharger le modèle/ })),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Study shortcuts are paused while the panel is open.
  await page.keyboard.press('Space');
  await expect(page.getByRole('article', { name: 'Question' })).toBeAttached();
  await page.keyboard.press('Escape');

  // Switching it off for the deck removes the button again.
  await page.goto('./');
  await page.getByRole('button', { name: 'Actions pour Bio' }).click();
  await page.getByRole('menuitem', { name: 'Désactiver l’assistant IA' }).click();
  await page.getByRole('link', { name: 'Bio', exact: true }).click();
  await expect(page.getByRole('article')).toBeVisible();
  await expect(askButton(page)).toHaveCount(0);
});
