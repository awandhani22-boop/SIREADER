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
import { loadBffConfig, type BffConfig } from './config.ts';
import {
  createHostGuard,
  createFetchMetadataGuard,
  createLoginLogoutPolicyGuard,
  rawPathGuard,
  routeAndMethodGuard,
  stripCorsHeaders,
} from './guards.ts';
import { sendBffError } from './errors.ts';
import { SafeLogger } from './log.ts';

export function createBffApp(configOverrides?: Partial<BffConfig>): express.Application {
  const config = loadBffConfig(configOverrides);
  const app = express();

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
  // Domain 1: Operator Authentication & Session lifecycle
  // Without active session, returns 401 SESSION_REQUIRED
  app.get('/api/auth/session', (_req: Request, res: Response) => {
    sendBffError(
      res,
      401,
      'SESSION_REQUIRED',
      'Phase 3.2 Batch 1: Session authentication required; session management scheduled for Batch 3.',
    );
  });

  // Stubs for login/logout return explicit 501 NOT_IMPLEMENTED (never success-shaped 200)
  app.post(
    '/api/auth/login',
    authPolicyGuard,
    authBodyParser,
    handleAuthBodyError,
    (_req: Request, res: Response) => {
      sendBffError(
        res,
        501,
        'NOT_IMPLEMENTED',
        'Phase 3.2 Batch 1: Login endpoint guarded; credential verification scheduled for Batch 3.',
      );
    },
  );

  app.post(
    '/api/auth/logout',
    authPolicyGuard,
    authBodyParser,
    handleAuthBodyError,
    (_req: Request, res: Response) => {
      sendBffError(
        res,
        501,
        'NOT_IMPLEMENTED',
        'Phase 3.2 Batch 1: Logout endpoint guarded; session destruction scheduled for Batch 3.',
      );
    },
  );

  // Domain 2: Read-Only Backend Observability Gateway
  app.get('/api/v1/system/status', (_req: Request, res: Response) => {
    res.json({
      status: 'GUARDED',
      endpoint: '/api/v1/system/status',
      message: 'Phase 3.2 Batch 1: Read-only system status route guarded; upstream proxy scheduled for Batch 2.',
    });
  });

  app.get('/api/v1/telemetry/usage', (_req: Request, res: Response) => {
    res.json({
      status: 'GUARDED',
      endpoint: '/api/v1/telemetry/usage',
      message: 'Phase 3.2 Batch 1: Read-only telemetry usage route guarded; upstream proxy scheduled for Batch 2.',
    });
  });

  app.get('/api/v1/pipeline/active', (_req: Request, res: Response) => {
    res.json({
      status: 'GUARDED',
      endpoint: '/api/v1/pipeline/active',
      message: 'Phase 3.2 Batch 1: Read-only pipeline active route guarded; upstream proxy scheduled for Batch 2.',
    });
  });

  app.get('/api/v1/market-watches/active', (_req: Request, res: Response) => {
    res.json({
      status: 'GUARDED',
      endpoint: '/api/v1/market-watches/active',
      message: 'Phase 3.2 Batch 1: Read-only market watches route guarded; upstream proxy scheduled for Batch 2.',
    });
  });

  app.get('/api/v1/audit/decisions', (_req: Request, res: Response) => {
    res.json({
      status: 'GUARDED',
      endpoint: '/api/v1/audit/decisions',
      message: 'Phase 3.2 Batch 1: Read-only audit decisions route guarded; upstream proxy scheduled for Batch 2.',
    });
  });

  // 8. Fallback 404 for unhandled paths (e.g. unknown static requests)
  app.use((_req: Request, res: Response) => {
    sendBffError(res, 404, 'NOT_FOUND', 'Resource not found.');
  });

  // 9. Global error handler
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
): Server {
  const config = loadBffConfig(configOverrides);
  const app = createBffApp(configOverrides);

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
