/**
 * SIREADER Phase 3.2 BFF - Express Application
 *
 * Implements the security-hardened Backend-for-Frontend (BFF) foundation:
 * - Loopback binding only (127.0.0.1)
 * - Strict Host, Sec-Fetch-Site, Origin, and Auth guards
 * - Fixed canonical route allowlist
 * - Bounded request size (1 KiB JSON body limit)
 * - Uniform error envelope
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

  // Disable express header
  app.disable('x-powered-by');

  // 1. Strip any CORS headers
  app.use(stripCorsHeaders);

  // 2. Validate raw path and query strings before parsing
  app.use(rawPathGuard);

  // 3. Validate Host header
  app.use(createHostGuard(config));

  // 4. Validate Fetch Metadata (Sec-Fetch-Site) and Origin for /api routes
  app.use(createFetchMetadataGuard(config));

  // 5. Validate login/logout specific requirements (Origin + JSON content-type)
  app.use(createLoginLogoutPolicyGuard(config));

  // 6. JSON body parsing with strict 1 KiB size limit
  app.use(express.json({ limit: config.maxJsonBodyBytes }));

  // 7. Body parser error handling (too large or malformed JSON)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err) {
      if (err.type === 'entity.too.large') {
        SafeLogger.warn('Request body exceeded size limit', {
          method: req.method,
          path: req.path,
          statusCode: 413,
          errorCode: 'TOO_LARGE',
        });
        sendBffError(res, 413, 'TOO_LARGE', 'Request payload exceeds the 1 KiB limit.');
        return;
      }
      if (err instanceof SyntaxError) {
        SafeLogger.warn('Malformed JSON request body', {
          method: req.method,
          path: req.path,
          statusCode: 400,
          errorCode: 'BAD_REQUEST',
        });
        sendBffError(res, 400, 'BAD_REQUEST', 'Malformed JSON payload in request body.');
        return;
      }
      SafeLogger.error('Unexpected body parser error', {
        method: req.method,
        path: req.path,
        statusCode: 500,
        errorCode: 'BACKEND_ERROR',
      });
      sendBffError(res, 500, 'BACKEND_ERROR', 'An unexpected error occurred parsing request.');
      return;
    }
    next();
  });

  // 8. Canonical route and method enforcement
  app.use(routeAndMethodGuard);

  // 9. Batch 1 Canonical Endpoints (Guarded Route Handlers)
  // Domain 1: Operator Authentication & Session lifecycle
  app.get('/api/auth/session', (_req: Request, res: Response) => {
    res.json({
      authenticated: false,
      user: null,
      message: 'Phase 3.2 Batch 1: Session management endpoint active; authentication lifecycle scheduled for Batch 3.',
    });
  });

  app.post('/api/auth/login', (_req: Request, res: Response) => {
    res.json({
      authenticated: false,
      message: 'Phase 3.2 Batch 1: Login endpoint guarded; credential verification scheduled for Batch 3.',
    });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.json({
      authenticated: false,
      message: 'Phase 3.2 Batch 1: Logout endpoint guarded; session destruction scheduled for Batch 3.',
    });
  });

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

  // 10. Fallback 404 for unhandled paths
  app.use((_req: Request, res: Response) => {
    sendBffError(res, 404, 'NOT_FOUND', 'Resource not found.');
  });

  // 11. Global error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    SafeLogger.error('Unhandled server exception', {
      method: req.method,
      path: req.path,
      statusCode: 500,
      errorCode: 'BACKEND_ERROR',
    });
    sendBffError(res, 500, 'BACKEND_ERROR', 'An internal server error occurred.');
  });

  return app;
}

export function startBffServer(configOverrides?: Partial<BffConfig>): Server {
  const config = loadBffConfig(configOverrides);
  const app = createBffApp(configOverrides);

  // Strict binding enforcement
  if (config.host === '0.0.0.0') {
    throw new Error('Security Error: Cannot bind to 0.0.0.0');
  }

  const server = app.listen(config.port, config.host, () => {
    SafeLogger.info('SIREADER Phase 3.2 BFF Server listening on loopback', {
      path: `${config.host}:${config.port}`,
    });
  });

  return server;
}
