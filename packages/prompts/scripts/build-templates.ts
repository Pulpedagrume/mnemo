/**
 * Embeds the prompt templates (`prompts/{fr,en}/*.md`) into `src/templates.generated.ts` so the
 * package works in browsers without file access, then refreshes the generated regions of
 * docs/AI_PROMPTS.md. Run: `pnpm --filter @mnemo/prompts templates`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTemplateFiles, renderTemplatesModule } from './templates-io';

const target = join(import.meta.dirname, '..', 'src', 'templates.generated.ts');
const files = readTemplateFiles();
writeFileSync(target, renderTemplatesModule(files));
console.log(`Wrote ${target} (${String(Object.keys(files.fr ?? {}).length)} templates per locale)`);

// Imported only now so that it sees the module written above.
const { refreshDoc } = await import('./docs-sections');
const docPath = join(import.meta.dirname, '..', '..', '..', 'docs', 'AI_PROMPTS.md');
if (existsSync(docPath)) {
  writeFileSync(docPath, refreshDoc(readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n')));
  console.log(`Refreshed ${docPath} (run Prettier on it afterwards)`);
}
