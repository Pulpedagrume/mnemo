import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

test.use({ locale: 'fr-FR' });

const NOTES = [
  '---',
  'format: mnemo/1',
  'deck: Accès',
  '---',
  '::: basic uid=a11y-1\nQ: Capitale de la France ?\nA: Paris.\nHint: Ville lumière.\n:::',
  '::: mcq uid=a11y-2\nQ: Quels nombres sont pairs ?\n- [x] 2\n- [ ] 3\n- [x] 4\n- [ ] 5\nExplanation: Divisibles par 2.\n:::',
  '::: ordering uid=a11y-3\nQ: Range du plus petit au plus grand.\n1. Un\n2. Deux\n3. Trois\n:::',
].join('\n\n');

/** WCAG 2.x A/AA checks (contrast included) on the current page. */
async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${String(v.nodes.length)}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}

async function importNotes(page: Page): Promise<void> {
  await page.goto('./#/import');
  await page.getByLabel('Ou colle la réponse de l’IA').fill(NOTES);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByRole('button', { name: 'Importer 3 notes' }).click();
  await expect(page.getByRole('heading', { name: 'Import réussi' })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`A7 — every screen passes WCAG AA checks (${scheme})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await importNotes(page);
    for (const [route, label] of [
      ['./', 'decks'],
      ['./#/browse', 'browse'],
      ['./#/stats', 'stats'],
      ['./#/presets', 'presets'],
      ['./#/settings', 'settings'],
      ['./#/import', 'import'],
      ['./#/guide', 'guide'],
      ['./#/notes/new', 'editor'],
      ['./#/legal', 'legal'],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, `${scheme} ${label}`);
    }
    await page.goto('./');
    await page.getByRole('link', { name: 'Accès', exact: true }).click();
    await expect(page.getByRole('article')).toBeVisible();
    await audit(page, `${scheme} study`);
  });
}

test('A7 — a full study session with the keyboard only', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop only');
  await openApp(page);
  await importNotes(page);
  await page.goto('./');
  // Reach the deck with Tab, open it with Enter.
  const deckLink = page.getByRole('link', { name: 'Accès', exact: true });
  for (
    let i = 0;
    i < 40 && !(await deckLink.evaluate((el) => el === document.activeElement));
    i++
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(deckLink).toBeFocused();
  await page.keyboard.press('Enter');

  const card = page.getByRole('article');
  const done = page.getByText('Bravo, vous avez terminé pour aujourd’hui !');
  let hinted = false;
  // Hinted or "Good" answers come back in learning: loop until the session ends.
  for (let turn = 0; turn < 8 && !(await done.isVisible()); turn++) {
    await expect(card).toHaveAccessibleName('Question');
    const text = (await card.textContent()) ?? '';
    if (text.includes('Capitale')) {
      // Hint (I), reveal (Space), then Easy (4).
      if (!hinted) {
        hinted = true;
        await page.keyboard.press('i');
        await expect(card.getByRole('list').getByText('Ville lumière.')).toBeVisible();
      }
      await page.keyboard.press('Space');
      await expect(card).toHaveAccessibleName('Réponse');
      await page.keyboard.press('4');
    } else if (text.includes('pairs')) {
      // Checkboxes reached with Tab and toggled with Space; the result is announced as text.
      const group = card.getByRole('group');
      for (const option of ['2', '4']) {
        const box = group.getByRole('checkbox', { name: option, exact: true });
        await box.focus();
        await page.keyboard.press('Space');
        await expect(box).toBeChecked();
      }
      await card.getByRole('button', { name: 'Valider' }).focus();
      await page.keyboard.press('Enter');
      await expect(card.getByRole('status')).toHaveText(/Tout est juste/);
      await expect(card.getByText('Bonne réponse').first()).toBeVisible();
      await page.keyboard.press('4');
    } else {
      // Ordering with the move buttons (keyboard), announced through a live region.
      for (const step of ['Un', 'Deux', 'Trois']) {
        for (let guard = 0; guard < 3; guard++) {
          const items = await card.locator('ol > li').allTextContents();
          const index = items.findIndex((t) => t.includes(step));
          const target = ['Un', 'Deux', 'Trois'].indexOf(step);
          if (index <= target) break;
          await card.getByRole('button', { name: `Monter « ${step} »` }).focus();
          await page.keyboard.press('Enter');
        }
      }
      await card.getByRole('button', { name: 'Valider' }).focus();
      await page.keyboard.press('Enter');
      await expect(card.getByRole('status')).toHaveText(/Tout est juste/);
      await page.keyboard.press('4');
    }
    // Wait for the next question (or the end screen) before reading the card again.
    await expect(page.getByRole('article', { name: 'Question' }).or(done)).toBeVisible();
  }
  await expect(done).toBeVisible();
  // Undo with Z brings the last card back.
  await page.keyboard.press('z');
  await expect(card).toBeVisible();
});
