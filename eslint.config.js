// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import { defineConfig } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import globals from 'globals';

const TEST_FILES = ['**/*.test.{ts,tsx,mjs}', '**/test/**', '**/e2e/**', '**/fixtures/**'];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dev-dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'schema/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.es2022 },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: '**/tsconfig.json',
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      // `any` is forbidden; a justified exception needs an eslint-disable comment with a reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import-x/no-cycle': 'error',
      'import-x/no-self-import': 'error',
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: TEST_FILES,
    rules: {
      'max-lines': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // packages/core is pure: no DOM, no Node, no other workspace package, no ambient clock or randomness.
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@mnemo/*', 'node:*'], message: 'core must stay dependency-free.' }],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject a Clock instead.' },
        { object: 'Math', property: 'random', message: 'Inject an Rng instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject a Clock instead of reading the current time.',
        },
      ],
    },
  },
  // Library packages never import applications.
  {
    files: ['packages/**/*.ts'],
    ignores: ['packages/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@mnemo/web', '@mnemo/server', '@mnemo/cli', '@mnemo/mcp'] }] },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/web/src/**/*.tsx'],
    extends: [jsxA11y.configs.recommended],
  },
  // No hard-coded UI strings: everything goes through i18n.
  {
    files: ['apps/web/src/**/*.tsx'],
    ignores: TEST_FILES,
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }] },
  },
  {
    files: ['apps/{server,cli,mcp}/**/*.ts', 'scripts/**', '*.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
