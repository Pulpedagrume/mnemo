import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Io } from './io';
import { exportCommand } from './commands/export';
import { importCommand } from './commands/import';
import { nodeSqlEngine } from './sqlite-engine';

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

describe('Anki packages in the CLI', () => {
  it('opens, writes and serializes databases', async () => {
    const db = await nodeSqlEngine.open();
    db.run('CREATE TABLE t (a integer, b text)');
    db.run('INSERT INTO t VALUES (?, ?)', [1, 'x']);
    const copy = await nodeSqlEngine.open(db.export());
    db.close();
    expect(copy.all('SELECT * FROM t WHERE a = ?', [1])).toEqual([{ a: 1, b: 'x' }]);
    copy.close();
    const junk = await nodeSqlEngine.open(new Uint8Array([1, 2, 3]));
    expect(() => junk.all('SELECT 1 FROM col')).toThrow();
    junk.close();
  });

  it('exports a collection to .apkg and imports it into another one', async () => {
    const source = mkdtempSync(join(tmpdir(), 'mnemo-cli-'));
    const md = fileURLToPath(
      new URL('../../../examples/ai-outputs/course-pack.md', import.meta.url),
    );
    expect(await importCommand(md, { dataDir: source }, capture())).toBe(0);
    const out = join(source, 'all.apkg');
    const exp = capture();
    expect(await exportCommand('all', { format: 'apkg', out, dataDir: source }, exp)).toBe(0);
    expect(exp.stdout).toMatch(/^120 notes/);

    const target = mkdtempSync(join(tmpdir(), 'mnemo-cli-'));
    const imp = capture();
    await importCommand(out, { dataDir: target, withScheduling: true }, imp);
    expect(imp.stdout).toMatch(/all\.apkg \[apkg\]: 120\/120 valid notes.*created 120/);
  });
});
