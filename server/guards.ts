/**
 * SIREADER Phase 3.2 BFF - Security Guards Middleware
 *
 * Implements strict security enforcement:
 * 1. Host header validation (strictly 127.0.0.1:3000)
 * 2. Fetch Metadata policy (Sec-Fetch-Site: same-origin required for /api/*)
 * 3. Origin header validation (strictly http://127.0.0.1:3000 when present)
 * 4. Auth route policy (Origin + strict JSON content-type on POST login/logout)
 * 5. Scoped raw path validation for /api/* (reject %, \, .., //, ;, NUL, non-ASCII, trailing slash, query strings)
 * 6. Method allowlist enforcement & 405 with Allow header
 * 7. Anti-CORS protection (zero Access-Control-* headers)
 */

import type { Request, Response, NextFunction } from 'express';
import type { BffConfig } from './config.ts';
import { isAllowlistedPath, getAllowedMethods, isMethodAllowed } from './allowlist.ts';
import { sendBffError } from './errors.ts';

/**
 * Determines whether a raw URL or resolved path targets the /api namespace.
 * Uses discrete boundary checks to prevent false positives on /api-foo or /apifoo.
 */
export function isApiTarget(rawUrl: string, parsedPath?: string): boolean {
  if (
    rawUrl === '/api' ||
    rawUrl.startsWith('/api/') ||
    rawUrl.startsWith('/api?') ||
    rawUrl.startsWith('/api;') ||
    rawUrl.startsWith('/api\\')
  ) {
    return true;
  }

  if (parsedPath && (parsedPath === '/api' || parsedPath.startsWith('/api/'))) {
    return true;
  }

  return false;
}

/**
 * Strictly validates Content-Type header against application/json media type.
 * Accepts:
 * - "application/json"
 * - "application/json; charset=utf-8"
 * Rejects:
 * - "application/jsonp", "application/jsonfoo", "text/plain", missing, malformed parameters
 */
export function isValidJsonContentType(headerValue?: string): boolean {
  if (!headerValue || typeof headerValue !== 'string') {
    return false;
  }

  const parts = headerValue.split(';').map((p) => p.trim());
  const mediaType = parts[0]?.toLowerCase();

  if (mediaType !== 'application/json') {
    return false;
  }

  // Validate parameters if present (e.g. charset=utf-8)
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i];
    if (!param) {
      return false;
    }
    const eqIdx = param.indexOf('=');
    if (eqIdx <= 0 || eqIdx === param.length - 1) {
      return false;
    }
    const paramKey = param.slice(0, eqIdx).trim().toLowerCase();
    const paramVal = param.slice(eqIdx + 1).trim();
    if (!paramKey || !paramVal) {
      return false;
    }
  }

  return true;
}

/**
 * 1. Host Guard: Validates that the request Host header matches exactly the allowed host.
 * Applies to all requests entering the BFF.
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
 * Strictly scoped to /api and /api/* requests only.
 * Static frontend GET routes pass through freely.
 */
export function rawPathGuard(req: Request, res: Response, next: NextFunction): void {
  const rawUrl = req.originalUrl || req.url || '';
  const parsedPath = req.path;

  // Raw path guard is strictly scoped to /api requests
  if (!isApiTarget(rawUrl, parsedPath)) {
    next();
    return;
  }

  // One narrowly-scoped query is required for the read-only attempt history.
  // Do not generalize query forwarding to any other API route or parameter.
  const attemptsQueryAllowed =
    rawUrl.startsWith('/api/v1/workforce/attempts?') &&
    /^\/api\/v1\/workforce\/attempts\?task_id=[A-Za-z0-9_-]{8,64}$/.test(rawUrl);
  if (rawUrl.includes('?') && !attemptsQueryAllowed) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Query strings are not permitted on this API route.');
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
  const cleanPath = rawUrl.split('?')[0] || '';
  if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
    sendBffError(res, 400, 'BAD_REQUEST', 'Trailing slashes are not permitted on API routes.');
    return;
  }

  next();
}

/**
 * 3. Fetch Metadata Guard: Enforces Sec-Fetch-Site and Origin policies for /api/* routes.
 */
export function createFetchMetadataGuard(config: BffConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawUrl = req.originalUrl || req.url || '';
    const path = req.path || '';

    // Only inspect /api routes
    if (!isApiTarget(rawUrl, path)) {
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

    // Origin header validation when present
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
 * POST login/logout requires exact Origin and strict application/json Content-Type.
 */
export function createLoginLogoutPolicyGuard(config: BffConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
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

    const contentType = req.headers['content-type'];
    if (!isValidJsonContentType(contentType)) {
      sendBffError(
        res,
        400,
        'BAD_REQUEST',
        'Content-Type must be application/json for authentication requests.',
      );
      return;
    }

    next();
  };
}

/**
 * 5. Route and Method Guard:
 * Runs BEFORE body parser. Rejects unknown /api paths with 404, wrong method with 405.
 */
export function routeAndMethodGuard(req: Request, res: Response, next: NextFunction): void {
  const rawUrl = req.originalUrl || req.url || '';
  const path = req.path || '';

  // Only handle /api paths
  if (!isApiTarget(rawUrl, path)) {
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
