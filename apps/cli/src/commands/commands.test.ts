import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Io } from '../io';
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

  it('import --dry-run analyses a folder; a real import is not available yet', async () => {
    const io = capture();
    const code = await importCommand(
      fileURLToPath(new URL('../../../../examples/ai-outputs', import.meta.url)),
      { dryRun: true },
      io,
    );
    expect(code).toBe(1); // with-errors.yaml contains errors
    expect(io.stdout).toMatch(/course-pack\.json \[json\]: 120\/120 valid notes/);
    expect(await importCommand(example('course-pack.md'), {}, capture())).toBe(2);
  });
});
