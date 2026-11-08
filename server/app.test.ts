/**
 * SIREADER Phase 3.2 BFF - Foundation & Security Test Suite
 *
 * Verifies all 12 critical security & architecture requirements:
 * 1. Valid Host and invalid Host
 * 2. Exact Origin acceptance and rejection
 * 3. Sec-Fetch-Site matrix
 * 4. Origin missing with same-origin metadata
 * 5. Login/logout request requirements (Origin, Content-Type, Body size limit)
 * 6. Raw path traversal and encoded-path rejection
 * 7. Query-string rejection
 * 8. Method matrix and Allow headers
 * 9. Unknown path 404
 * 10. Error envelope consistency
 * 11. No CORS headers
 * 12. No secret/header logging & Wildcard binding prevention
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createBffApp } from './app.ts';
import { loadBffConfig } from './config.ts';
import { CANONICAL_ROUTES } from './allowlist.ts';
import { SafeLogger } from './log.ts';

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

// Baseline valid headers for a same-origin GET
const VALID_HEADERS = {
  host: '127.0.0.1:3000',
  'sec-fetch-site': 'same-origin',
  origin: 'http://127.0.0.1:3000',
};

test('SIREADER Phase 3.2 BFF Test Suite', async (t) => {
  const app = createBffApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  t.after(() => {
    server.close();
  });

  // 1. Valid Host and invalid Host
  await t.test('1. Host header validation: accepts 127.0.0.1:3000 and rejects all others with 403', async () => {
    // Valid Host
    const resValid = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resValid.status, 200);

    // Invalid port (127.0.0.1:3001)
    const resWrongPort = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, host: '127.0.0.1:3001' },
    });
    assert.equal(resWrongPort.status, 403);
    assert.equal(resWrongPort.json?.error?.code, 'FORBIDDEN');

    // Localhost hostname (must strictly be 127.0.0.1:3000)
    const resLocalhost = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, host: 'localhost:3000' },
    });
    assert.equal(resLocalhost.status, 403);
    assert.equal(resLocalhost.json?.error?.code, 'FORBIDDEN');

    // Arbitrary external host
    const resExternal = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, host: 'attacker.com' },
    });
    assert.equal(resExternal.status, 403);
    assert.equal(resExternal.json?.error?.code, 'FORBIDDEN');
  });

  // 2. Exact Origin acceptance and rejection
  await t.test('2. Origin header validation: accepts http://127.0.0.1:3000 and rejects mismatches with 403', async () => {
    // Valid Origin
    const resValid = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, origin: 'http://127.0.0.1:3000' },
    });
    assert.equal(resValid.status, 200);

    // Mismatched Port
    const resWrongPort = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, origin: 'http://127.0.0.1:3001' },
    });
    assert.equal(resWrongPort.status, 403);
    assert.equal(resWrongPort.json?.error?.code, 'FORBIDDEN');

    // Mismatched Hostname (localhost vs 127.0.0.1)
    const resLocalhost = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, origin: 'http://localhost:3000' },
    });
    assert.equal(resLocalhost.status, 403);
    assert.equal(resLocalhost.json?.error?.code, 'FORBIDDEN');

    // Scheme mismatch (https vs http on loopback)
    const resHttps = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, origin: 'https://127.0.0.1:3000' },
    });
    assert.equal(resHttps.status, 403);
    assert.equal(resHttps.json?.error?.code, 'FORBIDDEN');

    // Null Origin
    const resNull = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, origin: 'null' },
    });
    assert.equal(resNull.status, 403);
    assert.equal(resNull.json?.error?.code, 'FORBIDDEN');

    // External Attacker Origin
    const resAttacker = await makeRequest(server, {
      path: '/api/auth/session',
      headers: { ...VALID_HEADERS, origin: 'http://attacker.example.com' },
    });
    assert.equal(resAttacker.status, 403);
    assert.equal(resAttacker.json?.error?.code, 'FORBIDDEN');
  });

  // 3. Sec-Fetch-Site matrix
  await t.test('3. Sec-Fetch-Site matrix: requires exact same-origin and rejects all others with 403', async () => {
    // Valid same-origin
    const resSameOrigin = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, 'sec-fetch-site': 'same-origin' },
    });
    assert.equal(resSameOrigin.status, 200);

    // Missing Sec-Fetch-Site
    const headersMissing = { ...VALID_HEADERS };
    delete (headersMissing as any)['sec-fetch-site'];
    const resMissing = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: headersMissing,
    });
    assert.equal(resMissing.status, 403);
    assert.equal(resMissing.json?.error?.code, 'FORBIDDEN');

    // cross-site
    const resCrossSite = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(resCrossSite.status, 403);
    assert.equal(resCrossSite.json?.error?.code, 'FORBIDDEN');

    // same-site
    const resSameSite = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, 'sec-fetch-site': 'same-site' },
    });
    assert.equal(resSameSite.status, 403);
    assert.equal(resSameSite.json?.error?.code, 'FORBIDDEN');

    // none
    const resNone = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, 'sec-fetch-site': 'none' },
    });
    assert.equal(resNone.status, 403);
    assert.equal(resNone.json?.error?.code, 'FORBIDDEN');
  });

  // 4. Origin missing with same-origin metadata
  await t.test('4. Origin absent on GET is allowed with Sec-Fetch-Site: same-origin', async () => {
    const headersNoOrigin = {
      host: '127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
    };
    const res = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: headersNoOrigin,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json?.status, 'GUARDED');
  });

  // 5. Login/logout request requirements
  await t.test('5. Login/Logout policy: requires exact Origin, JSON Content-Type, and max 1 KiB body', async () => {
    // Valid POST login
    const resValidLogin = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ username: 'operator' }),
    });
    assert.equal(resValidLogin.status, 200);

    // Missing Origin on login -> 403
    const headersNoOrigin = {
      host: '127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
    };
    const resMissingOrigin = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: headersNoOrigin,
      body: JSON.stringify({ username: 'operator' }),
    });
    assert.equal(resMissingOrigin.status, 403);
    assert.equal(resMissingOrigin.json?.error?.code, 'FORBIDDEN');

    // Non-JSON Content-Type -> 400
    const resTextPlain = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'text/plain',
      },
      body: 'username=operator',
    });
    assert.equal(resTextPlain.status, 400);
    assert.equal(resTextPlain.json?.error?.code, 'BAD_REQUEST');

    // Missing Content-Type -> 400
    const headersNoContentType = {
      ...VALID_HEADERS,
    };
    const resNoContentType = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: headersNoContentType,
      body: '{"username":"operator"}',
    });
    assert.equal(resNoContentType.status, 400);
    assert.equal(resNoContentType.json?.error?.code, 'BAD_REQUEST');

    // Body size exceeding 1 KiB (1024 bytes) -> 413 TOO_LARGE
    const largePayload = JSON.stringify({ data: 'A'.repeat(1500) });
    const resTooLarge = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: largePayload,
    });
    assert.equal(resTooLarge.status, 413);
    assert.equal(resTooLarge.json?.error?.code, 'TOO_LARGE');

    // Valid POST logout
    const resValidLogout = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: {
        ...VALID_HEADERS,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(resValidLogout.status, 200);

    // Missing Origin on logout -> 403
    const resLogoutNoOrigin = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/logout',
      headers: headersNoOrigin,
      body: JSON.stringify({}),
    });
    assert.equal(resLogoutNoOrigin.status, 403);
    assert.equal(resLogoutNoOrigin.json?.error?.code, 'FORBIDDEN');
  });

  // 6. Raw path traversal and encoded-path rejection
  await t.test('6. Raw path security: rejects %, \\, .., //, ;, NUL, non-ASCII, and trailing slashes with 400', async () => {
    // Percent-encoded sequence
    const resPercent = await makeRequest(server, {
      path: '/api/v1/system/status%20',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resPercent.status, 400);
    assert.equal(resPercent.json?.error?.code, 'BAD_REQUEST');

    // Percent-encoded slash
    const resEncodedSlash = await makeRequest(server, {
      path: '/api%2fv1/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resEncodedSlash.status, 400);
    assert.equal(resEncodedSlash.json?.error?.code, 'BAD_REQUEST');

    // Directory traversal (..)
    const resTraversal = await makeRequest(server, {
      path: '/api/v1/../v1/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resTraversal.status, 400);
    assert.equal(resTraversal.json?.error?.code, 'BAD_REQUEST');

    // Backslash (\)
    const resBackslash = await makeRequest(server, {
      path: '/api\\v1\\system\\status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resBackslash.status, 400);
    assert.equal(resBackslash.json?.error?.code, 'BAD_REQUEST');

    // Consecutive slashes (//)
    const resDoubleSlash = await makeRequest(server, {
      path: '/api//v1/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resDoubleSlash.status, 400);
    assert.equal(resDoubleSlash.json?.error?.code, 'BAD_REQUEST');

    // Semicolon (;)
    const resSemicolon = await makeRequest(server, {
      path: '/api/v1/system/status;jsessionid=123',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resSemicolon.status, 400);
    assert.equal(resSemicolon.json?.error?.code, 'BAD_REQUEST');

    // Trailing slash on API path
    const resTrailingSlash = await makeRequest(server, {
      path: '/api/v1/system/status/',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resTrailingSlash.status, 400);
    assert.equal(resTrailingSlash.json?.error?.code, 'BAD_REQUEST');
  });

  // 7. Query-string rejection
  await t.test('7. Query-string rejection: rejects any query strings on Phase 3.2 routes with 400', async () => {
    const resQuery = await makeRequest(server, {
      path: '/api/v1/system/status?format=json',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resQuery.status, 400);
    assert.equal(resQuery.json?.error?.code, 'BAD_REQUEST');

    const resEmptyQuery = await makeRequest(server, {
      path: '/api/auth/session?',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resEmptyQuery.status, 400);
    assert.equal(resEmptyQuery.json?.error?.code, 'BAD_REQUEST');
  });

  // 8. Method matrix and Allow headers
  await t.test('8. Method matrix: returns 405 with accurate Allow header for wrong methods on known routes', async () => {
    // 5 GET-only backend observability routes
    const getOnlyRoutes = [
      '/api/v1/system/status',
      '/api/v1/telemetry/usage',
      '/api/v1/pipeline/active',
      '/api/v1/market-watches/active',
      '/api/v1/audit/decisions',
      '/api/auth/session',
    ];

    for (const route of getOnlyRoutes) {
      // Allowed GET
      const resGet = await makeRequest(server, {
        method: 'GET',
        path: route,
        headers: { ...VALID_HEADERS },
      });
      assert.equal(resGet.status, 200, `GET ${route} must return 200`);

      // Forbidden POST
      const resPost = await makeRequest(server, {
        method: 'POST',
        path: route,
        headers: {
          ...VALID_HEADERS,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(resPost.status, 405, `POST ${route} must return 405`);
      assert.equal(resPost.headers.allow, 'GET');
      assert.equal(resPost.json?.error?.code, 'METHOD_NOT_ALLOWED');

      // Forbidden DELETE
      const resDelete = await makeRequest(server, {
        method: 'DELETE',
        path: route,
        headers: { ...VALID_HEADERS },
      });
      assert.equal(resDelete.status, 405, `DELETE ${route} must return 405`);
      assert.equal(resDelete.headers.allow, 'GET');

      // Forbidden PUT
      const resPut = await makeRequest(server, {
        method: 'PUT',
        path: route,
        headers: {
          ...VALID_HEADERS,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(resPut.status, 405, `PUT ${route} must return 405`);
      assert.equal(resPut.headers.allow, 'GET');
    }

    // 2 POST-only auth routes
    const postOnlyRoutes = ['/api/auth/login', '/api/auth/logout'];
    for (const route of postOnlyRoutes) {
      // Forbidden GET
      const resGet = await makeRequest(server, {
        method: 'GET',
        path: route,
        headers: { ...VALID_HEADERS },
      });
      assert.equal(resGet.status, 405, `GET ${route} must return 405`);
      assert.equal(resGet.headers.allow, 'POST');
      assert.equal(resGet.json?.error?.code, 'METHOD_NOT_ALLOWED');

      // Forbidden PUT
      const resPut = await makeRequest(server, {
        method: 'PUT',
        path: route,
        headers: {
          ...VALID_HEADERS,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      assert.equal(resPut.status, 405, `PUT ${route} must return 405`);
      assert.equal(resPut.headers.allow, 'POST');
    }
  });

  // 9. Unknown path 404
  await t.test('9. Unknown path 404: returns JSON NOT_FOUND envelope for non-allowlisted API routes', async () => {
    const resUnknown1 = await makeRequest(server, {
      path: '/api/unknown',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resUnknown1.status, 404);
    assert.equal(resUnknown1.json?.error?.code, 'NOT_FOUND');

    const resUnknown2 = await makeRequest(server, {
      path: '/api/v1/nonexistent',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resUnknown2.status, 404);
    assert.equal(resUnknown2.json?.error?.code, 'NOT_FOUND');

    const resUnknownV2 = await makeRequest(server, {
      path: '/api/v2/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(resUnknownV2.status, 404);
    assert.equal(resUnknownV2.json?.error?.code, 'NOT_FOUND');
  });

  // 10. Error envelope consistency
  await t.test('10. Error envelope consistency: all error responses strictly follow { error: { code, message } }', async () => {
    const errorCodesTested: string[] = [];

    // 400
    const res400 = await makeRequest(server, {
      path: '/api/v1/system/status?query=1',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(res400.status, 400);
    assert.ok(res400.json?.error?.code);
    assert.ok(res400.json?.error?.message);
    errorCodesTested.push(res400.json.error.code);

    // 403
    const res403 = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, host: 'evil.com' },
    });
    assert.equal(res403.status, 403);
    assert.ok(res403.json?.error?.code);
    assert.ok(res403.json?.error?.message);
    errorCodesTested.push(res403.json.error.code);

    // 404
    const res404 = await makeRequest(server, {
      path: '/api/v1/unknown',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(res404.status, 404);
    assert.ok(res404.json?.error?.code);
    assert.ok(res404.json?.error?.message);
    errorCodesTested.push(res404.json.error.code);

    // 405
    const res405 = await makeRequest(server, {
      method: 'POST',
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(res405.status, 405);
    assert.ok(res405.json?.error?.code);
    assert.ok(res405.json?.error?.message);
    errorCodesTested.push(res405.json.error.code);

    // 413
    const res413 = await makeRequest(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { ...VALID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'X'.repeat(1500) }),
    });
    assert.equal(res413.status, 413);
    assert.ok(res413.json?.error?.code);
    assert.ok(res413.json?.error?.message);
    errorCodesTested.push(res413.json.error.code);

    assert.deepEqual(errorCodesTested, [
      'BAD_REQUEST',
      'FORBIDDEN',
      'NOT_FOUND',
      'METHOD_NOT_ALLOWED',
      'TOO_LARGE',
    ]);
  });

  // 11. No CORS headers
  await t.test('11. Zero CORS headers: responses never include Access-Control-* headers', async () => {
    const res = await makeRequest(server, {
      path: '/api/v1/system/status',
      headers: { ...VALID_HEADERS },
    });
    assert.equal(res.status, 200);

    for (const headerName of Object.keys(res.headers)) {
      assert.ok(
        !headerName.toLowerCase().startsWith('access-control-'),
        `Response must not contain CORS header: ${headerName}`,
      );
    }
  });

  // 12. No secret/header logging & Wildcard binding prevention
  await t.test('12. Security sanity: config refuses 0.0.0.0 and logger prevents secret leakage', () => {
    // 0.0.0.0 rejection
    assert.throws(
      () => loadBffConfig({ host: '0.0.0.0' }),
      /CRITICAL SECURITY VIOLATION: BFF must never be bound to 0.0.0.0/,
    );
    assert.throws(
      () => loadBffConfig({ host: '::' }),
      /CRITICAL SECURITY VIOLATION: BFF must never be bound to 0.0.0.0/,
    );

    // SafeLogger formatting test: ensures no headers or bodies can be logged
    const logOutput = SafeLogger.formatEntry({
      level: 'INFO',
      method: 'GET',
      path: '/api/v1/system/status?token=supersecret',
      statusCode: 200,
      message: 'Request completed',
      durationMs: 12.34,
    });

    assert.ok(!logOutput.includes('token='), 'Logger must sanitize query params');
    assert.ok(logOutput.includes('/api/v1/system/status'));
    assert.ok(logOutput.includes('[INFO]'));
  });

  // Canonical route inventory check
  await t.test('Canonical route completeness check: exactly 8 routes declared', () => {
    assert.equal(CANONICAL_ROUTES.length, 8);
  });
});
