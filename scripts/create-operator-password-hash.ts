import { hashOperatorPassword } from '../server/auth.ts';

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  process.stderr.write('Run this helper in an interactive terminal. No password is read from command arguments.\n');
  process.exit(1);
}

let password = '';
let finished = false;

function restoreTerminal(): void {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}
function finish(): void {
  if (finished) return;
  finished = true;
  restoreTerminal();
  process.stdout.write('\n');
  if (password.length < 16) {
    password = '';
    process.stderr.write('Use at least 16 printable ASCII characters. No hash was created.\n');
    process.exitCode = 1;
    return;
  }
  void hashOperatorPassword(password).then((hash) => {
    password = '';
    process.stdout.write('OPERATOR_PASSWORD_HASH=' + hash + '\n');
    process.stdout.write('Copy this line into the ignored local .env file. Do not commit or share it.\n');
  }).catch(() => {
    password = '';
    process.stderr.write('Could not derive the password hash. No password or hash was logged.\n');
    process.exitCode = 1;
  });
}

process.stdout.write('Enter operator password (minimum 16 printable ASCII characters; input masked): ');
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (chunk: Buffer) => {
  for (const byte of chunk) {
    if (byte === 3) {
      password = '';
      restoreTerminal();
      process.stdout.write('\nCancelled.\n');
      process.exitCode = 1;
      process.exit();
    }
    if (byte === 13 || byte === 10) {
      finish();
      return;
    }
    if (byte === 8 || byte === 127) {
      if (password.length > 0) {
        password = password.slice(0, -1);
        process.stdout.write('\b \b');
      }
      continue;
    }
    if (byte >= 32 && byte <= 126 && password.length < 128) {
      password += String.fromCharCode(byte);
      process.stdout.write('*');
    }
  }
});
