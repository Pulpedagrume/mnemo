import { describe, expect, it } from 'vitest';
import { buildProgram } from './program';

describe('cli program', () => {
  it('is named after the app slug and reports its version', () => {
    const program = buildProgram();
    expect(program.name()).toBe('mnemo');
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
