import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { createBffApp } from './app.ts';
import { createEventStreamProxyHandler, SSE_UPSTREAM_PATH } from './sse.ts';

const HEADERS = {
  host: '127.0.0.1:3000',
  origin: 'http://127.0.0.1:3000',
  'sec-fetch-site': 'same-origin',
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

test('SSE BFF proxy uses a fixed authenticated stream and preserves stream bytes', async (t) => {
  const received: Array<{ url: string; headers: Headers }> = [];
  const payload = 'retry: 3000\n\nevent: resources.invalidated\ndata: {"schema_version":1,"resources":["system"]}\n\n';
  const app = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: {
      tokenProvider: () => 'server-only-test-token',
      fetchImpl: async (input, init = {}) => {
        received.push({ url: String(input), headers: new Headers(init.headers) });
        return new Response(payload, {
          status: 200,
          headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        });
      },
    },
  });

  const proxy = http.createServer(app);
  await listen(proxy);
  t.after(async () => close(proxy));
  const port = (proxy.address() as AddressInfo).port;
  const response = await fetch('http://127.0.0.1:' + port + SSE_UPSTREAM_PATH, {
    headers: {
      ...HEADERS,
      accept: 'text/event-stream',
      cookie: 'operator-session=browser-only',
      authorization: 'Bearer browser-only',
      'last-event-id': '123e4567-e89b-12d3-a456-426614174000:7',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-cache, no-transform');
  assert.equal(response.headers.get('x-accel-buffering'), 'no');
  assert.equal(await response.text(), payload);
  assert.equal(received.length, 1);
  assert.equal(received[0].url.endsWith(SSE_UPSTREAM_PATH), true);
  assert.equal(received[0].headers.get('authorization'), 'Bearer server-only-test-token');
  assert.equal(received[0].headers.get('accept'), 'text/event-stream');
  assert.equal(received[0].headers.get('last-event-id'), '123e4567-e89b-12d3-a456-426614174000:7');
  assert.equal(received[0].headers.get('cookie'), null);
  assert.notEqual(received[0].headers.get('authorization'), 'Bearer browser-only');
});

test('SSE BFF rejects invalid cursors before contacting Python', async (t) => {
  let fetchCount = 0;
  const app = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: {
      tokenProvider: () => 'server-only-test-token',
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } });
      },
    },
  });
  const proxy = http.createServer(app);
  await listen(proxy);
  t.after(async () => close(proxy));
  const port = (proxy.address() as AddressInfo).port;
  const response = await fetch('http://127.0.0.1:' + port + SSE_UPSTREAM_PATH, {
    headers: { ...HEADERS, 'last-event-id': 'not-valid' },
  });
  assert.equal(response.status, 400);
  assert.equal(fetchCount, 0);
});

test('SSE BFF fails closed for wrong content type and missing server token', async (t) => {
  const wrongType = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: {
      tokenProvider: () => 'server-only-test-token',
      fetchImpl: async () => new Response('<html>wrong</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    },
  });
  const wrongServer = http.createServer(wrongType);
  await listen(wrongServer);
  const wrongPort = (wrongServer.address() as AddressInfo).port;

  const missingToken = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: { tokenProvider: () => undefined },
  });
  const missingServer = http.createServer(missingToken);
  await listen(missingServer);
  const missingPort = (missingServer.address() as AddressInfo).port;

  t.after(async () => {
    await close(wrongServer);
    await close(missingServer);
  });

  const wrong = await fetch('http://127.0.0.1:' + wrongPort + SSE_UPSTREAM_PATH, { headers: HEADERS });
  assert.equal(wrong.status, 503);
  assert.equal((await wrong.json() as { error: { code: string } }).error.code, 'BACKEND_ERROR');

  const missing = await fetch('http://127.0.0.1:' + missingPort + SSE_UPSTREAM_PATH, { headers: HEADERS });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json() as { error: { code: string } }).error.code, 'UPSTREAM_AUTH_FAILED');
});
