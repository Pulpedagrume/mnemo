import { describe, expect, it } from 'vitest';
import { renameInText, toSlug } from './rename-app.mjs';
import { isAllowed } from './check-licenses.mjs';

describe('rename-app', () => {
  it('derives a slug', () => {
    expect(toSlug('Mémoire Vive')).toBe('memoire-vive');
    expect(toSlug('Recall')).toBe('recall');
  });

  it('renames display name, scope and CLI but keeps the format id', () => {
    const input = [
      "export const APP_NAME = 'Mnemo';",
      "import { x } from '@mnemo/core';",
      'mnemo import deck.md',
      'format: mnemo/1',
      'schema/mnemo-import.schema.json',
      'Mnemonic stays',
    ].join('\n');
    expect(renameInText(input, 'Recall', 'recall')).toBe(
      [
        "export const APP_NAME = 'Recall';",
        "import { x } from '@recall/core';",
        'recall import deck.md',
        'format: mnemo/1',
        'schema/mnemo-import.schema.json',
        'Mnemonic stays',
      ].join('\n'),
    );
  });
});

describe('check-licenses', () => {
  const allowed = new Set(['MIT', 'Apache-2.0']);
  it('evaluates SPDX expressions', () => {
    expect(isAllowed('MIT', allowed)).toBe(true);
    expect(isAllowed('GPL-3.0', allowed)).toBe(false);
    expect(isAllowed('(MIT OR GPL-3.0)', allowed)).toBe(true);
    expect(isAllowed('MIT AND GPL-3.0', allowed)).toBe(false);
    expect(isAllowed('MIT AND Apache-2.0', allowed)).toBe(true);
  });
});
