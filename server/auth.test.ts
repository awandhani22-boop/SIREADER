import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBffApp } from './app.ts';
import { hashOperatorPassword, OPERATOR_SESSION_ABSOLUTE_MS } from './auth.ts';
import type { WorkforceCommandProxyOptions } from './commands.ts';

const TEST_PASSWORD = 'Test-only-operator-password-2026!';
const HEADERS = {
  host: '127.0.0.1:3000',
  origin: 'http://127.0.0.1:3000',
  'sec-fetch-site': 'same-origin',
};

interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: any;
}
interface Harness {
  request: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<HttpResult>;
  close: () => Promise<void>;
}
async function createHarness(options: {
  passwordHash?: string;
  now?: () => number;
  workforceCommandOptions?: WorkforceCommandProxyOptions;
} = {}): Promise<Harness> {
  const app = createBffApp(undefined, {
    authOptions: {
      passwordHash: Object.prototype.hasOwnProperty.call(options, 'passwordHash') ? options.passwordHash : '',
      now: options.now,
    },
    tokenProvider: () => undefined,
    fetchImpl: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    workforceCommandOptions: options.workforceCommandOptions,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const request = (
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<HttpResult> => new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { ...HEADERS, ...extraHeaders };
    if (serialized !== undefined) headers['content-type'] = 'application/json';
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        let json: any = null;
        try { json = JSON.parse(bodyText); } catch { /* asserted per test */ }
        resolve({ status: res.statusCode || 0, headers: res.headers, body: bodyText, json });
      });
    });
    req.on('error', reject);
    if (serialized !== undefined) req.write(serialized);
    req.end();
  });
  return {
    request,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function sessionCookie(result: HttpResult): string {
  const values = result.headers['set-cookie'];
  assert.ok(Array.isArray(values) && values.length > 0, 'expected Set-Cookie header');
  const pair = values![0].split(';', 1)[0];
  assert.match(pair, /^__Host-sireader_sid=[A-Za-z0-9_-]{43}$/);
  return pair;
}
function csrfToken(result: HttpResult): string {
  const value = result.json?.csrfToken;
  assert.equal(typeof value, 'string');
  assert.match(value, /^[A-Za-z0-9_-]{43}$/);
  return value;
}

test('SIREADER operator authentication — secure in-memory sessions', async (t) => {
  await t.test('missing or malformed password hash fails closed', async () => {
    const missing = await createHarness({ passwordHash: '' });
    try {
      const result = await missing.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(result.status, 503);
      assert.equal(result.json?.error?.code, 'AUTH_NOT_CONFIGURED');
      assert.equal(result.headers['set-cookie'], undefined);
    } finally { await missing.close(); }

    const malformed = await createHarness({ passwordHash: 'scrypt$1$2$3$invalid$invalid' });
    try {
      const result = await malformed.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(result.status, 503);
      assert.equal(result.json?.error?.code, 'AUTH_NOT_CONFIGURED');
    } finally { await malformed.close(); }
  });


  await t.test('workforce command routes require operator session and CSRF before proxying', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x39));
    const commandToken = 'bff-command-test-token-0123456789012345';
    const received: Array<{ url: string; headers: Headers; body: string }> = [];
    const harness = await createHarness({
      passwordHash,
      workforceCommandOptions: {
        tokenProvider: () => commandToken,
        fetchImpl: async (input, init = {}) => {
          received.push({
            url: String(input),
            headers: new Headers(init.headers),
            body: String(init.body),
          });
          return new Response(JSON.stringify({
            command_id: 'cmd_12345678',
            actor_id: 'local_operator',
            command_type: 'WORKER_SCHEDULING_SET',
            target_id: 'haiku',
            correlation_id: 'corr_12345678',
            outcome: {
              accepted: true,
              worker_id: 'haiku',
              accepting_tasks: false,
              schedule_state: 'PAUSED',
            },
            created_at: '2026-11-09T10:00:00Z',
            replayed: false,
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        },
      },
    });
    try {
      const path = '/api/v1/commands/workers/scheduling';
      const body = { worker_id: 'haiku', accepting_tasks: false };
      const idempotency = { 'idempotency-key': 'bff-command-session-001' };

      const anonymous = await harness.request('POST', path, body, idempotency);
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.json?.error?.code, 'SESSION_REQUIRED');
      assert.equal(received.length, 0);

      const login = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(login.status, 200);
      const cookie = sessionCookie(login);
      const csrf = csrfToken(login);

      const withoutCsrf = await harness.request('POST', path, body, {
        ...idempotency, cookie,
      });
      assert.equal(withoutCsrf.status, 403);
      assert.equal(withoutCsrf.json?.error?.code, 'CSRF_INVALID');
      assert.equal(received.length, 0);

      const invalidOrigin = await harness.request('POST', path, body, {
        ...idempotency, cookie, 'x-csrf-token': csrf, origin: 'http://evil.example',
      });
      assert.equal(invalidOrigin.status, 403);
      assert.equal(invalidOrigin.json?.error?.code, 'FORBIDDEN');
      assert.equal(received.length, 0);

      const accepted = await harness.request('POST', path, body, {
        ...idempotency, cookie, 'x-csrf-token': csrf,
      });
      assert.equal(accepted.status, 200);
      assert.equal(accepted.json?.outcome?.schedule_state, 'PAUSED');
      assert.equal(received.length, 1);
      assert.equal(received[0].url, 'http://127.0.0.1:8010' + path);
      assert.equal(received[0].headers.get('authorization'), 'Bearer ' + commandToken);
      assert.equal(received[0].headers.get('cookie'), null);
      assert.equal(received[0].headers.get('x-csrf-token'), null);
      assert.equal(received[0].headers.get('idempotency-key'), 'bff-command-session-001');
    } finally {
      await harness.close();
    }
  });

  await t.test('password login creates a secure host-only cookie and session CSRF token', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x31));
    const harness = await createHarness({ passwordHash });
    try {
      const login = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(login.status, 200);
      assert.equal(login.json?.authenticated, true);
      const cookie = sessionCookie(login);
      const setCookie = (login.headers['set-cookie'] as string[])[0].toLowerCase();
      assert.ok(setCookie.includes('httponly'));
      assert.ok(setCookie.includes('secure'));
      assert.ok(setCookie.includes('samesite=strict'));
      assert.ok(setCookie.includes('path=/'));
      assert.ok(setCookie.includes('max-age=28800'));
      assert.equal(setCookie.includes('domain='), false);
      const csrf = csrfToken(login);
      assert.equal(login.body.includes(TEST_PASSWORD), false);
      assert.equal(login.body.includes(passwordHash), false);
      assert.equal(login.body.includes(cookie.split('=')[1]), false);
      assert.equal(login.headers['cache-control'], 'no-store, max-age=0');

      const current = await harness.request('GET', '/api/auth/session', undefined, { cookie });
      assert.equal(current.status, 200);
      assert.equal(current.json?.authenticated, true);
      assert.equal(current.json?.csrfToken, csrf);
      assert.equal(current.headers['cache-control'], 'no-store, max-age=0');

      const anonymous = await harness.request('GET', '/api/auth/session');
      assert.equal(anonymous.status, 401);
      assert.equal(anonymous.json?.error?.code, 'SESSION_REQUIRED');
    } finally { await harness.close(); }
  });

  await t.test('invalid credentials return a uniform failure without creating a cookie', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x32));
    const harness = await createHarness({ passwordHash });
    try {
      const result = await harness.request('POST', '/api/auth/login', { password: 'wrong-password-value' });
      assert.equal(result.status, 401);
      assert.equal(result.json?.error?.code, 'INVALID_CREDENTIALS');
      assert.equal(result.headers['set-cookie'], undefined);
      assert.equal(result.body.includes(TEST_PASSWORD), false);
      assert.equal(result.body.includes(passwordHash), false);
    } finally { await harness.close(); }
  });

  await t.test('login failures are rate limited and the window resets after 15 minutes', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x33));
    let now = 1_800_000_000_000;
    const harness = await createHarness({ passwordHash, now: () => now });
    try {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const result = await harness.request('POST', '/api/auth/login', { password: 'wrong-password-value' });
        assert.equal(result.status, 401);
        assert.equal(result.json?.error?.code, 'INVALID_CREDENTIALS');
      }
      const fifth = await harness.request('POST', '/api/auth/login', { password: 'wrong-password-value' });
      assert.equal(fifth.status, 429);
      assert.equal(fifth.json?.error?.code, 'RATE_LIMITED');
      const sixth = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(sixth.status, 429);

      now += 15 * 60 * 1000;
      const recovered = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(recovered.status, 200);
      assert.equal(recovered.json?.authenticated, true);
    } finally { await harness.close(); }
  });

  await t.test('login rotates an existing session; logout requires CSRF and revokes it', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x34));
    const harness = await createHarness({ passwordHash });
    try {
      const firstLogin = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(firstLogin.status, 200);
      const firstCookie = sessionCookie(firstLogin);

      const secondLogin = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD }, { cookie: firstCookie });
      assert.equal(secondLogin.status, 200);
      const secondCookie = sessionCookie(secondLogin);
      assert.notEqual(firstCookie, secondCookie);

      const oldSession = await harness.request('GET', '/api/auth/session', undefined, { cookie: firstCookie });
      assert.equal(oldSession.status, 401);

      const newCsrf = csrfToken(secondLogin);
      const missingCsrf = await harness.request('POST', '/api/auth/logout', {}, { cookie: secondCookie });
      assert.equal(missingCsrf.status, 403);
      assert.equal(missingCsrf.json?.error?.code, 'CSRF_INVALID');

      const wrongCsrf = await harness.request('POST', '/api/auth/logout', {}, {
        cookie: secondCookie, 'x-csrf-token': 'A'.repeat(43),
      });
      assert.equal(wrongCsrf.status, 403);
      assert.equal(wrongCsrf.json?.error?.code, 'CSRF_INVALID');

      const logout = await harness.request('POST', '/api/auth/logout', {}, {
        cookie: secondCookie, 'x-csrf-token': newCsrf,
      });
      assert.equal(logout.status, 200);
      assert.equal(logout.json?.authenticated, false);
      const cleared = (logout.headers['set-cookie'] as string[])[0].toLowerCase();
      assert.ok(cleared.includes('max-age=0'));
      assert.ok(cleared.includes('httponly'));
      assert.ok(cleared.includes('secure'));
      assert.ok(cleared.includes('samesite=strict'));

      const revoked = await harness.request('GET', '/api/auth/session', undefined, { cookie: secondCookie });
      assert.equal(revoked.status, 401);
    } finally { await harness.close(); }
  });

  await t.test('idle timeout and absolute timeout are enforced independently', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x35));
    let now = 1_810_000_000_000;
    const harness = await createHarness({ passwordHash, now: () => now });
    try {
      const login = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      const cookie = sessionCookie(login);

      now += 59 * 60 * 1000;
      const refreshed = await harness.request('GET', '/api/auth/session', undefined, { cookie });
      assert.equal(refreshed.status, 200);

      now += 60 * 60 * 1000;
      const idleExpired = await harness.request('GET', '/api/auth/session', undefined, { cookie });
      assert.equal(idleExpired.status, 401);
      assert.equal(idleExpired.json?.error?.code, 'SESSION_REQUIRED');

      const secondLogin = await harness.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(secondLogin.status, 200);
      const secondCookie = sessionCookie(secondLogin);

      // Keep the session active while advancing close to its absolute deadline.
      let remainingToAbsoluteMinusOneMinute = OPERATOR_SESSION_ABSOLUTE_MS - 60 * 1000;
      while (remainingToAbsoluteMinusOneMinute > 0) {
        const step = Math.min(59 * 60 * 1000, remainingToAbsoluteMinusOneMinute);
        now += step;
        remainingToAbsoluteMinusOneMinute -= step;
        const refreshed = await harness.request('GET', '/api/auth/session', undefined, { cookie: secondCookie });
        assert.equal(refreshed.status, 200, 'session must remain alive while idle time is refreshed');
      }

      now += 60 * 1000;
      const absoluteExpired = await harness.request('GET', '/api/auth/session', undefined, { cookie: secondCookie });
      assert.equal(absoluteExpired.status, 401);
      assert.equal(absoluteExpired.json?.error?.code, 'SESSION_REQUIRED');
    } finally { await harness.close(); }
  });

  await t.test('sessions are lost when the BFF process/service is recreated', async () => {
    const passwordHash = await hashOperatorPassword(TEST_PASSWORD, Buffer.alloc(16, 0x36));
    const first = await createHarness({ passwordHash });
    let cookie = '';
    try {
      const login = await first.request('POST', '/api/auth/login', { password: TEST_PASSWORD });
      assert.equal(login.status, 200);
      cookie = sessionCookie(login);
    } finally { await first.close(); }

    const restarted = await createHarness({ passwordHash });
    try {
      const result = await restarted.request('GET', '/api/auth/session', undefined, { cookie });
      assert.equal(result.status, 401);
      assert.equal(result.json?.error?.code, 'SESSION_REQUIRED');
    } finally { await restarted.close(); }
  });
});
