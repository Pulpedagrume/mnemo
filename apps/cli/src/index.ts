#!/usr/bin/env node
import { buildProgram } from './program';

let exitCode = 0;
await buildProgram(undefined, (code) => {
  exitCode = code;
}).parseAsync(process.argv);
process.exitCode = exitCode;
