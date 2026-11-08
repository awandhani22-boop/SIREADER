/**
 * SIREADER Phase 3.2 BFF - Express Application
 *
 * Implements the security-hardened Backend-for-Frontend (BFF) foundation:
 * - Literal loopback binding only (strictly 127.0.0.1)
 * - Strict Host, Sec-Fetch-Site, Origin, and Auth guards
 * - Fixed canonical route allowlist running BEFORE body parsing
 * - Scoped body parser (1 KiB limit applied ONLY to valid POST /api/auth/login and /api/auth/logout)
 * - Uniform error envelope and strict HTTP status semantics (401, 501, 404, 405, 413, 400, 403)
 * - Zero CORS headers
 */

import express, { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import type { RequestHandler } from 'express';
import { existsSync, statSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { loadBffConfig, type BffConfig } from './config.ts';
import {
  createHostGuard,
  createFetchMetadataGuard,
  createLoginLogoutPolicyGuard,
  rawPathGuard,
  routeAndMethodGuard,
  stripCorsHeaders,
  isApiTarget,
} from './guards.ts';
import { sendBffError } from './errors.ts';
import { SafeLogger } from './log.ts';
import { createUpstreamHandlers, createUpstreamSseHandler, type UpstreamProxyOptions, type UpstreamApiPath } from './upstream.ts';
import { OperatorAuthService, disableAuthCaching, type OperatorAuthOptions } from './auth.ts';

export interface BffAppDependencies extends UpstreamProxyOptions {
  /** Test seam for upstream-only fixtures; never set in the production entrypoint. */
  readonly requireOperatorSession?: RequestHandler;
  readonly authOptions?: OperatorAuthOptions;
  /** Fixed dist root in production; injectable temp root for static integration tests. */
  readonly staticRoot?: string;
}

function installStaticFrontend(app: express.Application, staticRoot: string): void {
  const root = resolve(staticRoot);
  const indexPath = resolve(root, 'index.html');
  if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
    throw new Error('Static frontend is unavailable: dist/index.html is missing.');
  }

  app.use(express.static(root, {
    dotfiles: 'deny',
    etag: true,
    fallthrough: true,
    index: false,
    maxAge: 0,
    redirect: false,
    setHeaders(res, filePath) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      const relativePath = relative(root, filePath).split(sep).join('/');
      const fileName = basename(filePath);
      const hasContentHash = /-[A-Za-z0-9_-]{8,}\./.test(fileName);

      if (relativePath === 'index.html') {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
      } else if (relativePath.startsWith('assets/') && hasContentHash) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // SPA history fallback only applies to explicit browser HTML navigations.
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    const rawUrl = req.originalUrl || req.url || '';
    const acceptHeader = req.headers.accept ?? '';
    const explicitlyAcceptsHtml = acceptHeader.split(',').some((entry) => {
      const mediaType = entry.split(';', 1)[0].trim().toLowerCase();
      return mediaType === 'text/html' || mediaType === 'application/xhtml+xml';
    });

    if (isApiTarget(rawUrl, req.path) || !explicitlyAcceptsHtml) {
      next();
      return;
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.sendFile(indexPath, (error) => {
      if (error) next(error);
    });
  });
}

export function createBffApp(
  configOverrides?: Partial<BffConfig>,
  dependencies: BffAppDependencies = {},
): express.Application {
  const config = loadBffConfig(configOverrides);
  const app = express();
  const upstreamHandlers = createUpstreamHandlers(dependencies);
  const upstreamSseHandler = createUpstreamSseHandler(dependencies);
  const operatorAuth = new OperatorAuthService(dependencies.authOptions);
  const requireOperatorSession = dependencies.requireOperatorSession ?? operatorAuth.requireSession;

  // Disable Express framework signature
  app.disable('x-powered-by');

  // 1. Strip any CORS headers on all responses
  app.use(stripCorsHeaders);

  // 2. Validate Host header on all incoming requests
  app.use(createHostGuard(config));

  // 3. Validate raw path and query strings (strictly scoped to /api/*; static requests pass)
  app.use(rawPathGuard);

  // 4. Validate Fetch Metadata (Sec-Fetch-Site: same-origin) and Origin for /api/*
  app.use(createFetchMetadataGuard(config));

  // 5. Canonical route and method enforcement (MUST run BEFORE body parsing)
  // Rejects unknown /api routes with 404 and wrong methods with 405 + Allow header
  app.use(routeAndMethodGuard);

  // 6. Scoped body parsing middleware for POST /api/auth/login and POST /api/auth/logout ONLY
  const authPolicyGuard = createLoginLogoutPolicyGuard(config);
  const authBodyParser = express.json({ limit: config.maxJsonBodyBytes });

  const handleAuthBodyError = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (err) {
      if (err.type === 'entity.too.large') {
        SafeLogger.warn('PAYLOAD_TOO_LARGE', {
          method: req.method,
          route: req.path,
          statusCode: 413,
          errorCode: 'TOO_LARGE',
        });
        sendBffError(res, 413, 'TOO_LARGE', 'Request payload exceeds the 1 KiB limit.');
        return;
      }
      if (err instanceof SyntaxError) {
        SafeLogger.warn('MALFORMED_JSON', {
          method: req.method,
          route: req.path,
          statusCode: 400,
          errorCode: 'BAD_REQUEST',
        });
        sendBffError(res, 400, 'BAD_REQUEST', 'Malformed JSON payload in request body.');
        return;
      }
      SafeLogger.error('INTERNAL_ERROR', {
        method: req.method,
        route: req.path,
        statusCode: 500,
        errorCode: 'BACKEND_ERROR',
      });
      sendBffError(res, 500, 'BACKEND_ERROR', 'An unexpected error occurred parsing request.');
      return;
    }
    next();
  };

  // 7. Canonical Endpoints (Guarded Route Handlers)
  // Domain 1: Operator authentication and single-user session lifecycle.
  app.get('/api/auth/session', operatorAuth.requireSession, (_req: Request, res: Response) => {
    res.status(200).json({ authenticated: true, csrfToken: res.locals.operatorCsrfToken });
  });

  app.post(
    '/api/auth/login',
    authPolicyGuard,
    authBodyParser,
    handleAuthBodyError,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const body = req.body as unknown;
      if (
        typeof body !== 'object' ||
        body === null ||
        Array.isArray(body) ||
        typeof (body as Record<string, unknown>).password !== 'string' ||
        (body as Record<string, string>).password.length < 1 ||
        Buffer.byteLength((body as Record<string, string>).password, 'utf8') > 256
      ) {
        sendBffError(res, 400, 'BAD_REQUEST', 'Login body must contain a password of 1–256 UTF-8 bytes.');
        return;
      }
      try {
        const result = await operatorAuth.authenticate(
          (body as Record<string, string>).password,
          req.socket.remoteAddress,
          req.headers.cookie,
        );
        if (result.kind === 'not_configured') {
          SafeLogger.error('AUTH_CONFIGURATION_UNAVAILABLE', {
            method: 'POST', route: '/api/auth/login', statusCode: 503, errorCode: 'AUTH_NOT_CONFIGURED',
          });
          disableAuthCaching(res);
          sendBffError(res, 503, 'AUTH_NOT_CONFIGURED', 'Operator authentication is not configured.');
          return;
        }
        if (result.kind === 'rate_limited') {
          SafeLogger.warn('AUTH_RATE_LIMITED', {
            method: 'POST', route: '/api/auth/login', statusCode: 429, errorCode: 'RATE_LIMITED',
          });
          disableAuthCaching(res);
          sendBffError(res, 429, 'RATE_LIMITED', 'Too many failed login attempts. Try again later.');
          return;
        }
        if (result.kind === 'invalid_credentials') {
          SafeLogger.warn('AUTH_LOGIN_REJECTED', {
            method: 'POST', route: '/api/auth/login', statusCode: 401, errorCode: 'INVALID_CREDENTIALS',
          });
          disableAuthCaching(res);
          sendBffError(res, 401, 'INVALID_CREDENTIALS', 'Invalid operator credentials.');
          return;
        }
        operatorAuth.setLoginCookie(res, result.sessionId);
        SafeLogger.info('AUTH_LOGIN_SUCCEEDED', {
          method: 'POST', route: '/api/auth/login', statusCode: 200,
        });
        res.status(200).json({ authenticated: true, csrfToken: result.csrfToken });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/auth/logout',
    authPolicyGuard,
    authBodyParser,
    handleAuthBodyError,
    operatorAuth.requireSession,
    operatorAuth.requireCsrf,
    (req: Request, res: Response) => {
      operatorAuth.revokeRequestSession(req);
      operatorAuth.clearCookie(res);
      SafeLogger.info('AUTH_LOGOUT_SUCCEEDED', {
        method: 'POST', route: '/api/auth/logout', statusCode: 200,
      });
      res.status(200).json({ authenticated: false });
    },
  );

  // Domain 2: Read-Only Backend Observability Gateway.
  // Until Batch 3 implements the real operator session store, access defaults to deny.
  const upstreamRoutes: readonly UpstreamApiPath[] = [
    '/api/v1/system/status',
    '/api/v1/telemetry/usage',
    '/api/v1/pipeline/active',
    '/api/v1/market-watches/active',
    '/api/v1/audit/decisions',
  ];

  for (const path of upstreamRoutes) {
    app.get(path, requireOperatorSession, upstreamHandlers[path]);
  }

  // Long-lived stream: same operator session, fixed server-side upstream path.
  app.get('/api/v1/events/stream', requireOperatorSession, upstreamSseHandler);

  // 8. Production static frontend (never handles the /api namespace).
  if (dependencies.staticRoot) {
    installStaticFrontend(app, dependencies.staticRoot);
  }

  // 9. Fallback 404 for unhandled API/static paths
  app.use((_req: Request, res: Response) => {
    sendBffError(res, 404, 'NOT_FOUND', 'Resource not found.');
  });

  // 10. Global error handler
  app.use((_err: any, req: Request, res: Response, _next: NextFunction) => {
    SafeLogger.error('INTERNAL_ERROR', {
      method: req.method,
      route: req.path,
      statusCode: 500,
      errorCode: 'BACKEND_ERROR',
    });
    sendBffError(res, 500, 'BACKEND_ERROR', 'An internal server error occurred.');
  });

  return app;
}

export function startBffServer(
  configOverrides?: Partial<BffConfig>,
  onListening?: (server: Server) => void,
  dependencies: BffAppDependencies = {},
): Server {
  const config = loadBffConfig(configOverrides);
  const app = createBffApp(configOverrides, dependencies);

  if (config.host !== '127.0.0.1') {
    throw new Error('CRITICAL SECURITY VIOLATION: BFF host must be exactly 127.0.0.1');
  }

  const server = app.listen(config.port, config.host, () => {
    const addr = server.address();
    if (!addr || typeof addr !== 'object') {
      server.close();
      throw new Error('CRITICAL SECURITY VIOLATION: Unable to determine server listening address.');
    }
    if (addr.address !== '127.0.0.1') {
      server.close();
      throw new Error(
        `CRITICAL SECURITY VIOLATION: Server bound to non-loopback address: ${addr.address}. Must bind to 127.0.0.1 only.`,
      );
    }
    if (addr.port !== config.port) {
      server.close();
      throw new Error(
        `CRITICAL SECURITY VIOLATION: Server listening on unexpected port: ${addr.port}. Expected: ${config.port}.`,
      );
    }
    SafeLogger.info('BFF_LISTENING', {
      method: 'STARTUP',
      route: '/api',
      statusCode: 200,
    });
    if (onListening) {
      onListening(server);
    }
  });

  return server;
}
