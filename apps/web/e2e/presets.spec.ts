import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createNote, openApp } from './helpers';

test.use({ locale: 'fr-FR' });

test('changes the algorithm after a confirmation showing the expected effect', async ({ page }) => {
  await openApp(page);
  await createNote(page, 'Par défaut', {
    type: 'Basique',
    fill: async (p) => {
      await p.getByLabel('Recto (question)').fill('Q');
      await p.getByLabel('Verso (réponse)').fill('R');
    },
  });
  await page.goto('./#/presets');
  await expect(page.getByLabel('Algorithme de répétition')).toHaveValue('fsrs');
  await page.getByLabel('Algorithme de répétition').selectOption('anki');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Changer d’algorithme ?')).toBeVisible();
  await expect(dialog.getByRole('rowheader', { name: 'D’ici 7 jours' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Convertir les cartes' }).click();
  await expect(page.getByLabel('Algorithme de répétition')).toHaveValue('anki');
  // The form is generated from the scheduler's parameter spec.
  await expect(page.getByLabel(/Facilité de départ/)).toBeVisible();

  await page.getByLabel('Nouvelles cartes par jour').first().fill('7');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.reload();
  await expect(page.getByLabel('Nouvelles cartes par jour').first()).toHaveValue('7');

  await page.getByRole('button', { name: 'Lancer la simulation' }).click();
  await expect(page.getByText(/révisions par jour en moyenne/)).toBeVisible();
});

test('exports a backup and restores it', async ({ page }) => {
  await openApp(page);
  await createNote(page, 'Par défaut', {
    type: 'Basique',
    fill: async (p) => {
      await p.getByLabel('Recto (question)').fill('À sauvegarder');
      await p.getByLabel('Verso (réponse)').fill('R');
    },
  });
  await page.goto('./#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter une sauvegarde (.zip)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^mnemo-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const path = await download.path();

  // Delete the note, then restore the backup.
  await page.goto('./#/browse');
  await page.getByRole('button', { name: 'Tout sélectionner' }).click();
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Aucune note ne correspond à ces critères.')).toBeVisible();

  await page.goto('./#/settings');
  await page.getByLabel('Restaurer une sauvegarde').setInputFiles({
    name: 'backup.zip',
    mimeType: 'application/zip',
    buffer: readFileSync(path),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Remplacer mes données' }).click();
  await expect(page.getByText(/Sauvegarde restaurée/)).toBeVisible();
  await page.goto('./#/browse');
  await expect(page.getByRole('button', { name: 'À sauvegarder' })).toBeVisible();
});
