import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

test.use({ locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });

const example = (name: string) =>
  fileURLToPath(new URL(`../../../examples/ai-outputs/${name}`, import.meta.url));

async function upload(page: Page, name: string): Promise<void> {
  // Leave and reopen the page so the wizard starts fresh.
  await page.goto('./#/');
  await page.goto('./#/import');
  await page.locator('input[type=file]').setInputFiles(example(name));
  await expect(page.getByRole('heading', { name: `Aperçu de « ${name} »` })).toBeVisible();
}

/** Value of a summary tile (Notes, Cartes, Erreurs, Avertissements). */
const tile = (page: Page, label: string) =>
  page
    .locator('dl > div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('dd');

async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

for (const file of ['course-pack.md', 'course-pack.yaml', 'course-pack.json', 'course-pack.csv']) {
  test(`A1 — AI output ${file}: faithful preview, import, study`, async ({ page }) => {
    await openApp(page);
    await upload(page, file);
    await expect(tile(page, 'Notes')).toHaveText('120');
    await expect(tile(page, 'Erreurs')).toHaveText('0');
    await expect(tile(page, 'Avertissements')).toHaveText('3');
    await expect(page.getByText(/basic : 80 · cloze : 25 · mcq : 15/)).toBeVisible();
    // The preview renders the cards as in study mode.
    await expect(page.getByRole('article').first()).toBeVisible();
    await page.getByRole('button', { name: 'Importer 120 notes' }).click();
    await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();
    if (file !== 'course-pack.md') return;

    await page.getByRole('link', { name: 'Aller réviser' }).click();
    // The deck name opens the study screen (the Étudier button is hidden on phones).
    await page.getByRole('list', { name: 'Liste des paquets' }).getByRole('link').first().click();
    for (let i = 0; i < 5; i++) {
      const card = page.getByRole('article');
      // Wait for the next card's question phase (reveal button or MCQ check button).
      await expect(
        page
          .getByRole('button', { name: 'Afficher la réponse' })
          .or(card.getByRole('button', { name: 'Valider' })),
      ).toBeVisible();
      const check = card.getByRole('button', { name: 'Valider' });
      if (await check.isVisible()) {
        await card.locator('input').first().check();
        await check.click();
      } else {
        await page.keyboard.press('Space');
      }
      await page.getByRole('button', { name: /^Facile/ }).click();
    }
    await page.goto('./#/stats');
    await expect(page.getByText('5 révisions sur l’année.')).toBeAttached();
  });
}

test('A2 — errors are listed, partial import and a fix prompt naming each error', async ({
  page,
}) => {
  await openApp(page);
  await upload(page, 'with-errors.yaml');
  await expect(tile(page, 'Erreurs')).toHaveText('3');
  await expect(tile(page, 'Avertissements')).toHaveText('2');
  await expect(page.getByText('3 erreurs', { exact: true })).toBeVisible();
  await expect(page.getByText(/« qcm » → « mcq »/)).toBeVisible();
  await page.getByRole('button', { name: 'Copier le prompt de correction' }).click();
  const prompt = await clipboard(page);
  for (const uid of ['bio-9-003', 'bio-9-004', 'bio-9-005']) expect(prompt).toContain(uid);
  await page.getByRole('button', { name: 'Importer les 5 notes valides' }).click();
  await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();
});

test('A3 — truncated output: notes recovered and a Continue prompt', async ({ page }) => {
  await openApp(page);
  await upload(page, 'truncated.json');
  await expect(page.getByRole('heading', { name: 'Il manque la suite' })).toBeVisible();
  // Shown in the banner and in the issue list: check the banner.
  const banner = page.getByText(/40 notes récupérées, dernière uid : ([\w.:-]+)/).first();
  await expect(banner).toBeVisible();
  const lastUid = /dernière uid : ([\w.:-]+)/.exec((await banner.textContent()) ?? '')?.[1] ?? '';
  await page.getByRole('button', { name: 'Copier le prompt « Continue »' }).click();
  expect(await clipboard(page)).toContain(lastUid);
  await expect(tile(page, 'Notes')).toHaveText('40');
});

test('A4 — idempotent re-import, update keeping progress, undo', async ({ page }) => {
  await openApp(page);
  await upload(page, 'course-pack.md');
  await page.getByRole('button', { name: 'Importer 120 notes' }).click();
  await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();

  // Same file again: nothing new.
  await upload(page, 'course-pack.md');
  await expect(page.getByText('0 à créer, 0 à mettre à jour, 120 déjà présentes.')).toBeVisible();

  // Changed answer, same uid, "update" mode.
  const changed = readFileSync(example('course-pack.md'), 'utf8').replace(
    'A: Le port 22.',
    'A: Le port 22 (SSH).',
  );
  await page.goto('./#/');
  await page.goto('./#/import');
  await page.getByLabel('Ou colle la réponse de l’IA').fill(changed);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByLabel('En cas de doublon').selectOption('update');
  await expect(page.getByText('0 à créer, 120 à mettre à jour, 0 déjà présentes.')).toBeVisible();
  await page.getByRole('button', { name: 'Importer 120 notes' }).click();
  await expect(page.getByText(/120 mises à jour/)).toBeVisible();

  await page.goto('./#/browse');
  await page.getByLabel('Rechercher dans les notes').fill('port 22 (SSH)');
  await expect(page.getByText('1 note, 0 sélectionnée(s)')).toBeVisible();

  // Undo from the import history restores the previous answer.
  await page.goto('./#/');
  await page.goto('./#/import');
  await page.getByRole('button', { name: 'Annuler cet import' }).first().click();
  await expect(page.getByText('Import annulé.')).toBeVisible();
  await page.goto('./#/browse');
  await page.getByLabel('Rechercher dans les notes').fill('port 22 (SSH)');
  await expect(page.getByText('Aucune note ne correspond à ces critères.')).toBeVisible();
  await page.getByLabel('Rechercher dans les notes').fill('');
  await expect(page.getByText('120 notes, 0 sélectionnée(s)')).toBeVisible();
});

test('wizard composes a ready-to-paste prompt', async ({ page }) => {
  await openApp(page);
  await page.getByRole('link', { name: 'Importer avec l’IA' }).click();
  await expect(page.getByLabel('Mélange intelligent', { exact: false })).toBeChecked();
  await page.getByRole('button', { name: 'Voir le prompt' }).click();
  const prompt = await page.getByLabel('Prompt complet').inputValue();
  expect(prompt).toContain('RÔLE');
  expect(prompt).toContain('[COLLE OU JOINS TON DOCUMENT ICI]');
  await page.getByRole('button', { name: 'Copier le prompt' }).click();
  expect(await clipboard(page)).toContain('RÈGLES DE QUALITÉ');
});
