/**
 * SIREADER BFF process entrypoint.
 *
 * dotenv is loaded before app/config modules so configuration is validated
 * only after the ignored local environment has been read. Production serves
 * the existing Vite dist output; development exposes API routes only.
 */
import { config as loadDotEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

loadDotEnv({ quiet: true });

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const { startBffServer } = await import('./app.ts');

const dependencies = isProduction
  ? { staticRoot: resolve(moduleDirectory, '../dist') }
  : {};

const server = startBffServer(undefined, undefined, dependencies);

server.on('error', (error: Error & { code?: string }) => {
  if (error.code === 'EADDRINUSE') {
    process.stderr.write('[SIREADER BFF] Required loopback port is already in use.\n');
  } else {
    process.stderr.write('[SIREADER BFF] Failed to start. Check local configuration and server logs.\n');
  }
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => {
    process.exitCode = 0;
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
