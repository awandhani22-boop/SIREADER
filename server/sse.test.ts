import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { createBffApp } from './app.ts';
import { hashOperatorPassword } from './auth.ts';
import { shutdownHttpServer } from './shutdown.ts';
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
  extraHeaders: Record<string, string> = {},
): Promise<{ request: http.ClientRequest; response: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { ...HEADERS, accept: 'text/event-stream', ...extraHeaders },
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
            controller.enqueue(encoder.encode('retry: 3000' + String.fromCharCode(10, 10)));
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


test('BFF shutdown closes active SSE clients and aborts upstream streams', async (t) => {
  const signals: AbortSignal[] = [];
  let upstreamCancelCount = 0;
  const encoder = new TextEncoder();

  const app = createBffApp(undefined, {
    requireOperatorSession: (_req, _res, next) => next(),
    eventStreamOptions: {
      tokenProvider: () => 'server-only-test-token',
      fetchImpl: async (_input, init = {}) => {
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
  t.after(async () => {
    if (proxy.listening) await close(proxy);
  });

  const active = await openStreamRequest(proxy, SSE_UPSTREAM_PATH);
  assert.equal(active.response.statusCode, 200);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, false);

  const upstreamAborted = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('BFF shutdown did not abort the active upstream SSE request.')),
      1_500,
    );
    signals[0].addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });

  const upstreamCancelled = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('BFF shutdown did not cancel the upstream SSE body.')),
      1_500,
    );
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

  // Observe the browser-side close event directly. The server's close callback
  // can run before the client socket has delivered its corresponding close event.
  const browserResponseClosed = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('BFF shutdown did not close the browser SSE response.')),
      1_500,
    );
    active.response.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  const serverClosed = new Promise<void>((resolve) => proxy.once('close', resolve));
  const shutdownCompleted = new Promise<void>((resolve) => {
    shutdownHttpServer(proxy, resolve);
  });

  await Promise.all([
    upstreamAborted,
    upstreamCancelled,
    browserResponseClosed,
    serverClosed,
    shutdownCompleted,
  ]);
  assert.equal(signals[0].aborted, true);
  assert.equal(upstreamCancelCount, 1);
});


test('BFF restart invalidates the old operator session and accepts a fresh authenticated SSE stream', async (t) => {
  const password = 'Integration-only-operator-password-2026!';
  const passwordHash = await hashOperatorPassword(password, Buffer.alloc(16, 0x41));
  const upstreamSignals: AbortSignal[] = [];
  let upstreamCancelCount = 0;
  const encoder = new TextEncoder();

  const createHarnessApp = () => createBffApp(undefined, {
    authOptions: { passwordHash },
    eventStreamOptions: {
      tokenProvider: () => 'server-only-test-token',
      fetchImpl: async (_input, init = {}) => {
        if (!init.signal) throw new Error('Expected an upstream AbortSignal.');
        upstreamSignals.push(init.signal);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('retry: 3000' + String.fromCharCode(10, 10)));
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

  const firstServer = http.createServer(createHarnessApp());
  await listen(firstServer);
  t.after(async () => {
    if (firstServer.listening) await close(firstServer);
  });

  const postLogin = (server: Server): Promise<{ status: number; cookie: string }> =>
    new Promise((resolve, reject) => {
      const port = (server.address() as AddressInfo).port;
      const body = JSON.stringify({ password });
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          ...HEADERS,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const cookies = res.headers['set-cookie'];
          const pair = Array.isArray(cookies) && cookies.length > 0
            ? cookies[0].split(';', 1)[0]
            : '';
          resolve({ status: res.statusCode || 0, cookie: pair });
        });
      });
      req.once('error', reject);
      req.end(body);
    });

  const getJson = (
    server: Server,
    path: string,
    cookie: string,
  ): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const port = (server.address() as AddressInfo).port;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { ...HEADERS, cookie },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      req.once('error', reject);
      req.end();
    });

  const loginOne = await postLogin(firstServer);
  assert.equal(loginOne.status, 200);
  assert.match(loginOne.cookie, /^__Host-sireader_sid=[A-Za-z0-9_-]{43}$/);

  const firstStream = await openStreamRequest(firstServer, SSE_UPSTREAM_PATH, {
    cookie: loginOne.cookie,
  });
  assert.equal(firstStream.response.statusCode, 200);
  assert.equal(upstreamSignals.length, 1);
  assert.equal(upstreamSignals[0].aborted, false);

  const firstStreamClosed = new Promise<void>((resolve) => {
    firstStream.response.once('close', resolve);
  });
  const firstUpstreamAborted = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('BFF restart did not abort the old authenticated SSE stream.')), 1_500);
    upstreamSignals[0].addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  const firstUpstreamCancelled = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('BFF restart did not cancel the old upstream body.')), 1_500);
    const check = () => {
      if (upstreamCancelCount >= 1) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 5);
      }
    };
    check();
  });

  const firstServerClosed = new Promise<void>((resolve) => firstServer.once('close', resolve));
  const firstShutdownFinished = new Promise<void>((resolve) => {
    shutdownHttpServer(firstServer, resolve);
  });
  await Promise.all([
    firstServerClosed,
    firstShutdownFinished,
    firstStreamClosed,
    firstUpstreamAborted,
    firstUpstreamCancelled,
  ]);
  assert.equal(upstreamSignals[0].aborted, true);
  assert.equal(upstreamCancelCount, 1);

  // A new createBffApp instance represents a fresh BFF process with an empty session Map.
  const restartedServer = http.createServer(createHarnessApp());
  await listen(restartedServer);
  t.after(async () => {
    if (restartedServer.listening) await close(restartedServer);
  });

  const staleSession = await getJson(restartedServer, '/api/auth/session', loginOne.cookie);
  assert.equal(staleSession.status, 401);
  assert.equal(JSON.parse(staleSession.body).error.code, 'SESSION_REQUIRED');

  const loginTwo = await postLogin(restartedServer);
  assert.equal(loginTwo.status, 200);
  assert.match(loginTwo.cookie, /^__Host-sireader_sid=[A-Za-z0-9_-]{43}$/);
  assert.notEqual(loginTwo.cookie, loginOne.cookie);

  const recoveredStream = await openStreamRequest(restartedServer, SSE_UPSTREAM_PATH, {
    cookie: loginTwo.cookie,
  });
  assert.equal(recoveredStream.response.statusCode, 200);
  assert.equal(upstreamSignals.length, 2);
  assert.equal(upstreamSignals[1].aborted, false);

  const recoveredAbort = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Recovered SSE stream cleanup timed out.')), 1_500);
    upstreamSignals[1].addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
  recoveredStream.response.destroy();
  await recoveredAbort;
  assert.equal(upstreamSignals[1].aborted, true);
});

