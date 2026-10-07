/**
 * Application identity. "Mnemo" is a working name: change it everywhere with
 * `pnpm rename-app <Name>`, which rewrites these constants, package scopes and docs.
 */
export const APP_NAME = 'Mnemo';

/** Lowercase identifier used for the CLI binary, data directory and package scope. */
export const APP_SLUG = 'mnemo';

/** Import/export format identifier. Stable across renames so existing files keep working. */
export const FORMAT_ID = 'mnemo/1';
