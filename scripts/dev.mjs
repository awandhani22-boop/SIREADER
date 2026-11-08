/**
 * Cross-platform local development launcher.
 *
 * Starts the BFF and Vite as sibling loopback-only processes. If either exits,
 * the other is stopped so the application cannot be left half-running.
 */
import { spawn, type ChildProcess } from 'node:child_process';

const environment = {
  ...process.env,
  NODE_ENV: 'development',
};

const commands = [
  ['--import', 'tsx', 'server/main.ts'],
  ['node_modules/vite/bin/vite.js'],
];

const children: ChildProcess[] = [];
let shuttingDown = false;

function stop(exitCode: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const args of commands) {
  const child = spawn('node', args, {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);

  child.once('error', () => {
    process.stderr.write('[SIREADER DEV] A development process could not be started.\n');
    stop(1);
  });

  child.once('exit', (code) => {
    if (!shuttingDown) {
      process.stderr.write('[SIREADER DEV] A development process stopped; shutting down the pair.\n');
      stop(code && code !== 0 ? code : 1);
    }
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
