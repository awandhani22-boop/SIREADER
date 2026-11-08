/**
 * SIREADER Phase 3.2 BFF - Security Guards Middleware
 *
 * Implements strict security enforcement:
 * 1. Host header validation (strictly 127.0.0.1:3000)
 * 2. Fetch Metadata policy (Sec-Fetch-Site: same-origin required for /api/*)
 * 3. Origin header validation (strictly http://127.0.0.1:3000 when present)
 * 4. Auth route policy (Origin + JSON content-type mandatory on POST login/logout)
 * 5. Raw path validation (reject %, \, .., //, ;, NUL, non-ASCII, trailing slash, query strings)
 * 6. Method allowlist enforcement & 405 with Allow header
 * 7. Anti-CORS protection (zero Access-Control-* headers)
 */

import type { Request, Response, NextFunction } from 'express';
import type { BffConfig } from './config.ts';
import { isAllowlistedPath, getAllowedMethods, isMethodAllowed } from './allowlist.ts';
import { sendBffError } from './errors.ts';

/**
 * 1. Host Guard: Validates that the request Host header matches exactly the allowed host.
 */
export function createHostGuard(config: BffConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawHost = req.headers.host;

    if (!rawHost || rawHost.trim() !== config.allowedHost) {
      sendBffError(res, 403, 'FORBIDDEN', 'Forbidden or invalid Host header.');
      return;
    }

    next();
  };
}

/**
 * 2. Raw Path Guard: Inspects unparsed, un-decoded URL before route handling.
 * Rejects traversal, encodings, backslashes, semicolons, NUL, query strings, and trailing slashes.
 */
export function rawPathGuard(req: Request, res: Response, next: NextFunction): void {
  const rawUrl = req.originalUrl || req.url || '';

  // Reject query strings on Phase 3.2 API routes
  if (rawUrl.includes('?')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Query strings are not permitted on API routes.');
    return;
  }

  // Reject percent-encoded sequences
  if (rawUrl.includes('%')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Percent-encoded characters are not permitted.');
    return;
  }

  // Reject backslashes
  if (rawUrl.includes('\\')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Backslash characters are not permitted.');
    return;
  }

  // Reject directory traversal sequence
  if (rawUrl.includes('..')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Path traversal sequence is not permitted.');
    return;
  }

  // Reject consecutive slashes
  if (rawUrl.includes('//')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Consecutive slashes are not permitted.');
    return;
  }

  // Reject semicolons
  if (rawUrl.includes(';')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Semicolons are not permitted in path.');
    return;
  }

  // Reject NUL bytes
  if (rawUrl.includes('\0')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'NUL bytes are not permitted in path.');
    return;
  }

  // Reject non-ASCII or non-printable ASCII characters (code < 32 or > 126)
  if (/[^\x20-\x7E]/.test(rawUrl)) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Non-ASCII or control characters are not permitted.');
    return;
  }

  // Reject trailing slashes on API routes (e.g. /api/v1/system/status/)
  if (rawUrl.length > 1 && rawUrl.endsWith('/')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Trailing slashes are not permitted on API routes.');
    return;
  }

  next();
}

/**
 * 3. Fetch Metadata Guard: Enforces Sec-Fetch-Site and Origin policies for all /api/* routes.
 */
export function createFetchMetadataGuard(config: BffConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only inspect /api routes
    const path = req.path || '';
    if (!path.startsWith('/api')) {
      next();
      return;
    }

    const secFetchSite = req.headers['sec-fetch-site'];

    // Sec-Fetch-Site must be present and strictly 'same-origin'
    if (secFetchSite !== 'same-origin') {
      sendBffError(
        res,
        403,
        'FORBIDDEN',
        'Cross-origin or missing Sec-Fetch-Site request rejected.',
      );
      return;
    }

    // Origin header validation
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (origin !== config.allowedOrigin) {
        sendBffError(res, 403, 'FORBIDDEN', 'Forbidden or invalid Origin header.');
        return;
      }
    }

    next();
  };
}

/**
 * 4. Login/Logout Policy Guard:
 * POST login/logout requires exact Origin and application/json Content-Type.
 */
export function createLoginLogoutPolicyGuard(config: BffConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || '';
    const isAuthPost =
      (path === '/api/auth/login' || path === '/api/auth/logout') &&
      req.method === 'POST';

    if (isAuthPost) {
      const origin = req.headers.origin;
      if (!origin || origin !== config.allowedOrigin) {
        sendBffError(
          res,
          403,
          'FORBIDDEN',
          'Origin header matching application origin is required for authentication state changes.',
        );
        return;
      }

      const contentType = req.headers['content-type'] || '';
      const isJson = contentType.toLowerCase().startsWith('application/json');
      if (!isJson) {
        sendBffError(
          res,
          400,
          'BAD_REQUEST',
          'Content-Type must be application/json for authentication requests.',
        );
        return;
      }
    }

    next();
  };
}

/**
 * 5. Route and Method Guard:
 * Validates known canonical routes, handles unknown 404, and wrong method 405 with Allow header.
 */
export function routeAndMethodGuard(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || '';

  // Only handle /api paths
  if (!path.startsWith('/api')) {
    next();
    return;
  }

  // Check if route is in canonical allowlist
  if (!isAllowlistedPath(path)) {
    sendBffError(res, 404, 'NOT_FOUND', 'API endpoint not found.');
    return;
  }

  // Check method against allowed methods for this route
  if (!isMethodAllowed(path, req.method)) {
    const allowed = getAllowedMethods(path) || [];
    sendBffError(
      res,
      405,
      'METHOD_NOT_ALLOWED',
      `HTTP method ${req.method} not allowed on this endpoint.`,
      { Allow: allowed.join(', ') },
    );
    return;
  }

  next();
}

/**
 * 6. Strip CORS Headers: Ensures no Access-Control-* response headers are sent.
 */
export function stripCorsHeaders(_req: Request, res: Response, next: NextFunction): void {
  const originalSetHeader = res.setHeader.bind(res);

  res.setHeader = function (name: string, value: any) {
    if (name.toLowerCase().startsWith('access-control-')) {
      return res;
    }
    return originalSetHeader(name, value);
  };

  res.removeHeader('Access-Control-Allow-Origin');
  res.removeHeader('Access-Control-Allow-Methods');
  res.removeHeader('Access-Control-Allow-Headers');
  res.removeHeader('Access-Control-Allow-Credentials');
  res.removeHeader('Access-Control-Expose-Headers');
  res.removeHeader('Access-Control-Max-Age');

  next();
}
