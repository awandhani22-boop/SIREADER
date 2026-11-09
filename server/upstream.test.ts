/**
 * SIREADER Phase 3.2 — Upstream proxy security tests.
 * Uses only a local mock HTTP server. No real Python API or Supabase calls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { createBffApp } from './app.ts';
import { createUpstreamHandlers, UPSTREAM_API_PATHS, type UpstreamApiPath } from './upstream.ts';

interface HttpResult {
  status: number;
  body: string;
  json: any;
}

const HEADERS = {
  host: '127.0.0.1:3000',
  origin: 'http://127.0.0.1:3000',
  'sec-fetch-site': 'same-origin',
};

const FIXTURES: Record<UpstreamApiPath, unknown> = {
  '/api/v1/system/status': {
    api_status: 'HEALTHY',
    database_status: 'CONNECTED',
    server_time_utc: '2026-11-08T00:00:00Z',
    runtime_control: null,
    process_monitoring_note: 'Worker OS liveness is unmonitored.',
  },
  '/api/v1/telemetry/usage': {
    period_start: '2026-11-02',
    period_end: '2026-11-08',
    period_days: 7,
    currencies: [],
    models: [],
  },
  '/api/v1/pipeline/active': {
    server_time_utc: '2026-11-08T00:00:00Z',
    total_in_flight: 0,
    total_queued: 0,
    in_flight_tasks: [],
    queued_messages: [],
  },
  '/api/v1/market-watches/active': {
    server_time_utc: '2026-11-08T00:00:00Z',
    total_active_watches: 0,
    watches: [],
  },
  '/api/v1/audit/decisions': {
    server_time_utc: '2026-11-08T00:00:00Z',
    total_returned: 0,
    offset: 0,
    decisions: [],
  },
  '/api/v1/workforce/runtime': {
    server_time_utc: '2026-11-09T00:00:00Z',
    runtime: {
      observed_at: '2026-11-09T00:00:00Z', configured_workers: 7,
      ready_workers: 0, stale_workers: 0, offline_workers: 7,
      active_tasks: 0, queued_tasks: 0, waiting_review_tasks: 0,
      dead_lettered_tasks: 0, completed_last_24h: 0,
    },
    workers: [{
      worker_id: 'haiku', display_name: 'Haiku Worker',
      role: 'Fast Research & Intake Specialist', department: 'Research',
      enabled: true, accepting_tasks: true, max_concurrency: 2, model_tier: 'FAST',
      capability_ids: ['quick_research', 'summarization'],
      process_status: 'OFFLINE', heartbeat_at: null,
      active_task_count: 0, in_flight_provider_requests: 0,
      schema_version: 1, created_at: '2026-11-09T00:00:00Z',
      updated_at: '2026-11-09T00:00:00Z',
    }],
  },
  '/api/v1/workforce/tasks': {
    server_time_utc: '2026-11-09T00:00:00Z',
    total_count: 0, limit: 50, offset: 0, tasks: [],
  },
  '/api/v1/workforce/attempts': {
    server_time_utc: '2026-11-09T00:00:00Z',
    task_id: 'task_12345678', attempts: [],
  },
  '/api/v1/workforce/activity': {
    server_time_utc: '2026-11-09T00:00:00Z',
    total_count: 0, limit: 50, offset: 0, events: [],
  },
};

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(
  server: Server,
  path: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { ...HEADERS, ...headers },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
          let json: any = null;
          try { json = JSON.parse(body); } catch { /* handled by assertions */ }
          resolve({ status: res.statusCode || 0, body, json });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function createProxyServer(
  baseUrl: string,
  options: {
    timeoutMs?: number;
    token?: string | undefined;
  } = {},
): Server {
  const app = createBffApp(undefined, {
    baseUrl,
    timeoutMs: options.timeoutMs,
    tokenProvider: () => Object.prototype.hasOwnProperty.call(options, 'token') ? options.token : 'test-server-bearer-token',
    requireOperatorSession: (_req, _res, next) => next(),
  });
  return http.createServer(app);
}

