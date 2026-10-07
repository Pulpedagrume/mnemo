import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Io } from '../io';
import { exportCommand } from './export';
import { importCommand } from './import';
import { promptCommand } from './prompt';
import { importJsonSchema } from './schema';
import { validateCommand } from './validate';

const example = (name: string) =>
  fileURLToPath(new URL(`../../../../examples/ai-outputs/${name}`, import.meta.url));

function capture(): Io & { stdout: string; stderr: string } {
  const io = {
    stdout: '',
    stderr: '',
    out: (t: string) => {
      io.stdout += `${t}\n`;
    },
    err: (t: string) => {
      io.stderr += `${t}\n`;
    },
  };
  return io;
}

describe('cli commands', () => {
  it('validate reports and sets the exit code', async () => {
    const ok = capture();
    expect(await validateCommand(example('course-pack.md'), { lang: 'fr' }, ok)).toBe(0);
    expect(ok.stdout).toMatch(/120/);
    const bad = capture();
    expect(await validateCommand(example('with-errors.yaml'), { json: true }, bad)).toBe(1);
    expect(JSON.parse(bad.stdout)).toMatchObject({ counts: { errors: 3 } });
    const fix = capture();
    await validateCommand(example('with-errors.yaml'), { aiPrompt: true, lang: 'fr' }, fix);
    expect(fix.stdout).toContain('bio-9-004');
  });

  it('prints a composed prompt', () => {
    const io = capture();
    expect(
      promptCommand(
        { task: 'course-pack', format: 'md', lang: 'fr', hints: true, explanations: true },
        io,
      ),
    ).toBe(0);
    expect(io.stdout).toContain('[COLLE OU JOINS TON DOCUMENT ICI]');
    expect(
      promptCommand(
        { task: 'nope', format: 'md', lang: 'fr', hints: true, explanations: true },
        capture(),
      ),
    ).toBe(2);
  });

  it('prints the JSON schema', () => {
    expect(importJsonSchema()).toMatchObject({ type: 'object' });
  });

  it('imports into the local collection, then exports a deck', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mnemo-cli-'));
    const dry = capture();
    const code = await importCommand(
      fileURLToPath(new URL('../../../../examples/ai-outputs', import.meta.url)),
      { dryRun: true, dataDir },
      dry,
    );
    expect(code).toBe(1); // with-errors.yaml contains errors
    expect(dry.stdout).toMatch(
      /course-pack\.json \[json\]: 120\/120 valid notes.*would create 120/,
    );

    const real = capture();
    expect(await importCommand(example('course-pack.md'), { dataDir }, real)).toBe(0);
    expect(real.stdout).toMatch(/created 120/);
    const again = capture();
    await importCommand(example('course-pack.md'), { dataDir }, again);
    expect(again.stdout).toMatch(/created 0, updated 0, skipped 120/);

    const out = join(dataDir, 'all.md');
    const exp = capture();
    expect(await exportCommand('all', { format: 'md', out, dataDir }, exp)).toBe(0);
    expect(exp.stdout).toMatch(/^120 notes/);
    expect(readFileSync(out, 'utf8')).toContain('::: ');
    expect(await exportCommand('Nope', { format: 'md', dataDir }, capture())).toBe(2);
    expect(await exportCommand('all', { format: 'pdf', dataDir }, capture())).toBe(2);
  });
});
