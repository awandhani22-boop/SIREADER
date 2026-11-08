/**
 * SIREADER Phase 3.2 BFF - Error Envelope & Error Codes
 *
 * Enforces uniform error envelope:
 * { "error": { "code": "...", "message": "safe message" } }
 *
 * Never leaks request headers, secrets, stack traces, tokens, or internal paths.
 */

import type { Response } from 'express';

export type BffErrorCode =
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'SESSION_REQUIRED'
  | 'AUTH_NOT_CONFIGURED'
  | 'CSRF_INVALID'
  | 'RATE_LIMITED'
  | 'INVALID_CREDENTIALS'
  | 'TIMEOUT'
  | 'UNREACHABLE'
  | 'UPSTREAM_AUTH_FAILED'
  | 'BACKEND_ERROR'
  | 'TOO_LARGE'
  | 'INVALID_UPSTREAM_CONTENT_TYPE'
  | 'SCHEMA_INVALID'
  | 'NOT_IMPLEMENTED';

export interface BffErrorEnvelope {
  readonly error: {
    readonly code: BffErrorCode;
    readonly message: string;
  };
}

export class BffHttpError extends Error {
  readonly statusCode: number;
  readonly code: BffErrorCode;

  constructor(statusCode: number, code: BffErrorCode, message: string) {
    super(message);
    this.name = 'BffHttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createErrorEnvelope(
  code: BffErrorCode,
  message: string,
): BffErrorEnvelope {
  return {
    error: {
      code,
      message,
    },
  };
}

export function sendBffError(
  res: Response,
  statusCode: number,
  code: BffErrorCode,
  message: string,
  headers?: Record<string, string>,
): void {
  if (res.headersSent) {
    return;
  }

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }

  res.status(statusCode).json(createErrorEnvelope(code, message));
}
