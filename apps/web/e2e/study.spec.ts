import { expect, test, type Page } from '@playwright/test';
import { createDeck, createNote, fillList, openApp, type NoteSpec } from './helpers';

test.use({ locale: 'fr-FR' });

const DECK = 'Réseaux::Ethernet';

const NOTES: NoteSpec[] = [
  {
    type: 'Basique',
    fill: async (p) => {
      await p.getByLabel('Recto (question)').fill('BASIC : rôle du champ FCS ?');
      await p.getByLabel('Verso (réponse)').fill('Détecter les erreurs.');
      await p.getByRole('button', { name: 'Ajouter un indice' }).click();
      await p.getByLabel('Indice 1', { exact: true }).fill('Frame Check Sequence');
    },
  },
  {
    type: 'Texte à trous',
    fill: async (p) => {
      await p.getByLabel('Texte à trous').fill('CLOZE : le FCS contient un {{c1::CRC::sigle}}.');
    },
  },
  {
    type: 'QCM',
    fill: async (p) => {
      await p
        .getByRole('textbox', { name: 'Question' })
        .fill('MCQ : quel support résiste aux EMI ?');
      await fillList(p, 'Proposition', ['Fibre optique', 'UTP', 'STP', 'Coaxial']);
    },
  },
  {
    type: 'Vrai / faux',
    fill: async (p) => {
      await p.getByLabel('Affirmation').fill('TRUEFALSE : une trame contient un FCS.');
    },
  },
  {
    type: 'Association',
    fill: async (p) => {
      await p
        .getByRole('textbox', { name: 'Question' })
        .fill('MATCHING : associe chaque usage à son support.');
      await p.getByLabel('Élément de la paire 1', { exact: true }).fill('Bureau');
      await p.getByLabel('Correspondance de la paire 1', { exact: true }).fill('Cuivre');
      await p.getByLabel('Élément de la paire 2', { exact: true }).fill('Entre bâtiments');
      await p.getByLabel('Correspondance de la paire 2', { exact: true }).fill('Fibre');
    },
  },
  {
    type: 'Remise en ordre',
    fill: async (p) => {
      await p
        .getByRole('textbox', { name: 'Question' })
        .fill('ORDERING : étapes du store-and-forward.');
      await fillList(p, 'Étape', ['Réception', 'Vérification du FCS', 'Transmission']);
    },
  },
  {
    type: 'Liste',
    fill: async (p) => {
      await p.getByRole('textbox', { name: 'Question' }).fill('LIST : deux supports réseau ?');
      await fillList(p, 'Élément', ['Cuivre', 'Fibre']);
    },
  },
  {
    type: 'Réponse à saisir',
    fill: async (p) => {
      await p.getByLabel('Recto (question)').fill('TYPED : sigle du contrôle de trame ?');
      await p.getByLabel('Réponse acceptée 1', { exact: true }).fill('FCS');
    },
  },
];

/** Answers the card currently displayed, correctly, then rates it Easy. Returns its kind. */
async function answerCurrent(page: Page, useHint: boolean): Promise<string> {
  const card = page.getByRole('article');
  const text = (await card.textContent()) ?? '';
  const kind =
    /^(BASIC|CLOZE|MCQ|TRUEFALSE|MATCHING|ORDERING|LIST|TYPED)/.exec(text.trim())?.[1] ?? 'UNKNOWN';
  switch (kind) {
    case 'BASIC':
      if (useHint) {
        await page.getByRole('button', { name: 'Afficher un indice' }).click();
        await expect(card.getByText('Frame Check Sequence')).toBeVisible();
      }
      await page.keyboard.press('Space');
      break;
    case 'CLOZE':
      await expect(card.getByText('[sigle]')).toBeVisible();
      await page.keyboard.press('Space');
      await expect(card.getByText('CRC')).toBeVisible();
      break;
    case 'MCQ':
      await card.getByLabel('Fibre optique').check();
      await card.getByRole('button', { name: 'Valider' }).click();
      await expect(card.getByText('Bonne réponse')).toBeVisible();
      break;
    case 'TRUEFALSE':
      await card.getByRole('button', { name: 'Vrai' }).click();
      break;
    case 'MATCHING':
      await card.getByLabel('Bureau').selectOption('Cuivre');
      await card.getByLabel('Entre bâtiments').selectOption('Fibre');
      await card.getByRole('button', { name: 'Valider' }).click();
      break;
    case 'ORDERING': {
      // Reorder with the keyboard-accessible "move up" buttons.
      const wanted = ['Réception', 'Vérification du FCS', 'Transmission'];
      for (const [target, step] of wanted.entries()) {
        for (;;) {
          const items = await card.locator('ol > li').allTextContents();
          const at = items.findIndex((t) => t.includes(step));
          if (at <= target) break;
          await card.getByRole('button', { name: `Monter « ${step} »` }).click();
        }
      }
      await card.getByRole('button', { name: 'Valider' }).click();
      break;
    }
    case 'LIST':
      await card.getByRole('textbox').fill('cuivre\nfibre');
      await card.getByRole('button', { name: 'Valider' }).click();
      break;
    case 'TYPED':
      await card.getByLabel('Votre réponse').fill('fcs');
      await page.keyboard.press('Enter');
      break;
    default:
      throw new Error(`Unexpected card: ${text}`);
  }
  if (kind !== 'BASIC' && kind !== 'CLOZE') {
    await expect(card.getByText('Tout est juste !')).toBeVisible();
    await expect(page.getByText(/Note proposée d’après la correction : Correct/)).toBeVisible();
  }
  await page.getByRole('button', { name: /^Facile/ }).click();
  return kind;
}

test('create one note of each type and study them all', async ({ page }) => {
  test.slow();
  await openApp(page);
  await createDeck(page, DECK);
  for (const spec of NOTES) await createNote(page, DECK, spec);

  await page.goto('./');
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'Ethernet', exact: true }) })
    .last();
  await expect(row.getByText('Nouvelles : 8')).toBeAttached();
  await row.getByRole('link', { name: 'Ethernet', exact: true }).click();

  const seen: string[] = [];
  const done = page.getByText('Bravo, vous avez terminé pour aujourd’hui !');
  for (let i = 0; i < 12 && !(await done.isVisible()); i++) {
    // Wait for the next card to replace the one just answered.
    const previous = seen.at(-1);
    await expect
      .poll(async () =>
        (await done.isVisible())
          ? 'DONE'
          : ((await page.getByRole('article').textContent()) ?? '').trim(),
      )
      .not.toMatch(new RegExp(`^${previous ?? '\0'}`));
    if (await done.isVisible()) break;
    seen.push(await answerCurrent(page, !seen.includes('BASIC')));
  }
  await expect(page.getByText('Bravo, vous avez terminé pour aujourd’hui !')).toBeVisible();
  await expect(page.getByText('Cartes revues')).toBeVisible();
  // The hint capped "Easy" at "Good" (hint policy capGood): the basic card came back once.
  expect(seen.sort()).toEqual([
    'BASIC',
    'BASIC',
    'CLOZE',
    'LIST',
    'MATCHING',
    'MCQ',
    'ORDERING',
    'TRUEFALSE',
    'TYPED',
  ]);

  // Undo restores the last card.
  await page.keyboard.press('z');
  await expect(page.getByRole('article')).toBeVisible();

  // 9 answers minus the undone one.
  await page.goto('./#/stats');
  await expect(page.getByText('8 révisions sur l’année.')).toBeAttached();
});
