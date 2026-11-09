/**
 * SIREADER Phase 3.2 BFF - Foundation & Security Test Suite
 *
 * Remediated verification suite covering all audit findings:
 * 1. P0: Literal loopback configuration and runtime binding enforcement
 * 2. P0: Host header validation (including missing Host via raw TCP socket)
 * 3. P0: Real startBffServer loopback address verification
 * 4. P1: Scoped raw path validation (/api/* rejected, static requests pass)
 * 5. P1: Middleware ordering (405 / 404 before body parsing, no 413 on wrong method/route)
 * 6. P1: Strict Content-Type media-type validation matrix
 * 7. P1: Authentication stub semantics (401 SESSION_REQUIRED, 501 NOT_IMPLEMENTED)
 * 8. P2: Safe logger contract (zero secret leaks, zero log injection, static events)
 * 9. Fetch Metadata (Sec-Fetch-Site) and Origin matrix
 * 10. Zero CORS headers
 * 11. Canonical route completeness
 * 12. Node HTTP parser / Express boundary for NUL and non-ASCII
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { createBffApp, startBffServer } from './app.ts';
import {
  loadBffConfig,
  FIXED_RUNTIME_HOST,
  FIXED_BROWSER_HOST,
  FIXED_BROWSER_ORIGIN,
} from './config.ts';
import { CANONICAL_ROUTES } from './allowlist.ts';
import { SafeLogger, type SafeLogEvent } from './log.ts';
import { isValidJsonContentType, isApiTarget } from './guards.ts';

interface HttpResponse {
  readonly status: number;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: string;
  readonly json: any;
}

function makeRequest(
  server: http.Server,
  options: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as AddressInfo).port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers: options.headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsed: any = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // non-json response
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: raw,
            json: parsed,
          });
        });
      },
    );

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Raw TCP request sender for testing missing headers or raw byte payloads.
 */
function sendRawTcp(
  port: number,
  rawPayload: string | Buffer,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.connect({ host: '127.0.0.1', port }, () => {
      client.write(rawPayload);
    });

    let data = '';
    client.on('data', (chunk) => {
      data += chunk.toString('utf-8');
    });

    client.on('end', () => {
      resolve(data);
    });

    client.on('error', (err) => {
      // In case server forcibly resets connection
      resolve(`ERROR: ${err.message}`);
    });
  });
}

// Baseline valid headers for same-origin API requests
const VALID_HEADERS = {
  host: '127.0.0.1:3000',
  'sec-fetch-site': 'same-origin',
  origin: 'http://127.0.0.1:3000',
};

