import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { createBffApp } from './app.ts';
import { SSE_UPSTREAM_PATH } from './sse.ts';

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

function request(server: Server, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { ...HEADERS, ...headers },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body,
      }));
    });
    req.on('error', reject);
    req.end();
  });
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
  const response = await request(proxy, SSE_UPSTREAM_PATH, {
    accept: 'text/event-stream',
    cookie: 'operator-session=browser-only',
    authorization: 'Bearer browser-only',
    'last-event-id': '123e4567-e89b-12d3-a456-426614174000:7',
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/event-stream; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-cache, no-transform');
  assert.equal(response.headers['x-accel-buffering'], 'no');
  assert.equal(response.body, payload);
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
  const response = await request(proxy, SSE_UPSTREAM_PATH, { 'last-event-id': 'not-valid' });
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


  const missingToken = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: { tokenProvider: () => undefined },
  });
  const missingServer = http.createServer(missingToken);
  await listen(missingServer);


  t.after(async () => {
    await close(wrongServer);
    await close(missingServer);
  });

  const wrong = await request(wrongServer, SSE_UPSTREAM_PATH);
  assert.equal(wrong.status, 503);
  assert.equal(JSON.parse(wrong.body).error.code, 'BACKEND_ERROR');

  const missing = await request(missingServer, SSE_UPSTREAM_PATH);
  assert.equal(missing.status, 503);
  assert.equal(JSON.parse(missing.body).error.code, 'UPSTREAM_AUTH_FAILED');
});


function openStreamRequest(
  server: Server,
  path: string,
): Promise<{ request: http.ClientRequest; response: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { ...HEADERS, accept: 'text/event-stream' },
    });
    req.once('response', (response) => resolve({ request: req, response }));
    req.once('error', reject);
    req.end();
  });
}

test('SSE BFF aborts upstream and releases stream capacity after browser disconnect', async (t) => {
  const signals: AbortSignal[] = [];
  let fetchCount = 0;
  let upstreamCancelCount = 0;
  const encoder = new TextEncoder();

  const app = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: {
      tokenProvider: () => 'server-only-test-token',
      maxConcurrentStreams: 1,
      fetchImpl: async (_input, init = {}) => {
        fetchCount += 1;
        if (!init.signal) throw new Error('Expected BFF AbortSignal.');
        signals.push(init.signal);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('retry: 3000\\n\\n'));
          },
          cancel() {
            upstreamCancelCount += 1;
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream; charset=utf-8' },
        });
      },
    },
  });

  const proxy = http.createServer(app);
  await listen(proxy);
  t.after(async () => close(proxy));

  const first = await openStreamRequest(proxy, SSE_UPSTREAM_PATH);
  assert.equal(first.response.statusCode, 200);
  assert.equal(fetchCount, 1);
  assert.equal(signals.length, 1);

  const atCapacity = await request(proxy, SSE_UPSTREAM_PATH);
  assert.equal(atCapacity.status, 503);
  assert.equal(atCapacity.headers['retry-after'], '3');
  assert.equal(fetchCount, 1, 'capacity rejection must not open another upstream request');

  const upstreamAborted = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('BFF did not abort the upstream after browser disconnect.')), 1_000);
    signals[0].addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  first.response.destroy();
  await upstreamAborted;
  assert.equal(signals[0].aborted, true);

  const upstreamCancelled = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('BFF did not cancel the upstream response body.')), 1_000);
    const check = () => {
      if (upstreamCancelCount > 0) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 5);
      }
    };
    check();
  });
  await upstreamCancelled;

  const recovered = await openStreamRequest(proxy, SSE_UPSTREAM_PATH);
  assert.equal(recovered.response.statusCode, 200, 'released capacity must accept a new stream');
  assert.equal(fetchCount, 2);
  assert.equal(signals.length, 2);

  const recoveredAbort = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Cleanup did not abort the recovered test stream.')), 1_000);
    signals[1].addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  recovered.response.destroy();
  await recoveredAbort;
});
