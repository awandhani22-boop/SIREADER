/** Phase 3.3 authenticated BFF event-stream proxy integration tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { createBffApp } from './app.ts';
import { isValidLastEventId, UPSTREAM_SSE_PATH } from './upstream.ts';

const VALID_HEADERS = {
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

function request(
  server: Server,
  options: { path?: string; method?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; json: any }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: options.path ?? UPSTREAM_SSE_PATH,
      method: options.method ?? 'GET',
      headers: { ...VALID_HEADERS, ...(options.headers ?? {}) },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        let json: any = null;
        try { json = JSON.parse(body); } catch { /* SSE body is not JSON. */ }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('Phase 3.3 BFF SSE proxy — authenticated fixed-path streaming', async (t) => {
  let received: { url: string; headers: Record<string, string | undefined>; signal?: AbortSignal } | null = null;
  let upstreamMode: 'stream' | 'wrong-type' | 'unavailable' | 'hold' = 'stream';
  let upstreamAbortCount = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    received = {
      url: String(input),
      headers: {
        authorization: headers.get('authorization') ?? undefined,
        accept: headers.get('accept') ?? undefined,
        'last-event-id': headers.get('last-event-id') ?? undefined,
        cookie: headers.get('cookie') ?? undefined,
        'x-forwarded-for': headers.get('x-forwarded-for') ?? undefined,
        'x-untrusted-custom': headers.get('x-untrusted-custom') ?? undefined,
      },
      signal: init?.signal as AbortSignal | undefined,
    };
    if (upstreamMode === 'unavailable') {
      return new Response('{"detail":"unavailable"}', {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (upstreamMode === 'wrong-type') {
      return new Response('<html>not event stream</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    const encoder = new TextEncoder();
    if (upstreamMode === 'hold') {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('retry: 3000\\n\\n'));
          init?.signal?.addEventListener('abort', () => {
            upstreamAbortCount += 1;
            try { controller.close(); } catch { /* Body was already cancelled. */ }
          }, { once: true });
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('retry: 3000\\n\\n'));
        controller.enqueue(encoder.encode('id: 00000000-0000-4000-8000-000000000001:1\\nevent: resources.invalidated\\ndata: {"schema_version":1,"occurred_at":"2026-11-09T00:00:00Z","resources":["pipeline"]}\\n\\n'));
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
  };

  const app = createBffApp(undefined, {
    baseUrl: 'http://127.0.0.1:8000',
    tokenProvider: () => 'test-server-only-token',
    fetchImpl,
    requireOperatorSession: (_req, _res, next) => next(),
  });
  const server = http.createServer(app);
  await listen(server);
  t.after(() => close(server));

  await t.test('stream is incremental SSE with strict server-only outbound headers', async () => {
    const cursor = '00000000-0000-4000-8000-000000000001:1';
    assert.equal(isValidLastEventId(cursor), true);
    const result = await request(server, {
      headers: {
        'last-event-id': cursor,
        cookie: '__Host-sireader_sid=browser-session-secret',
        authorization: 'Bearer browser-token-must-not-forward',
        'x-forwarded-for': '203.0.113.9',
        'x-untrusted-custom': 'no',
      },
    });
    assert.equal(result.status, 200);
    assert.match(result.headers['content-type'] ?? '', /^text\/event-stream/);
    assert.equal(result.headers['cache-control'], 'no-cache, no-transform');
    assert.equal(result.headers['x-accel-buffering'], 'no');
    assert.match(result.body, /retry: 3000/);
    assert.match(result.body, /event: resources\.invalidated/);
    assert.match(result.body, /"resources":\["pipeline"\]/);
    assert.equal(received?.url, 'http://127.0.0.1:8000/api/v1/events/stream');
    assert.equal(received?.headers.authorization, 'Bearer test-server-only-token');
    assert.equal(received?.headers.accept, 'text/event-stream');
    assert.equal(received?.headers['last-event-id'], cursor);
    assert.equal(received?.headers.cookie, undefined);
    assert.equal(received?.headers['x-forwarded-for'], undefined);
    assert.equal(received?.headers['x-untrusted-custom'], undefined);
    assert.notEqual(received?.headers.authorization, 'Bearer browser-token-must-not-forward');
  });

  await t.test('invalid Last-Event-ID is rejected before upstream contact', async () => {
    received = null;
    const result = await request(server, {
      headers: { 'last-event-id': 'arbitrary-header-value' },
    });
    assert.equal(result.status, 400);
    assert.equal(result.json?.error?.code, 'BAD_REQUEST');
    assert.equal(received, null);
  });

  await t.test('upstream non-SSE response is rejected without passing its body', async () => {
    upstreamMode = 'wrong-type';
    const result = await request(server);
    assert.equal(result.status, 502);
    assert.equal(result.json?.error?.code, 'INVALID_UPSTREAM_CONTENT_TYPE');
    assert.equal(result.body.includes('not event stream'), false);
  });

  await t.test('upstream unavailable maps to a safe retryable response', async () => {
    upstreamMode = 'unavailable';
    const result = await request(server);
    assert.equal(result.status, 503);
    assert.equal(result.json?.error?.code, 'UNREACHABLE');
    assert.equal(result.headers['retry-after'], '5');
    assert.equal(result.body.includes('{\"detail\":\"unavailable\"}'), false);
  });

  await t.test('browser disconnect aborts the upstream stream and releases the connection slot', async () => {
    upstreamMode = 'hold';

    const openAndAbort = () => new Promise<void>((resolve, reject) => {
      const port = (server.address() as AddressInfo).port;
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: UPSTREAM_SSE_PATH,
        method: 'GET',
        headers: { ...VALID_HEADERS },
      }, (res) => {
        res.once('data', () => {
          req.destroy();
          resolve();
        });
        res.on('error', () => undefined);
      });
      req.on('error', () => resolve());
      req.end();
    });

    const before = upstreamAbortCount;
    await openAndAbort();
    for (let attempt = 0; attempt < 20 && upstreamAbortCount === before; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(upstreamAbortCount, before + 1);
  });

  await t.test('BFF limits the number of simultaneous SSE connections', async () => {
    upstreamMode = 'hold';
    const opened: Array<{ req: http.ClientRequest; response: http.IncomingMessage }> = [];
    const openStream = () => new Promise<void>((resolve, reject) => {
      const port = (server.address() as AddressInfo).port;
      const req = http.request({
        hostname: '127.0.0.1', port, path: UPSTREAM_SSE_PATH,
        method: 'GET', headers: { ...VALID_HEADERS },
      }, (response) => {
        opened.push({ req, response });
        response.once('data', () => resolve());
        response.on('error', () => undefined);
      });
      req.on('error', reject);
      req.end();
    });

    try {
      for (let index = 0; index < 4; index += 1) await openStream();
      const overflow = await request(server);
      assert.equal(overflow.status, 503);
      assert.equal(overflow.json?.error?.code, 'UNREACHABLE');
      assert.equal(overflow.headers['retry-after'], '5');
    } finally {
      for (const item of opened) item.req.destroy();
      for (const item of opened) item.response.destroy();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
});

test('Phase 3.3 BFF stream remains behind operator session authentication', async (t) => {
  const app = createBffApp(undefined, {
    tokenProvider: () => 'must-not-be-used-without-session',
  });
  const server = http.createServer(app);
  await listen(server);
  t.after(() => close(server));
  const result = await request(server);
  assert.equal(result.status, 401);
  assert.equal(result.json?.error?.code, 'SESSION_REQUIRED');
});