test('SIREADER bounded upstream proxy — local mock integration', async (t) => {
  type Mode =
    | 'normal'
    | 'redirect'
    | 'http-error'
    | 'auth-error'
    | 'wrong-content-type'
    | 'invalid-json'
    | 'invalid-schema'
    | 'extra-schema'
    | 'oversized'
    | 'delay';

  let mode: Mode = 'normal';
  let upstreamOrigin = '';
  let redirectHits = 0;
  const received: Array<{ path: string; headers: http.IncomingHttpHeaders }> = [];

  const mock = http.createServer((req, res) => {
    if (req.url === '/redirect-target') {
      redirectHits += 1;
      res.setHeader('content-type', 'application/json');
      res.end('{}');
      return;
    }

    received.push({ path: req.url || '', headers: req.headers });

    if (mode === 'delay') {
      setTimeout(() => {
        if (!res.destroyed) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(FIXTURES['/api/v1/system/status']));
        }
      }, 180);
      return;
    }

    if (mode === 'redirect') {
      res.statusCode = 302;
      res.setHeader('location', upstreamOrigin + '/redirect-target');
      res.end('redirect');
      return;
    }
    if (mode === 'http-error') {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end('{"debug":"upstream-secret-marker"}');
      return;
    }
    if (mode === 'auth-error') {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end('{"detail":"invalid token"}');
      return;
    }
    if (mode === 'wrong-content-type') {
      res.setHeader('content-type', 'text/html');
      res.end('<html>not json</html>');
      return;
    }
    if (mode === 'invalid-json') {
      res.setHeader('content-type', 'application/json');
      res.end('{not-json');
      return;
    }
    if (mode === 'invalid-schema') {
      res.setHeader('content-type', 'application/json');
      res.end('{"unexpected":"shape"}');
      return;
    }
    if (mode === 'extra-schema') {
      const system = FIXTURES['/api/v1/system/status'] as Record<string, unknown>;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ...system, unexpected_internal_field: 'must-not-leak' }));
      return;
    }
    if (mode === 'oversized') {
      res.setHeader('content-type', 'application/json');
      res.write(new Uint8Array(512 * 1024).fill(0x20));
      res.write(new Uint8Array(512 * 1024).fill(0x20));
      res.end(new Uint8Array(2).fill(0x20));
      return;
    }

    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const path = requestUrl.pathname;
    const attemptsQueryValid =
      path === '/api/v1/workforce/attempts' &&
      requestUrl.searchParams.get('task_id') === 'task_12345678' &&
      [...requestUrl.searchParams.keys()].length === 1;
    const taskQueryValid =
      path === '/api/v1/workforce/tasks' &&
      [...requestUrl.searchParams.keys()].every((key) => key === 'limit' || key === 'offset') &&
      [...requestUrl.searchParams.keys()].length === 2 &&
      /^(?:[1-9]|[1-9][0-9]|100)$/.test(requestUrl.searchParams.get('limit') || '') &&
      /^(?:0|[1-9][0-9]{0,5})$/.test(requestUrl.searchParams.get('offset') || '') &&
      Number(requestUrl.searchParams.get('offset')) <= 100_000;
    const payload = path === '/api/v1/workforce/attempts'
      ? (attemptsQueryValid ? FIXTURES[path as UpstreamApiPath] : undefined)
      : path === '/api/v1/workforce/tasks'
        ? (taskQueryValid
          ? {
              ...(FIXTURES[path as UpstreamApiPath] as Record<string, unknown>),
              limit: Number(requestUrl.searchParams.get('limit')),
              offset: Number(requestUrl.searchParams.get('offset')),
            }
          : undefined)
        : (requestUrl.search === '' ? FIXTURES[path as UpstreamApiPath] : undefined);
    if (payload === undefined) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  });

  await listen(mock);
  const mockPort = (mock.address() as AddressInfo).port;
  upstreamOrigin = 'http://127.0.0.1:' + mockPort;
  const proxy = createProxyServer(upstreamOrigin);
  await listen(proxy);
  t.after(async () => {
    await close(proxy);
    await close(mock);
  });

  await t.test('all nine allowlisted paths proxy and validate their backend DTO', async () => {
    mode = 'normal';
    assert.deepEqual([...UPSTREAM_API_PATHS], [
      '/api/v1/system/status',
      '/api/v1/telemetry/usage',
      '/api/v1/pipeline/active',
      '/api/v1/market-watches/active',
      '/api/v1/audit/decisions',
      '/api/v1/workforce/runtime',
      '/api/v1/workforce/tasks',
      '/api/v1/workforce/attempts',
      '/api/v1/workforce/activity',
    ]);
    for (const path of UPSTREAM_API_PATHS) {
      const requestPath = path === '/api/v1/workforce/attempts'
        ? path + '?task_id=task_12345678'
        : path;
      const result = await request(proxy, requestPath);
      assert.equal(result.status, 200, requestPath + ' should be proxied');
      assert.deepEqual(result.json, FIXTURES[path]);
    }
    assert.deepEqual(
      received.slice(-9).map((entry) => entry.path),
      [
        '/api/v1/system/status',
        '/api/v1/telemetry/usage',
        '/api/v1/pipeline/active',
        '/api/v1/market-watches/active',
        '/api/v1/audit/decisions',
        '/api/v1/workforce/runtime',
        '/api/v1/workforce/tasks?limit=50&offset=0',
        '/api/v1/workforce/attempts?task_id=task_12345678',
        '/api/v1/workforce/activity',
      ],
    );
  });

  await t.test('workforce attempts proxy requires one bounded task_id query', async () => {
    mode = 'normal';
    const before = received.length;
    const missing = await request(proxy, '/api/v1/workforce/attempts');
    const malformed = await request(proxy, '/api/v1/workforce/attempts?task_id=bad&extra=1');
    assert.equal(missing.status, 400);
    assert.equal(malformed.status, 400);
    assert.equal(received.length, before);
  });

  await t.test('workforce task pagination forwards only bounded limit and offset parameters', async () => {
    mode = 'normal';
    const valid = await request(proxy, '/api/v1/workforce/tasks?limit=25&offset=50');
    assert.equal(valid.status, 200);
    assert.equal(valid.json?.limit, 25);
    assert.equal(valid.json?.offset, 50);
    assert.equal(received[received.length - 1].path, '/api/v1/workforce/tasks?limit=25&offset=50');

    const beforeInvalid = received.length;
    const invalidLimit = await request(proxy, '/api/v1/workforce/tasks?limit=0&offset=0');
    const excessiveLimit = await request(proxy, '/api/v1/workforce/tasks?limit=101&offset=0');
    const excessiveOffset = await request(proxy, '/api/v1/workforce/tasks?limit=50&offset=100001');
    const unapprovedFilter = await request(proxy, '/api/v1/workforce/tasks?limit=50&offset=0&payload=secret');
    const duplicateParameter = await request(proxy, '/api/v1/workforce/tasks?limit=20&limit=30&offset=0');

    for (const result of [invalidLimit, excessiveLimit, excessiveOffset, unapprovedFilter, duplicateParameter]) {
      assert.equal(result.status, 400);
      assert.equal(result.json?.error?.code, 'BAD_REQUEST');
    }
    assert.equal(received.length, beforeInvalid);
  });

  await t.test('outbound request replaces browser credentials and forwards only server auth plus Accept', async () => {
    mode = 'normal';
    const result = await request(proxy, '/api/v1/system/status', {
      cookie: 'browser-session=do-not-forward',
      authorization: 'Bearer browser-token-must-not-forward',
      'x-forwarded-for': '203.0.113.10',
      'x-untrusted-custom': 'must-not-forward',
    });
    assert.equal(result.status, 200);
    const outbound = received[received.length - 1].headers;
    assert.equal(outbound.authorization, 'Bearer test-server-bearer-token');
    assert.equal(outbound.accept, 'application/json');
    assert.equal(outbound.cookie, undefined);
    assert.equal(outbound['x-forwarded-for'], undefined);
    assert.equal(outbound['x-untrusted-custom'], undefined);
    assert.notEqual(outbound.authorization, 'Bearer browser-token-must-not-forward');
  });

  await t.test('missing server token fails closed without contacting upstream', async () => {
    const noToken = createProxyServer(upstreamOrigin, { token: undefined });
    await listen(noToken);
    try {
      const before = received.length;
      const result = await request(noToken, '/api/v1/system/status');
      assert.equal(result.status, 503);
      assert.equal(result.json?.error?.code, 'UPSTREAM_AUTH_FAILED');
      assert.equal(received.length, before);
    } finally {
      await close(noToken);
    }
  });

  await t.test('rejects redirects without following Location', async () => {
    mode = 'redirect';
    const before = redirectHits;
    const result = await request(proxy, '/api/v1/system/status');
    assert.equal(result.status, 502);
    assert.equal(result.json?.error?.code, 'BACKEND_ERROR');
    assert.equal(redirectHits, before);
  });

  await t.test('maps upstream HTTP and authentication failures without exposing bodies', async () => {
    mode = 'http-error';
    const serverError = await request(proxy, '/api/v1/system/status');
    assert.equal(serverError.status, 502);
    assert.equal(serverError.json?.error?.code, 'BACKEND_ERROR');
    assert.equal(serverError.body.includes('upstream-secret-marker'), false);

    mode = 'auth-error';
    const authError = await request(proxy, '/api/v1/system/status');
    assert.equal(authError.status, 502);
    assert.equal(authError.json?.error?.code, 'UPSTREAM_AUTH_FAILED');
  });

  await t.test('rejects invalid content type, malformed JSON, and invalid DTO schema', async () => {
    mode = 'wrong-content-type';
    const contentType = await request(proxy, '/api/v1/system/status');
    assert.equal(contentType.status, 502);
    assert.equal(contentType.json?.error?.code, 'INVALID_UPSTREAM_CONTENT_TYPE');

    mode = 'invalid-json';
    const malformed = await request(proxy, '/api/v1/system/status');
    assert.equal(malformed.status, 502);
    assert.equal(malformed.json?.error?.code, 'SCHEMA_INVALID');

    mode = 'invalid-schema';
    const schema = await request(proxy, '/api/v1/system/status');
    assert.equal(schema.status, 502);
    assert.equal(schema.json?.error?.code, 'SCHEMA_INVALID');

    mode = 'extra-schema';
    const extra = await request(proxy, '/api/v1/system/status');
    assert.equal(extra.status, 502);
    assert.equal(extra.json?.error?.code, 'SCHEMA_INVALID');
    assert.equal(extra.body.includes('must-not-leak'), false);
  });

  await t.test('enforces streamed 1 MiB cap when content-length is absent', async () => {
    mode = 'oversized';
    const result = await request(proxy, '/api/v1/system/status');
    assert.equal(result.status, 502);
    assert.equal(result.json?.error?.code, 'TOO_LARGE');
  });

  await t.test('aborts an upstream request after configured timeout', async () => {
    mode = 'delay';
    const shortTimeout = createProxyServer(upstreamOrigin, { timeoutMs: 35 });
    await listen(shortTimeout);
    try {
      const result = await request(shortTimeout, '/api/v1/system/status');
      assert.equal(result.status, 504);
      assert.equal(result.json?.error?.code, 'TIMEOUT');
    } finally {
      await close(shortTimeout);
    }
  });

  await t.test('maps connection failure to safe UNREACHABLE envelope', async () => {
    const unavailable = createProxyServer('http://127.0.0.1:1');
    await listen(unavailable);
    try {
      const result = await request(unavailable, '/api/v1/system/status');
      assert.equal(result.status, 502);
      assert.equal(result.json?.error?.code, 'UNREACHABLE');
      assert.equal(result.body.includes('test-server-bearer-token'), false);
    } finally {
      await close(unavailable);
    }
  });

  await t.test('rejects non-loopback or non-HTTP upstream origins at construction', () => {
    assert.throws(() => createUpstreamHandlers({ baseUrl: 'http://localhost:8000' }));
    assert.throws(() => createUpstreamHandlers({ baseUrl: 'https://127.0.0.1:8000' }));
    assert.throws(() => createUpstreamHandlers({ baseUrl: 'http://127.0.0.1.evil.test:8000' }));
  });
});
