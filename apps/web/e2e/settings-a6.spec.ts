import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.use({ locale: 'fr-FR' });

const NOTES = [
  '---',
  'format: mnemo/1',
  'deck: Algo',
  '---',
  ...Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `::: basic uid=algo-${n}\nQ: Question ${n} ?\nA: Réponse ${n}.\n:::`;
  }),
].join('\n\n');

test('A6 — switching anki → fsrs shows the expected effect and converts cards safely', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
  await openApp(page);
  await page.goto('./#/import');
  await page.getByLabel('Ou colle la réponse de l’IA').fill(NOTES);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByRole('button', { name: 'Importer 12 notes' }).click();
  await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();

  // The default preset is switched to the Anki algorithm (cards are still new).
  await page.goto('./#/presets');
  await page.getByLabel('Algorithme de répétition').selectOption('anki');
  await page.getByRole('dialog').getByRole('button', { name: 'Convertir les cartes' }).click();
  await expect(page.getByLabel('Algorithme de répétition')).toHaveValue('anki');

  // Study 10 cards with "Easy" under Anki: they become review cards.
  await page.goto('./');
  await page.getByRole('link', { name: 'Algo', exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await expect(page.getByRole('button', { name: 'Afficher la réponse' })).toBeVisible();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: /^Facile/ }).click();
  }

  // Back to FSRS: the confirmation shows the effect on upcoming reviews.
  await page.goto('./#/presets');
  await page.getByLabel('Algorithme de répétition').selectOption('fsrs');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('12 cartes seront converties.', { exact: false })).toBeVisible();
  const row = dialog.getByRole('row', { name: /D’ici 7 jours/ });
  await expect(row).toBeVisible();
  await dialog.getByRole('button', { name: 'Convertir les cartes' }).click();
  await expect(page.getByLabel('Algorithme de répétition')).toHaveValue('fsrs');

  // No invalid state: 10 review cards and 2 new ones, a 30-day forecast with all 10.
  await page.goto('./#/stats');
  await expect(
    page.getByText(
      'Nouvelle 2, En apprentissage 0, À réviser 10, En réapprentissage 0, Suspendue 0',
    ),
  ).toBeAttached();
  await expect(page.getByText('10 cartes dues dans les 30 jours.')).toBeAttached();

  // The simulator gives a finite, positive workload.
  await page.goto('./#/presets');
  await page.getByRole('button', { name: 'Lancer la simulation' }).click();
  const average = page.getByText(/(\d+) révisions par jour en moyenne/).first();
  await expect(average).toBeVisible();
  const reviews = Number(/(\d+) révisions/.exec((await average.textContent()) ?? '')?.[1]);
  expect(reviews).toBeGreaterThan(0);
  expect(reviews).toBeLessThan(500);
});
