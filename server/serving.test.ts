import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import viteConfig from '../vite.config.ts';
import { createBffApp } from './app.ts';

interface HttpResult {
  readonly status: number;
  readonly headers: import('node:http').IncomingHttpHeaders;
  readonly body: string;
}

function request(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { host: '127.0.0.1:3000', ...headers },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function listen(app: ReturnType<typeof createBffApp>): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('SIREADER Batch 6 — static serving and Vite loopback proxy contract', async (t) => {
  await t.test('Vite binds to loopback/strict port and proxies only the /api namespace without rewriting Host', () => {
    const config = typeof viteConfig === 'function'
      ? (viteConfig as (env: { command: string; mode: string }) => import('vite').UserConfig)({
          command: 'serve',
          mode: 'development',
        })
      : viteConfig;
    const serverConfig = config.server;
    assert.equal(serverConfig?.host, '127.0.0.1');
    assert.equal(serverConfig?.port, 3000);
    assert.equal(serverConfig?.strictPort, true);

    const proxy = serverConfig?.proxy as Record<string, {
      target?: string;
      changeOrigin?: boolean;
      ws?: boolean;
    }>;
    assert.deepEqual(Object.keys(proxy), ['^/api(?:/|$)']);
    assert.equal(proxy['^/api(?:/|$)'].target, 'http://127.0.0.1:3001');
    assert.equal(proxy['^/api(?:/|$)'].changeOrigin, false);
    assert.equal(proxy['^/api(?:/|$)'].ws, false);

    assert.equal(config.preview?.host, '127.0.0.1');
    assert.equal(config.preview?.port, 4173);
    assert.equal(config.preview?.strictPort, true);
  });

  await t.test('production static server returns index, SPA routes and hashed assets with safe cache headers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sireader-dist-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><body>SIREADER OFFICE</body></html>');
    writeFileSync(join(root, 'assets', 'main-Abcdef12.js'), 'globalThis.sireaderLoaded=true;');
    writeFileSync(join(root, '.env'), 'DO_NOT_SERVE=this-is-a-test-secret');
    const app = createBffApp(undefined, { staticRoot: root });
    const server = await listen(app);
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    try {
      const rootPage = await request(address.port, '/', { accept: 'text/html' });
      assert.equal(rootPage.status, 200);
      assert.match(rootPage.body, /SIREADER OFFICE/);
      assert.match(String(rootPage.headers['content-type']), /text\/html/);
      assert.equal(rootPage.headers['cache-control'], 'no-store, max-age=0');
      assert.equal(rootPage.headers['x-content-type-options'], 'nosniff');

      const spaRoute = await request(address.port, '/office/worker/haiku', { accept: 'text/html' });
      assert.equal(spaRoute.status, 200);
      assert.match(spaRoute.body, /SIREADER OFFICE/);
      assert.equal(spaRoute.headers['cache-control'], 'no-store, max-age=0');

      const asset = await request(address.port, '/assets/main-Abcdef12.js');
      assert.equal(asset.status, 200);
      assert.equal(asset.body, 'globalThis.sireaderLoaded=true;');
      assert.match(String(asset.headers['content-type']), /javascript/);
      assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');

      const hidden = await request(address.port, '/.env');
      assert.equal(hidden.status, 404);
      assert.equal(hidden.body.includes('DO_NOT_SERVE'), false);

      const missingAsset = await request(address.port, '/assets/missing.js');
      assert.equal(missingAsset.status, 404);
      assert.equal(missingAsset.body.includes('SIREADER OFFICE'), false);

      for (const header of Object.keys(rootPage.headers)) {
        assert.equal(header.startsWith('access-control-'), false);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('unknown API paths never fall through to the SPA index document', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sireader-api-fallback-'));
    writeFileSync(join(root, 'index.html'), '<html>SHOULD_NOT_BE_AN_API_RESPONSE</html>');
    const server = await listen(createBffApp(undefined, { staticRoot: root }));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    try {
      const response = await request(address.port, '/api/v1/not-allowlisted', {
        accept: 'text/html',
        'sec-fetch-site': 'same-origin',
        origin: 'http://127.0.0.1:3000',
      });
      assert.equal(response.status, 404);
      assert.match(response.headers['content-type'] ?? '', /application\/json/);
      assert.match(response.body, /NOT_FOUND/);
      assert.equal(response.body.includes('SHOULD_NOT_BE_AN_API_RESPONSE'), false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  });

  await t.test('static serving fails closed when the production dist index is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'sireader-no-dist-'));
    try {
      assert.throws(
        () => createBffApp(undefined, { staticRoot: root }),
        /Static frontend is unavailable/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
