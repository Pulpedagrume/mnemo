import { expect, type Page } from '@playwright/test';

/** Opens the app on a fresh database (each Playwright test has its own browser context). */
export async function openApp(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Paquets' })).toBeVisible();
}

export async function createDeck(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Nouveau paquet' }).click();
  await page.getByLabel('Nom complet').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

export interface NoteSpec {
  type: string;
  fill: (page: Page) => Promise<void>;
}

/** Creates a note through the editor; the deck is chosen by its full name. */
export async function createNote(page: Page, deck: string, spec: NoteSpec): Promise<void> {
  await page.goto('./#/notes/new');
  await page.getByLabel('Type de note').selectOption({ label: spec.type });
  await page.getByLabel('Paquet', { exact: true }).selectOption({ label: deck });
  await spec.fill(page);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // After a successful save the editor resets and remembers the deck and type in the URL.
  await expect(page).toHaveURL(/type=/);
}

export async function fillList(page: Page, labelPrefix: string, values: string[]): Promise<void> {
  for (const [i, value] of values.entries()) {
    const label = `${labelPrefix} ${String(i + 1)}`;
    if ((await page.getByLabel(label, { exact: true }).count()) === 0) {
      await page
        .getByRole('button', { name: /^Ajouter/ })
        .filter({ hasText: /étape|élément|proposition|paire/i })
        .first()
        .click();
    }
    await page.getByLabel(label, { exact: true }).fill(value);
  }
}
