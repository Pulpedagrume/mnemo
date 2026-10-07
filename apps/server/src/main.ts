import { ConfigError } from './config';
import { startServer } from './server';

/** `node dist/server.mjs`: configuration comes from the environment (see .env.example). */
try {
  await startServer();
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
  process.stderr.write(`${e.message}\n`);
  process.exitCode = 1;
}
