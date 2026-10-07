import { expect, test } from '@playwright/test';
import { createNote, openApp } from './helpers';

test.use({ locale: 'fr-FR' });

test('keeps working offline after the first visit (PWA)', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Service workers are tested on Chromium');
  await openApp(page);
  // The service worker precaches the app; it controls the page from the next load.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Paquets' })).toBeVisible();

  await createNote(page, 'Par défaut', {
    type: 'Basique',
    fill: async (p) => {
      await p.getByLabel('Recto (question)').fill('Hors ligne ?');
      await p.getByLabel('Verso (réponse)').fill('Oui.');
    },
  });
  await page.goto('./');
  await page.getByRole('link', { name: 'Par défaut' }).click();
  await expect(page.getByRole('article')).toBeVisible();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^Facile/ }).click();
  await expect(page.getByText('Bravo, vous avez terminé pour aujourd’hui !')).toBeVisible();
  await context.setOffline(false);
});
