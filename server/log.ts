/**
 * SIREADER Phase 3.2 BFF - Sanitized Safe Logger
 *
 * Strict Security Boundary:
 * - NEVER log request headers (Cookie, Authorization, X-CSRF-Token, Host, etc.).
 * - NEVER log request or response body contents.
 * - NEVER log secrets, tokens, credentials, database connection strings, or internal stack traces.
 * - NEVER print arbitrary dynamic error strings; use static predefined SafeLogEvent identifiers.
 * - Sanitize CR/LF and control characters to prevent log injection.
 * - Only log known canonical API routes or safe route identifiers (no arbitrary raw paths).
 * - Keep query strings stripped.
 */

import type { BffErrorCode } from './errors.ts';
import { isAllowlistedPath, WORKFORCE_TASK_TIMELINE_PATTERN } from './allowlist.ts';

export type SafeLogEvent =
  | 'BFF_STARTUP'
  | 'BFF_LISTENING'
  | 'BFF_SHUTDOWN'
  | 'HOST_REJECTED'
  | 'FETCH_METADATA_REJECTED'
  | 'ORIGIN_REJECTED'
  | 'RAW_PATH_REJECTED'
  | 'QUERY_STRING_REJECTED'
  | 'ROUTE_NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'LOGIN_POLICY_VIOLATION'
  | 'PAYLOAD_TOO_LARGE'
  | 'MALFORMED_JSON'
  | 'SESSION_UNAUTHENTICATED'
  | 'INTERNAL_ERROR'
  | 'REQUEST_COMPLETED'
  | 'UPSTREAM_AUTH_MISSING'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_REQUEST_FAILED'
  | 'UPSTREAM_RESPONSE_REJECTED'
  | 'AUTH_CONFIGURATION_UNAVAILABLE'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_LOGIN_REJECTED'
  | 'AUTH_LOGIN_SUCCEEDED'
  | 'AUTH_LOGOUT_SUCCEEDED'
  | 'CSRF_REJECTED'
  | 'SSE_UPSTREAM_AUTH_MISSING'
  | 'SSE_UPSTREAM_REDIRECT_REJECTED'
  | 'SSE_UPSTREAM_REJECTED'
  | 'SSE_STREAM_INTERRUPTED'
  | 'SSE_UPSTREAM_TIMEOUT'
  | 'SSE_UPSTREAM_UNREACHABLE';

export interface SafeLogEntry {
  readonly level: 'INFO' | 'WARN' | 'ERROR';
  readonly event: SafeLogEvent;
  readonly method?: string;
  readonly route?: string;
  readonly statusCode?: number;
  readonly errorCode?: BffErrorCode;
  readonly durationMs?: number;
}

export class SafeLogger {
  /**
   * Sanitizes route: outputs only known canonical routes or safe discrete labels.
   * Arbitrary paths or query strings are never logged directly.
   */
  static sanitizeRoute(rawRoute?: string): string {
    if (!rawRoute) return '';
    // Strip query string and fragment if somehow present
    const clean = rawRoute.split(/[?#]/)[0] || '';
    if (WORKFORCE_TASK_TIMELINE_PATTERN.test(clean)) {
      return '/api/v1/workforce/tasks/:taskId/timeline';
    }
    if (isAllowlistedPath(clean)) {
      return clean;
    }
    if (clean === '/api' || clean.startsWith('/api/')) {
      return 'UNKNOWN_API_ROUTE';
    }
    return 'STATIC_ROUTE';
  }

  private static readonly KNOWN_METHODS = new Set([
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'HEAD',
    'OPTIONS',
    'STARTUP',
  ]);

  static sanitizeMethod(rawMethod?: string): string {
    if (!rawMethod) return '';
    const upper = rawMethod.trim().toUpperCase();
    if (this.KNOWN_METHODS.has(upper)) {
      return upper;
    }
    return 'UNKNOWN_METHOD';
  }

  static formatEntry(entry: SafeLogEntry): string {
    const parts: string[] = [
      `[${entry.level}]`,
      entry.event,
      entry.method ? this.sanitizeMethod(entry.method) : '',
      entry.route ? this.sanitizeRoute(entry.route) : '',
      entry.statusCode !== undefined ? String(entry.statusCode) : '',
      entry.errorCode ? `(${entry.errorCode})` : '',
      entry.durationMs !== undefined ? `${entry.durationMs.toFixed(2)}ms` : '',
    ].filter(Boolean);

    // Guaranteed single line output with zero CR/LF injection
    return parts.join(' ').replace(/[\r\n\x00-\x1F\x7F]/g, ' ');
  }

  static info(
    event: SafeLogEvent,
    meta?: Omit<SafeLogEntry, 'level' | 'event'>,
  ): void {
    const entry: SafeLogEntry = { level: 'INFO', event, ...meta };
    if (process.env.BFF_ENABLE_CONSOLE_LOGS === 'true') {
      console.log(this.formatEntry(entry));
    }
  }

  static warn(
    event: SafeLogEvent,
    meta?: Omit<SafeLogEntry, 'level' | 'event'>,
  ): void {
    const entry: SafeLogEntry = { level: 'WARN', event, ...meta };
    if (process.env.BFF_ENABLE_CONSOLE_LOGS === 'true') {
      console.warn(this.formatEntry(entry));
    }
  }

  static error(
    event: SafeLogEvent,
    meta?: Omit<SafeLogEntry, 'level' | 'event'>,
  ): void {
    const entry: SafeLogEntry = { level: 'ERROR', event, ...meta };
    if (process.env.BFF_ENABLE_CONSOLE_LOGS === 'true') {
      console.error(this.formatEntry(entry));
    }
  }
}
