#!/usr/bin/env node
import { buildProgram } from './program';

await buildProgram().parseAsync(process.argv);
