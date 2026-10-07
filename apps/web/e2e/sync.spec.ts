import { expect, test, type Browser, type Page } from '@playwright/test';
import { SERVER_PORT } from '../playwright.config';

test.use({ locale: 'fr-FR' });

const ORIGIN = `http://127.0.0.1:${String(SERVER_PORT)}`;

/** 25 basic notes in one deck, pasted into the import wizard. */
const NOTES = [
  '---',
  'format: mnemo/1',
  'deck: Sync',
  '---',
  ...Array.from({ length: 25 }, (_, i) => {
    const n = String(i + 1).padStart(3, '0');
    return `::: basic uid=sync-${n}\nQ: Question ${n} ?\nA: Réponse ${n}.\n:::`;
  }),
].join('\n\n');

async function device(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: 'fr-FR', baseURL: ORIGIN });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Paquets' })).toBeVisible();
  return page;
}

async function connect(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(`Connecté à ${ORIGIN}`)).toBeVisible();
  await expect(page.getByText('À jour.')).toBeVisible({ timeout: 15_000 });
}

async function syncNow(page: Page): Promise<void> {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Synchroniser maintenant' }).click();
  await expect(page.getByText(/À jour\./)).toBeVisible({ timeout: 15_000 });
}

async function editAnswer(page: Page, question: string, answer: string): Promise<void> {
  await page.goto('/#/browse');
  await page.getByLabel('Rechercher dans les notes').fill(question);
  await page.getByRole('button', { name: question }).click();
  await page.getByLabel('Verso (réponse)').fill(answer);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Note enregistrée.')).toBeVisible();
}

test('A5 — offline reviews and concurrent edits merge without losing a review', async ({
  browser,
  browserName,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium' || browserName !== 'chromium', 'Desktop only');
  test.slow();
  const a = await device(browser);
  const b = await device(browser);

  // Device A imports 25 notes and syncs; device B receives them.
  await connect(a);
  await a.goto('/#/import');
  await a.getByLabel('Ou colle la réponse de l’IA').fill(NOTES);
  await a.getByRole('button', { name: 'Analyser' }).click();
  await a.getByRole('button', { name: 'Importer 25 notes' }).click();
  await expect(a.getByRole('heading', { name: 'Import réussi' })).toBeVisible();
  await syncNow(a);
  await connect(b);
  await b.goto('/#/browse');
  await expect(b.getByText('25 notes, 0 sélectionnée(s)')).toBeVisible();

  // A goes offline, reviews 20 cards and edits note 1.
  await a.context().setOffline(true);
  await a.goto('/');
  await a.getByRole('link', { name: 'Sync', exact: true }).click();
  for (let i = 0; i < 20; i++) {
    await expect(a.getByRole('button', { name: 'Afficher la réponse' })).toBeVisible();
    await a.keyboard.press('Space');
    await a.getByRole('button', { name: /^Facile/ }).click();
  }
  await expect(a.getByText('Bravo, vous avez terminé pour aujourd’hui !')).toBeVisible();
  await editAnswer(a, 'Question 001 ?', 'Réponse modifiée hors ligne.');

  // Meanwhile B edits the same note (same field, later in time).
  await editAnswer(b, 'Question 001 ?', 'Réponse modifiée sur B.');
  await syncNow(b);

  // A comes back online and syncs; B syncs again.
  await a.context().setOffline(false);
  await syncNow(a);
  await syncNow(b);

  for (const page of [a, b]) {
    // No review lost: the 20 offline reviews are on both devices.
    await page.goto('/#/stats');
    await expect(page.getByText('20 révisions sur l’année.')).toBeAttached();
    // Same-field conflict: the most recent write (B) wins on both devices.
    await page.goto('/#/browse');
    await page.getByLabel('Rechercher dans les notes').fill('Réponse modifiée sur B');
    await expect(page.getByText('1 note, 0 sélectionnée(s)')).toBeVisible();
  }
  // B received A's scheduling: 20 cards in review, 5 still new. (B shows no new card to study
  // today: A's 20 reviews already used the shared daily limit.)
  await b.goto('/#/stats');
  await expect(
    b.getByText('Nouvelle 5, En apprentissage 0, À réviser 20, En réapprentissage 0, Suspendue 0'),
  ).toBeAttached();
});
