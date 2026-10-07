#!/usr/bin/env node
import { runMcp } from './cli';

// stdout carries the MCP protocol in stdio mode: every human-readable line goes to stderr.
const log = (line: string) => {
  process.stderr.write(`${line}\n`);
};

runMcp(process.argv.slice(2), process.env, log)
  .then((running) => {
    if (!running) return;
    const shutdown = () => {
      void running.stop().finally(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    // The MCP client closing stdin ends a stdio session.
    if (running.transport === 'stdio') process.stdin.once('close', shutdown);
  })
  .catch((e: unknown) => {
    log(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