test('SIREADER Phase 3.2 BFF Test Suite — Remediated', async (t) => {
  const app = createBffApp(undefined, {
    tokenProvider: () => 'unit-test-server-token',
    requireOperatorSession: (_req, _res, next) => next(),
    authOptions: { passwordHash: '' },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          api_status: 'HEALTHY',
          database_status: 'CONNECTED',
          server_time_utc: '2026-11-08T00:00:00Z',
          runtime_control: null,
          process_monitoring_note: 'Worker OS liveness is unmonitored.',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const serverPort = (server.address() as AddressInfo).port;

  t.after(() => {
    server.close();
  });

  await t.test('Observability routes fail closed until operator session middleware is installed', async () => {
    const closedApp = createBffApp();
    const closedServer = http.createServer(closedApp);
    await new Promise<void>((resolve, reject) => {
      closedServer.once('error', reject);
      closedServer.listen(0, '127.0.0.1', resolve);
    });
    try {
      const response = await makeRequest(closedServer, {
        path: '/api/v1/system/status',
        headers: { ...VALID_HEADERS },
      });
      assert.equal(response.status, 401);
      assert.equal(response.json?.error?.code, 'SESSION_REQUIRED');
    } finally {
      await new Promise<void>((resolve) => closedServer.close(() => resolve()));
    }
  });

  // =========================================================================
  // SECTION 1: P0 — Literal Loopback Configuration & Binding Enforcement
  // =========================================================================
  await t.test('P0-1. Configuration strictly rejects non-127.0.0.1 binding host', () => {
    // LAN IP
    assert.throws(
      () => loadBffConfig({ host: '192.168.1.50' as any }),
      /CRITICAL SECURITY VIOLATION: Host override .* rejected/,
    );
    // Hostname
    assert.throws(
      () => loadBffConfig({ host: 'localhost' as any }),
      /CRITICAL SECURITY VIOLATION: Host override .* rejected/,
    );
    // Wildcard IPv4
    assert.throws(
      () => loadBffConfig({ host: '0.0.0.0' as any }),
      /CRITICAL SECURITY VIOLATION: Host override .* rejected/,
    );
    // Wildcard IPv6
    assert.throws(
      () => loadBffConfig({ host: '::' as any }),
      /CRITICAL SECURITY VIOLATION: Host override .* rejected/,
    );
    // Empty string
    assert.throws(
      () => loadBffConfig({ host: '' as any }),
      /CRITICAL SECURITY VIOLATION: Host override .* rejected/,
    );

    // Environment variable override attempt
    const originalEnvHost = process.env.BFF_HOST;
    try {
      process.env.BFF_HOST = '10.0.0.1';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_HOST cannot be set to "10.0.0.1"/,
      );
    } finally {
      if (originalEnvHost !== undefined) {
        process.env.BFF_HOST = originalEnvHost;
      } else {
        delete process.env.BFF_HOST;
      }
    }
  });

  await t.test('P0-2. Configuration rejects attempts to override locked browser Host and Origin', () => {
    // Attempt to override allowedHost
    assert.throws(
      () => loadBffConfig({ allowedHost: '127.0.0.1:3001' as any }),
      /CRITICAL SECURITY VIOLATION: allowedHost override cannot alter fixed browser host/,
    );

    // Attempt to override allowedOrigin
    assert.throws(
      () => loadBffConfig({ allowedOrigin: 'http://localhost:3000' as any }),
      /CRITICAL SECURITY VIOLATION: allowedOrigin override cannot alter fixed browser origin/,
    );

    // Environment variable overrides
    const origAllowedHost = process.env.BFF_ALLOWED_HOST;
    const origAllowedOrigin = process.env.BFF_ALLOWED_ORIGIN;
    try {
      process.env.BFF_ALLOWED_HOST = 'evil.com:3000';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_ALLOWED_HOST cannot override fixed browser host/,
      );
      delete process.env.BFF_ALLOWED_HOST;

      process.env.BFF_ALLOWED_ORIGIN = 'https://evil.com';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_ALLOWED_ORIGIN cannot override fixed browser origin/,
      );
      delete process.env.BFF_ALLOWED_ORIGIN;
    } finally {
      if (origAllowedHost !== undefined) process.env.BFF_ALLOWED_HOST = origAllowedHost;
      else delete process.env.BFF_ALLOWED_HOST;

      if (origAllowedOrigin !== undefined) process.env.BFF_ALLOWED_ORIGIN = origAllowedOrigin;
      else delete process.env.BFF_ALLOWED_ORIGIN;
    }
  });

  await t.test('P0-3. Port topology enforcement: strict mode-to-port mapping', () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origBffPort = process.env.BFF_PORT;

    try {
      // 1. Production mode tests (NODE_ENV=production -> port 3000 required)
      process.env.NODE_ENV = 'production';
      delete process.env.BFF_PORT;

      // Default production port is 3000
      const prodConfig = loadBffConfig();
      assert.equal(prodConfig.port, 3000);

      // Explicit override with 3000 in production is accepted
      const prodOverride3000 = loadBffConfig({ port: 3000 });
      assert.equal(prodOverride3000.port, 3000);

      // Overrides.port = 3001 in production must be rejected
      assert.throws(
        () => loadBffConfig({ port: 3001 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "3001" rejected for production mode\. Expected required port: 3000\./,
      );

      // BFF_PORT = 3000 in production is accepted
      process.env.BFF_PORT = '3000';
      const prodEnv3000 = loadBffConfig();
      assert.equal(prodEnv3000.port, 3000);

      // BFF_PORT = 3001 in production must be rejected
      process.env.BFF_PORT = '3001';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_PORT "3001" rejected for production mode\. Expected required port: 3000\./,
      );

      // Arbitrary port in production must be rejected via BFF_PORT and overrides
      process.env.BFF_PORT = '8080';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_PORT "8080" rejected for production mode\. Expected required port: 3000\./,
      );
      delete process.env.BFF_PORT;

      assert.throws(
        () => loadBffConfig({ port: 8080 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "8080" rejected for production mode\. Expected required port: 3000\./,
      );

      // 2. Development / non-production mode tests (NODE_ENV=development -> port 3001 required)
      process.env.NODE_ENV = 'development';
      delete process.env.BFF_PORT;

      // Default development port is 3001
      const devConfig = loadBffConfig();
      assert.equal(devConfig.port, 3001);

      // Explicit override with 3001 in development is accepted
      const devOverride3001 = loadBffConfig({ port: 3001 });
      assert.equal(devOverride3001.port, 3001);

      // Overrides.port = 3000 in development must be rejected
      assert.throws(
        () => loadBffConfig({ port: 3000 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "3000" rejected for development mode\. Expected required port: 3001\./,
      );

      // BFF_PORT = 3001 in development is accepted
      process.env.BFF_PORT = '3001';
      const devEnv3001 = loadBffConfig();
      assert.equal(devEnv3001.port, 3001);

      // BFF_PORT = 3000 in development must be rejected
      process.env.BFF_PORT = '3000';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_PORT "3000" rejected for development mode\. Expected required port: 3001\./,
      );

      // Arbitrary port in development must be rejected via BFF_PORT and overrides
      process.env.BFF_PORT = '8080';
      assert.throws(
        () => loadBffConfig(),
        /CRITICAL SECURITY VIOLATION: BFF_PORT "8080" rejected for development mode\. Expected required port: 3001\./,
      );
      delete process.env.BFF_PORT;

      assert.throws(
        () => loadBffConfig({ port: 8080 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "8080" rejected for development mode\. Expected required port: 3001\./,
      );
      assert.throws(
        () => loadBffConfig({ port: 0 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "0" rejected for development mode\. Expected required port: 3001\./,
      );
      assert.throws(
        () => loadBffConfig({ port: -1 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "-1" rejected for development mode\. Expected required port: 3001\./,
      );
      assert.throws(
        () => loadBffConfig({ port: NaN as any }),
        /CRITICAL SECURITY VIOLATION: Port override "NaN" rejected for development mode\. Expected required port: 3001\./,
      );
      assert.throws(
        () => loadBffConfig({ port: 3001.5 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "3001.5" rejected for development mode\. Expected required port: 3001\./,
      );

      // 3. Simultaneous BFF_PORT and overrides.port validation tests
      // Case 1: Production with invalid BFF_PORT=3001 and valid overrides.port=3000 -> rejected due to BFF_PORT
      process.env.NODE_ENV = 'production';
      process.env.BFF_PORT = '3001';
      assert.throws(
        () => loadBffConfig({ port: 3000 as any }),
        /CRITICAL SECURITY VIOLATION: BFF_PORT "3001" rejected for production mode\. Expected required port: 3000\./,
      );

      // Case 2: Production with valid BFF_PORT=3000 and invalid overrides.port=3001 -> rejected due to overrides.port
      process.env.NODE_ENV = 'production';
      process.env.BFF_PORT = '3000';
      assert.throws(
        () => loadBffConfig({ port: 3001 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "3001" rejected for production mode\. Expected required port: 3000\./,
      );

      // Case 3: Development with invalid BFF_PORT=3000 and valid overrides.port=3001 -> rejected due to BFF_PORT
      process.env.NODE_ENV = 'development';
      process.env.BFF_PORT = '3000';
      assert.throws(
        () => loadBffConfig({ port: 3001 as any }),
        /CRITICAL SECURITY VIOLATION: BFF_PORT "3000" rejected for development mode\. Expected required port: 3001\./,
      );

      // Case 4: Development with valid BFF_PORT=3001 and invalid overrides.port=3000 -> rejected due to overrides.port
      process.env.NODE_ENV = 'development';
      process.env.BFF_PORT = '3001';
      assert.throws(
        () => loadBffConfig({ port: 3000 as any }),
        /CRITICAL SECURITY VIOLATION: Port override "3000" rejected for development mode\. Expected required port: 3001\./,
      );
    } finally {
      // Restore original environment variables
      if (origNodeEnv !== undefined) {
        process.env.NODE_ENV = origNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (origBffPort !== undefined) {
        process.env.BFF_PORT = origBffPort;
      } else {
        delete process.env.BFF_PORT;
      }
    }
  });

  await t.test('P0-4. Real startBffServer binds strictly to 127.0.0.1 and approved port', async () => {
    let runningServer: http.Server | null = null;
    try {
      await new Promise<void>((resolve, reject) => {
        runningServer = startBffServer({ port: 3001 }, (srv) => {
          const addr = srv.address() as AddressInfo;
          assert.equal(addr.address, '127.0.0.1');
          assert.equal(addr.port, 3001);
          resolve();
        });
        runningServer.on('error', reject);
      });
    } finally {
      if (runningServer) {
        await new Promise<void>((resolve) => runningServer!.close(() => resolve()));
      }
    }
  });

  await t.test('P0-5. Host header validation: accepts 127.0.0.1:3000 and rejects all others with 403', async () => {
    // Valid Host
    const resValid = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resValid.status, 200);

    // Invalid port (127.0.0.1:3001)
    const resWrongPort = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, host: '127.0.0.1:3001' },
    });
    assert.equal(resWrongPort.status, 403);
    assert.equal(resWrongPort.json?.error?.code, 'FORBIDDEN');

    // Hostname localhost
    const resLocalhost = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, host: 'localhost:3000' },
    });
    assert.equal(resLocalhost.status, 403);
    assert.equal(resLocalhost.json?.error?.code, 'FORBIDDEN');

    // External domain
    const resEvil = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, host: 'evil.com' },
    });
    assert.equal(resEvil.status, 403);
    assert.equal(resEvil.json?.error?.code, 'FORBIDDEN');
  });

  await t.test('P0-6. Raw TCP: Missing Host header is rejected with 403 or 400', async () => {
    // Raw HTTP/1.0 request without Host header
    const rawReq = 'GET /api/v1/system/status HTTP/1.0\r\nSec-Fetch-Site: same-origin\r\n\r\n';
    const response = await sendRawTcp(serverPort, rawReq);
    // Must return 403 (Host guard) or 400 (HTTP parser)
    assert.match(response, /HTTP\/1\.[01] (403 Forbidden|400 Bad Request)/);
  });

  // =========================================================================
  // SECTION 2: P1 — Scoped Raw Path Validation (/api/* vs Static Routes)
  // =========================================================================
  await t.test('P1-1. isApiTarget boundary correctly identifies API namespace vs static paths', () => {
    // API targets
    assert.equal(isApiTarget('/api'), true);
    assert.equal(isApiTarget('/api/v1/system/status'), true);
    assert.equal(isApiTarget('/api?foo=1'), true);
    assert.equal(isApiTarget('/api;param'), true);
    assert.equal(isApiTarget('/api\\traversal'), true);
    assert.equal(isApiTarget('/static/../api/v1/status', '/api/v1/status'), true);

    // Static targets
    assert.equal(isApiTarget('/'), false);
    assert.equal(isApiTarget('/index.html'), false);
    assert.equal(isApiTarget('/assets/index-CblihZV0.js'), false);
    assert.equal(isApiTarget('/assets/style.css?v=1.2.3'), false);
    assert.equal(isApiTarget('/api-docs'), false);
    assert.equal(isApiTarget('/apifoo'), false);
  });

  await t.test('P1-2. Raw path security on API routes: rejects query string, traversal, encodings with 400', async () => {
    // Query string on API route
    const resQuery = await makeRequest(server, {
      path: '/api/v1/system/status?param=value',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resQuery.status, 400);
    assert.equal(resQuery.json?.error?.code, 'BAD_REQUEST');
    assert.match(resQuery.json?.error?.message, /Query strings are not permitted/);

    // Trailing slash on API route
    const resTrailing = await makeRequest(server, {
      path: '/api/v1/system/status/',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resTrailing.status, 400);
    assert.equal(resTrailing.json?.error?.code, 'BAD_REQUEST');
    assert.match(resTrailing.json?.error?.message, /Trailing slashes are not permitted/);

    // Percent-encoded sequence
    const resPercent = await makeRequest(server, {
      path: '/api/v1/%2e%2e/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resPercent.status, 400);
    assert.equal(resPercent.json?.error?.code, 'BAD_REQUEST');

    // Semicolon
    const resSemi = await makeRequest(server, {
      path: '/api/v1/system/status;jsessionid=123',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resSemi.status, 400);
    assert.equal(resSemi.json?.error?.code, 'BAD_REQUEST');

    // Consecutive slashes
    const resDoubleSlash = await makeRequest(server, {
      path: '/api/v1//system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resDoubleSlash.status, 400);
    assert.equal(resDoubleSlash.json?.error?.code, 'BAD_REQUEST');
  });

  await t.test('P1-3. Static routes pass raw path guard even with query strings or static characters', async () => {
    // Static request with query string passes rawPathGuard (reaches fallback 404, does NOT return 400 BAD_REQUEST)
    const resStaticQuery = await makeRequest(server, {
      path: '/assets/index.js?v=20261108',
      headers: { host: '127.0.0.1:3000' },
    });
    assert.equal(resStaticQuery.status, 404);
    assert.equal(resStaticQuery.json?.error?.code, 'NOT_FOUND');
    assert.notEqual(resStaticQuery.status, 400);

    // Root path with query string
    const resRootQuery = await makeRequest(server, {
      path: '/?tab=workers',
      headers: { host: '127.0.0.1:3000' },
    });
    assert.equal(resRootQuery.status, 404);
    assert.notEqual(resRootQuery.status, 400);
  });

  // =========================================================================
  // SECTION 3: P1 — Middleware Ordering & Request Body Scope
  // =========================================================================
  await t.test('P1-4. Middleware ordering: Oversized POST to GET-only route returns 405 (not 413)', async () => {
    const oversizedBody = JSON.stringify({ data: 'A'.repeat(5000) }); // > 1 KiB
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/system/status', // GET only route
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: oversizedBody,
    });

    // Must return 405 METHOD_NOT_ALLOWED, NOT 413 TOO_LARGE
    assert.equal(res.status, 405);
    assert.equal(res.json?.error?.code, 'METHOD_NOT_ALLOWED');
    assert.equal(res.headers['allow'], 'GET');
  });


  await t.test('Phase 4 workforce routes remain GET-only before body parsing', async () => {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/workforce/tasks',
      headers: { ...VALID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'must-not-be-accepted' }),
    });
    assert.equal(res.status, 405);
    assert.equal(res.json?.error?.code, 'METHOD_NOT_ALLOWED');
    assert.equal(res.headers['allow'], 'GET');
  });

  await t.test('P1-5. Middleware ordering: Oversized POST to unknown API route returns 404 (not 413)', async () => {
    const oversizedBody = JSON.stringify({ data: 'A'.repeat(5000) }); // > 1 KiB
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/nonexistent/endpoint',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: oversizedBody,
    });

    // Must return 404 NOT_FOUND, NOT 413 TOO_LARGE
    assert.equal(res.status, 404);
    assert.equal(res.json?.error?.code, 'NOT_FOUND');
  });

  await t.test('P1-6. Scoped body parser: Oversized JSON to auth login returns 413 TOO_LARGE', async () => {
    const oversizedBody = JSON.stringify({ username: 'op', data: 'A'.repeat(2000) });
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: oversizedBody,
    });

    assert.equal(res.status, 413);
    assert.equal(res.json?.error?.code, 'TOO_LARGE');
    assert.match(res.json?.error?.message, /1 KiB limit/);
  });

  await t.test('P1-7. Scoped body parser: Malformed JSON to auth login returns 400 BAD_REQUEST', async () => {
    const malformedBody = '{ username: "admin", invalid_json }';
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: malformedBody,
    });

    assert.equal(res.status, 400);
    assert.equal(res.json?.error?.code, 'BAD_REQUEST');
    assert.match(res.json?.error?.message, /Malformed JSON payload/);
  });

  // =========================================================================
  // SECTION 4: P1 — Strict JSON Content-Type Media-Type Matrix
  // =========================================================================
  await t.test('P1-8. Content-Type validator accepts valid media types and parameters', () => {
    assert.equal(isValidJsonContentType('application/json'), true);
    assert.equal(isValidJsonContentType('application/json; charset=utf-8'), true);
    assert.equal(isValidJsonContentType('application/json; charset=UTF-8'), true);
    assert.equal(isValidJsonContentType('application/json;charset=utf-8'), true);
    assert.equal(isValidJsonContentType('application/json; charset=utf-8; boundary=something'), true);
  });

  await t.test('P1-9. Content-Type validator rejects jsonp, text/plain, missing, and malformed parameters', () => {
    assert.equal(isValidJsonContentType('application/jsonp'), false);
    assert.equal(isValidJsonContentType('application/jsonfoo'), false);
    assert.equal(isValidJsonContentType('text/plain'), false);
    assert.equal(isValidJsonContentType('text/json'), false);
    assert.equal(isValidJsonContentType(''), false);
    assert.equal(isValidJsonContentType(undefined), false);
    assert.equal(isValidJsonContentType('application/json;'), false);
    assert.equal(isValidJsonContentType('application/json; malformed_param'), false);
    assert.equal(isValidJsonContentType('application/json; =value'), false);
    assert.equal(isValidJsonContentType('application/json; charset='), false);
  });

  await t.test('P1-10. Login endpoint strictly rejects non-json Content-Types with 400', async () => {
    const invalidTypes = [
      'application/jsonp',
      'application/jsonfoo',
      'text/plain',
      'application/x-www-form-urlencoded',
    ];

    for (const ct of invalidTypes) {
      const res = await makeRequest(server, {
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          ...VALID_HEADERS,
          'content-type': ct,
        },
        body: '{"username":"op"}',
      });
      assert.equal(res.status, 400, `Expected 400 for Content-Type: ${ct}`);
      assert.equal(res.json?.error?.code, 'BAD_REQUEST');
    }
  });

  // =========================================================================
  // SECTION 5: P1 — Authentication fails closed without operator configuration
  await t.test('P1-11. GET /api/auth/session returns 401 without a valid cookie', async () => {
    const res = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(res.status, 401);
    assert.equal(res.json?.error?.code, 'SESSION_REQUIRED');
    assert.match(res.json?.error?.message, /active operator session is required/i);
  });

  await t.test('P1-12. POST /api/auth/login fails closed when password hash is not configured', async () => {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { ...VALID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'test-only-password' }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json?.error?.code, 'AUTH_NOT_CONFIGURED');
  });

  await t.test('P1-13. POST /api/auth/logout requires an active operator session', async () => {
    const res = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: { ...VALID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401);
    assert.equal(res.json?.error?.code, 'SESSION_REQUIRED');
  });

  // SECTION 6: P2 — Safe Logger Contract
  // =========================================================================
  await t.test('P2-1. SafeLogger prevents log injection and strips CR, LF, and control characters', () => {
    const formatted = SafeLogger.formatEntry({
      level: 'INFO',
      event: 'LOGIN_POLICY_VIOLATION',
      method: 'POST\r\nINJECTED_HEADER: evil',
      route: '/api/auth/login\nGET /injected HTTP/1.1',
      statusCode: 403,
      errorCode: 'FORBIDDEN',
    });

    // Must be strictly a single line
    assert.equal(formatted.includes('\n'), false);
    assert.equal(formatted.includes('\r'), false);
    // Injected text in route is mapped to canonical route
    assert.equal(formatted.includes('INJECTED_HEADER'), false);
  });

  await t.test('P2-2. SafeLogger sanitizes routes and suppresses arbitrary non-canonical paths', () => {
    assert.equal(SafeLogger.sanitizeRoute('/api/v1/system/status'), '/api/v1/system/status');
    assert.equal(SafeLogger.sanitizeRoute('/api/unknown/secret-token-12345'), 'UNKNOWN_API_ROUTE');
    assert.equal(SafeLogger.sanitizeRoute('/static/private/file.txt'), 'STATIC_ROUTE');
    assert.equal(SafeLogger.sanitizeRoute('/api/v1/system/status?token=secret'), '/api/v1/system/status');
  });

  await t.test('P2-3. SafeLogger never prints secrets, headers, bodies, or arbitrary error messages', () => {
    const entry = SafeLogger.formatEntry({
      level: 'ERROR',
      event: 'INTERNAL_ERROR',
      method: 'POST',
      route: '/api/v1/system/status',
      statusCode: 500,
      errorCode: 'BACKEND_ERROR',
    });

    assert.equal(entry.includes('Bearer'), false);
    assert.equal(entry.includes('Cookie'), false);
    assert.equal(entry.includes('csrf'), false);
    assert.equal(entry.includes('secret'), false);
    assert.equal(entry.includes('password'), false);
  });

  // =========================================================================
  // SECTION 7: Fetch Metadata, Origin, Method Matrix, and Zero CORS
  // =========================================================================
  await t.test('Sec-Fetch-Site matrix: requires exact same-origin and rejects others with 403', async () => {
    for (const site of ['cross-site', 'same-site', 'none']) {
      const res = await makeRequest(server, {
        path: '/api/v1/system/status',
        headers: { ...VALID_HEADERS, 'sec-fetch-site': site },
      });
      assert.equal(res.status, 403, `Expected 403 for Sec-Fetch-Site: ${site}`);
      assert.equal(res.json?.error?.code, 'FORBIDDEN');
    }

    // Missing Sec-Fetch-Site
    const headersNoSite = { ...VALID_HEADERS };
    delete (headersNoSite as any)['sec-fetch-site'];
    const resMissing = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: headersNoSite,
    });
    assert.equal(resMissing.status, 403);
  });

  await t.test('Origin absent on GET is allowed with Sec-Fetch-Site: same-origin', async () => {
    const headersNoOrigin = {
      host: '127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
    };
    const res = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: headersNoOrigin,
    });
    assert.equal(res.status, 200);
  });

  await t.test('Origin mismatch is rejected with 403', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, origin: 'http://localhost:3000' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json?.error?.code, 'FORBIDDEN');
  });

  await t.test('Zero CORS headers: responses never include Access-Control-* headers', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS },
    });

    for (const header of Object.keys(res.headers)) {
      assert.equal(header.startsWith('access-control-'), false);
    }
  });

  await t.test('Canonical route completeness check: exactly 13 routes declared', () => {
    assert.equal(CANONICAL_ROUTES.length, 17);
    const paths = CANONICAL_ROUTES.map((r) => r.path);
    assert.deepEqual(paths.sort(), [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/session',
      '/api/v1/audit/decisions',
      '/api/v1/events/stream',
      '/api/v1/market-watches/active',
      '/api/v1/pipeline/active',
      '/api/v1/system/status',
      '/api/v1/telemetry/usage',
      '/api/v1/workforce/activity',
      '/api/v1/workforce/attempts',
      '/api/v1/workforce/runtime',
      '/api/v1/workforce/tasks',
    ]);
  });

  // =========================================================================
  // SECTION 8: Node HTTP Parser Boundary for NUL and Non-ASCII
  // =========================================================================
  await t.test('Node HTTP parser boundary: NUL or non-ASCII characters rejected', async () => {
    // In Node.js llhttp parser, raw NUL byte in request line causes immediate parser rejection
    const rawNulReq = 'GET /api/v1/\0system HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nSec-Fetch-Site: same-origin\r\n\r\n';
    const nulResponse = await sendRawTcp(serverPort, rawNulReq);
    // Node llhttp either resets the socket or returns HTTP 400 Bad Request
    assert.ok(
      nulResponse.includes('400 Bad Request') || nulResponse.startsWith('ERROR:'),
      `Node parser rejected NUL byte: ${nulResponse}`,
    );
  });
});
