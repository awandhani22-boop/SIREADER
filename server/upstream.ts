/**
 * SIREADER Phase 3.2 BFF — fixed, bounded Python API proxy.
 * Only fixed loopback destinations and five compile-time paths are permitted.
 * Browser headers are never forwarded; redirects, oversized bodies and invalid
 * DTOs are rejected before data is returned to the browser.
 */
import type { RequestHandler } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isValidJsonContentType } from './guards.ts';
import { sendBffError } from './errors.ts';
import { SafeLogger } from './log.ts';

export const UPSTREAM_ORIGIN = 'http://127.0.0.1:8000' as const;
export const UPSTREAM_TIMEOUT_MS = 5_000;
export const UPSTREAM_MAX_RESPONSE_BYTES = 1_048_576;

export const UPSTREAM_API_PATHS = Object.freeze([
  '/api/v1/system/status',
  '/api/v1/telemetry/usage',
  '/api/v1/pipeline/active',
  '/api/v1/market-watches/active',
  '/api/v1/audit/decisions',
] as const);
export type UpstreamApiPath = (typeof UPSTREAM_API_PATHS)[number];

export interface UpstreamProxyOptions {
  /** Dependency-injection seams for tests; production uses the fixed defaults. */
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly tokenProvider?: () => string | undefined;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

type JsonObject = Record<string, unknown>;
type Validator = (value: unknown) => boolean;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
function isInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
function isFiniteNumber(value: unknown, minimum = Number.NEGATIVE_INFINITY): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}
function isDecimal(value: unknown, nullable = false): boolean {
  if (nullable && value === null) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return false;
  return Number.isFinite(Number(value));
}
function isIsoDateTime(value: unknown): boolean {
  return isString(value) && value.includes('T') && Number.isFinite(Date.parse(value));
}
function isIsoDate(value: unknown): boolean {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function hasCurrency(value: unknown): value is 'IDR' | 'USD' {
  return value === 'IDR' || value === 'USD';
}
function validTokenBreakdown(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'thinking_tokens']) &&
    isInteger(value.input_tokens) &&
    isInteger(value.output_tokens) &&
    isInteger(value.cache_read_tokens) &&
    isInteger(value.cache_write_tokens) &&
    isInteger(value.thinking_tokens)
  );
}
function validRuntimeControl(value: unknown): boolean {
  if (value === null) return true;
  return (
    isObject(value) &&
    hasExactKeys(value, ['execution_mode', 'trading_mode', 'auto_execution_enabled', 'auto_paused', 'updated_at']) &&
    isString(value.execution_mode) &&
    isString(value.trading_mode) &&
    isBoolean(value.auto_execution_enabled) &&
    isBoolean(value.auto_paused) &&
    isIsoDateTime(value.updated_at)
  );
}

const validateSystemStatus: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['api_status', 'database_status', 'server_time_utc', 'runtime_control', 'process_monitoring_note']) &&
  (value.api_status === 'HEALTHY' || value.api_status === 'DEGRADED') &&
  (value.database_status === 'CONNECTED' || value.database_status === 'DISCONNECTED') &&
  isIsoDateTime(value.server_time_utc) &&
  validRuntimeControl(value.runtime_control) &&
  isString(value.process_monitoring_note);

function validCurrencyTelemetry(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ['currency', 'total_cost', 'total_reserved', 'total_projected', 'total_requests', 'tokens', 'status_counts']) || !hasCurrency(value.currency)) return false;
  return (
    isDecimal(value.total_cost) &&
    isDecimal(value.total_reserved) &&
    isDecimal(value.total_projected) &&
    isInteger(value.total_requests) &&
    validTokenBreakdown(value.tokens) &&
    isObject(value.status_counts) &&
    Object.values(value.status_counts).every((count) => isInteger(count))
  );
}
function validModelTelemetry(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['model', 'tier', 'currency', 'requests', 'cost', 'reserved', 'projected', 'tokens']) &&
    isString(value.model) &&
    isString(value.tier) &&
    hasCurrency(value.currency) &&
    isInteger(value.requests) &&
    isDecimal(value.cost) &&
    isDecimal(value.reserved) &&
    isDecimal(value.projected) &&
    validTokenBreakdown(value.tokens)
  );
}
const validateTelemetryUsage: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['period_start', 'period_end', 'period_days', 'currencies', 'models']) &&
  isIsoDate(value.period_start) &&
  isIsoDate(value.period_end) &&
  isInteger(value.period_days, 1) &&
  Array.isArray(value.currencies) &&
  value.currencies.every(validCurrencyTelemetry) &&
  Array.isArray(value.models) &&
  value.models.every(validModelTelemetry);

function validInFlightTask(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['task_id', 'status', 'liveness_status', 'created_at', 'elapsed_seconds']) &&
    isInteger(value.task_id, 1) &&
    value.status === 'PROCESSING' &&
    value.liveness_status === 'IN_FLIGHT_UNCONFIRMED' &&
    isIsoDateTime(value.created_at) &&
    isFiniteNumber(value.elapsed_seconds, 0)
  );
}
function validQueuedMessage(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['queue_item_id', 'status', 'queue_reason', 'attempts', 'claimed_at', 'created_at', 'updated_at']) &&
    isInteger(value.queue_item_id, 1) &&
    (value.status === 'PENDING' || value.status === 'CLAIMED') &&
    (value.queue_reason === 'BLOCKED_HARD_BUDGET' ||
      value.queue_reason === 'MANUAL_REVIEW_BUDGET' ||
      value.queue_reason === 'OTHER') &&
    isInteger(value.attempts) &&
    (value.claimed_at === null || isIsoDateTime(value.claimed_at)) &&
    isIsoDateTime(value.created_at) &&
    isIsoDateTime(value.updated_at)
  );
}
const validateActivePipeline: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'total_in_flight', 'total_queued', 'in_flight_tasks', 'queued_messages']) &&
  isIsoDateTime(value.server_time_utc) &&
  isInteger(value.total_in_flight) &&
  isInteger(value.total_queued) &&
  Array.isArray(value.in_flight_tasks) &&
  value.in_flight_tasks.every(validInFlightTask) &&
  Array.isArray(value.queued_messages) &&
  value.queued_messages.every(validQueuedMessage);

function validMarketWatch(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['watch_id', 'symbol', 'status', 'spread_pips', 'maximum_spread_pips', 'last_bid', 'last_ask', 'check_count', 'last_checked_at', 'next_check_at', 'created_at']) &&
    isInteger(value.watch_id, 1) &&
    isString(value.symbol) &&
    (value.status === 'WAITING_FOR_SPREAD' || value.status === 'RECHECKING') &&
    isDecimal(value.spread_pips, true) &&
    isDecimal(value.maximum_spread_pips) &&
    isDecimal(value.last_bid, true) &&
    isDecimal(value.last_ask, true) &&
    isInteger(value.check_count) &&
    (value.last_checked_at === null || isIsoDateTime(value.last_checked_at)) &&
    isIsoDateTime(value.next_check_at) &&
    isIsoDateTime(value.created_at)
  );
}
const validateActiveMarketWatches: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'total_active_watches', 'watches']) &&
  isIsoDateTime(value.server_time_utc) &&
  isInteger(value.total_active_watches) &&
  Array.isArray(value.watches) &&
  value.watches.every(validMarketWatch);

function validAuditDecision(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['audit_id', 'decision', 'previous_status', 'new_status', 'reviewer_role', 'decided_at']) &&
    isInteger(value.audit_id, 1) &&
    (value.decision === 'APPROVED' || value.decision === 'REJECTED') &&
    isString(value.previous_status) &&
    isString(value.new_status) &&
    value.reviewer_role === 'Authorized Approver' &&
    isIsoDateTime(value.decided_at)
  );
}
const validateAuditDecisions: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'total_returned', 'offset', 'decisions']) &&
  isIsoDateTime(value.server_time_utc) &&
  isInteger(value.total_returned) &&
  isInteger(value.offset) &&
  Array.isArray(value.decisions) &&
  value.decisions.every(validAuditDecision);

const RESPONSE_VALIDATORS: Readonly<Record<UpstreamApiPath, Validator>> = Object.freeze({
  '/api/v1/system/status': validateSystemStatus,
  '/api/v1/telemetry/usage': validateTelemetryUsage,
  '/api/v1/pipeline/active': validateActivePipeline,
  '/api/v1/market-watches/active': validateActiveMarketWatches,
  '/api/v1/audit/decisions': validateAuditDecisions,
});

class UpstreamResponseTooLargeError extends Error {}
class UpstreamBodyError extends Error {}

function resolveBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid upstream origin configuration.');
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Upstream origin must be a plain HTTP loopback origin.');
  }
  return parsed.origin;
}

function readServerToken(): string | undefined {
  const raw = process.env.SIREADER_API_AUTH_TOKEN;
  if (raw === undefined) return undefined;
  const token = raw.trim();
  if (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) return undefined;
  return token;
}
async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
async function readBoundedBody(response: Response, maximumBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      await cancelBody(response);
      throw new UpstreamBodyError();
    }
    if (declaredBytes > maximumBytes) {
      await cancelBody(response);
      throw new UpstreamResponseTooLargeError();
    }
  }
  if (!response.body) throw new UpstreamBodyError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new UpstreamResponseTooLargeError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(joined);
  } catch {
    throw new UpstreamBodyError();
  }
}

export function createUpstreamHandlers(
  options: UpstreamProxyOptions = {},
): Readonly<Record<UpstreamApiPath, RequestHandler>> {
  const origin = resolveBaseUrl(options.baseUrl ?? UPSTREAM_ORIGIN);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenProvider = options.tokenProvider ?? readServerToken;
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const maximumBytes = options.maxResponseBytes ?? UPSTREAM_MAX_RESPONSE_BYTES;

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > UPSTREAM_TIMEOUT_MS) {
    throw new Error('Upstream timeout must be between 1 and 5000 milliseconds.');
  }
  if (!Number.isInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > UPSTREAM_MAX_RESPONSE_BYTES) {
    throw new Error('Upstream response limit must be between 1 byte and 1 MiB.');
  }

  const handlers = {} as Record<UpstreamApiPath, RequestHandler>;
  for (const path of UPSTREAM_API_PATHS) {
    handlers[path] = async (_req, res): Promise<void> => {
      let token: string | undefined;
      try {
        token = tokenProvider();
      } catch {
        token = undefined;
      }
      if (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
        SafeLogger.warn('UPSTREAM_AUTH_MISSING', {
          method: 'GET', route: path, statusCode: 503, errorCode: 'UPSTREAM_AUTH_FAILED',
        });
        sendBffError(res, 503, 'UPSTREAM_AUTH_FAILED', 'Backend authentication is not configured.');
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const target = new URL(path, origin);
        const upstream = await fetchImpl(target, {
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/json',
          },
          redirect: 'manual',
          signal: controller.signal,
        });

        if (upstream.status >= 300 && upstream.status < 400) {
          await cancelBody(upstream);
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'GET', route: path, statusCode: 502, errorCode: 'BACKEND_ERROR',
          });
          sendBffError(res, 502, 'BACKEND_ERROR', 'Backend returned an unsupported redirect.');
          return;
        }

        if (upstream.status !== 200) {
          const authFailure = upstream.status === 401 || upstream.status === 403;
          await cancelBody(upstream);
          SafeLogger.warn('UPSTREAM_REQUEST_FAILED', {
            method: 'GET', route: path, statusCode: 502,
            errorCode: authFailure ? 'UPSTREAM_AUTH_FAILED' : 'BACKEND_ERROR',
          });
          sendBffError(
            res, 502, authFailure ? 'UPSTREAM_AUTH_FAILED' : 'BACKEND_ERROR',
            authFailure ? 'Backend authentication failed.' : 'Backend request failed.',
          );
          return;
        }

        if (!isValidJsonContentType(upstream.headers.get('content-type') ?? undefined)) {
          await cancelBody(upstream);
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'GET', route: path, statusCode: 502,
            errorCode: 'INVALID_UPSTREAM_CONTENT_TYPE',
          });
          sendBffError(
            res, 502, 'INVALID_UPSTREAM_CONTENT_TYPE',
            'Backend returned an unsupported response content type.',
          );
          return;
        }

        const bodyText = await readBoundedBody(upstream, maximumBytes);
        let payload: unknown;
        try {
          payload = JSON.parse(bodyText);
        } catch {
          throw new UpstreamBodyError();
        }

        if (!RESPONSE_VALIDATORS[path](payload)) {
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'GET', route: path, statusCode: 502, errorCode: 'SCHEMA_INVALID',
          });
          sendBffError(
            res, 502, 'SCHEMA_INVALID',
            'Backend response did not match the required API contract.',
          );
          return;
        }
        res.status(200).json(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          SafeLogger.warn('UPSTREAM_TIMEOUT', {
            method: 'GET', route: path, statusCode: 504, errorCode: 'TIMEOUT',
          });
          sendBffError(res, 504, 'TIMEOUT', 'Backend request timed out.');
          return;
        }
        if (error instanceof UpstreamResponseTooLargeError) {
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'GET', route: path, statusCode: 502, errorCode: 'TOO_LARGE',
          });
          sendBffError(res, 502, 'TOO_LARGE', 'Backend response exceeds the 1 MiB limit.');
          return;
        }
        if (error instanceof UpstreamBodyError) {
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'GET', route: path, statusCode: 502, errorCode: 'SCHEMA_INVALID',
          });
          sendBffError(res, 502, 'SCHEMA_INVALID', 'Backend response body was invalid.');
          return;
        }
        SafeLogger.warn('UPSTREAM_REQUEST_FAILED', {
          method: 'GET', route: path, statusCode: 502, errorCode: 'UNREACHABLE',
        });
        sendBffError(res, 502, 'UNREACHABLE', 'Backend service is unavailable.');
      } finally {
        clearTimeout(timer);
      }
    };
  }
  return Object.freeze(handlers);
}


export const UPSTREAM_SSE_PATH = '/api/v1/events/stream' as const;
export const UPSTREAM_SSE_MAX_CONNECTIONS = 4;
export const UPSTREAM_SSE_ESTABLISH_TIMEOUT_MS = 5_000;
const LAST_EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]{0,18}$/;

export function isValidLastEventId(value: string): boolean {
  return value.length <= 64 && LAST_EVENT_ID_PATTERN.test(value);
}

/**
 * Authenticated, fixed-path streaming proxy. Only the upstream connection
 * establishment is timed; an established event stream is intentionally long-lived.
 * Node's stream pipeline provides bounded backpressure and tears down both sides
 * when the browser disconnects.
 */
export function createUpstreamSseHandler(
  options: UpstreamProxyOptions = {},
): RequestHandler {
  const origin = resolveBaseUrl(options.baseUrl ?? UPSTREAM_ORIGIN);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenProvider = options.tokenProvider ?? readServerToken;
  const timeoutMs = options.timeoutMs ?? UPSTREAM_SSE_ESTABLISH_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > UPSTREAM_SSE_ESTABLISH_TIMEOUT_MS) {
    throw new Error('SSE upstream establishment timeout must be between 1 and 5000 milliseconds.');
  }

  let activeStreams = 0;

  return async (req, res): Promise<void> => {
    if (activeStreams >= UPSTREAM_SSE_MAX_CONNECTIONS) {
      sendBffError(res, 503, 'UNREACHABLE', 'Backend event stream capacity is reached.', { 'Retry-After': '5' });
      return;
    }

    const rawCursor = req.headers['last-event-id'];
    if (rawCursor !== undefined &&
        (typeof rawCursor !== 'string' || !isValidLastEventId(rawCursor))) {
      sendBffError(res, 400, 'BAD_REQUEST', 'Last-Event-ID is invalid.');
      return;
    }

    let token: string | undefined;
    try {
      token = tokenProvider();
    } catch {
      token = undefined;
    }
    if (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
      SafeLogger.warn('UPSTREAM_AUTH_MISSING', {
        method: 'GET', route: UPSTREAM_SSE_PATH, statusCode: 503, errorCode: 'UPSTREAM_AUTH_FAILED',
      });
      sendBffError(res, 503, 'UPSTREAM_AUTH_FAILED', 'Backend authentication is not configured.');
      return;
    }

    activeStreams += 1;
    const controller = new AbortController();
    let established = false;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      activeStreams = Math.max(0, activeStreams - 1);
      if (!controller.signal.aborted) controller.abort();
    };
    const onClientClose = () => {
      if (!res.writableEnded) cleanup();
    };
    res.once('close', onClientClose);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const target = new URL(UPSTREAM_SSE_PATH, origin);
      const headers: Record<string, string> = {
        Authorization: 'Bearer ' + token,
        Accept: 'text/event-stream',
      };
      if (typeof rawCursor === 'string') headers['Last-Event-ID'] = rawCursor;

      const upstream = await fetchImpl(target, {
        method: 'GET',
        headers,
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (upstream.status !== 200) {
        await cancelBody(upstream);
        const authFailure = upstream.status === 401 || upstream.status === 403;
        const unavailable = upstream.status === 503;
        SafeLogger.warn('UPSTREAM_SSE_REJECTED', {
          method: 'GET', route: UPSTREAM_SSE_PATH,
          statusCode: unavailable ? 503 : 502,
          errorCode: authFailure ? 'UPSTREAM_AUTH_FAILED' : 'BACKEND_ERROR',
        });
        sendBffError(
          res,
          unavailable ? 503 : 502,
          authFailure ? 'UPSTREAM_AUTH_FAILED' : unavailable ? 'UNREACHABLE' : 'BACKEND_ERROR',
          authFailure ? 'Backend authentication failed.' : 'Backend event stream is unavailable.',
          unavailable ? { 'Retry-After': '5' } : undefined,
        );
        cleanup();
        return;
      }

      const contentType = upstream.headers.get('content-type') ?? '';
      if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream' || !upstream.body) {
        await cancelBody(upstream);
        SafeLogger.warn('UPSTREAM_SSE_REJECTED', {
          method: 'GET', route: UPSTREAM_SSE_PATH,
          statusCode: 502, errorCode: 'INVALID_UPSTREAM_CONTENT_TYPE',
        });
        sendBffError(res, 502, 'INVALID_UPSTREAM_CONTENT_TYPE', 'Backend returned an invalid event stream.');
        cleanup();
        return;
      }

      established = true;
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.flushHeaders();

      SafeLogger.info('UPSTREAM_SSE_OPENED', {
        method: 'GET', route: UPSTREAM_SSE_PATH, statusCode: 200,
      });
      await pipeline(Readable.fromWeb(upstream.body as never), res);
    } catch (error) {
      if (res.destroyed) {
        // The browser has already gone away; do not attempt to write a JSON error
        // to a closed socket. cleanup() below still aborts the upstream fetch.
      } else if (!res.headersSent) {
        const timedOut = controller.signal.aborted;
        SafeLogger.warn(timedOut ? 'UPSTREAM_SSE_TIMEOUT' : 'UPSTREAM_SSE_FAILED', {
          method: 'GET', route: UPSTREAM_SSE_PATH,
          statusCode: timedOut ? 504 : 502,
          errorCode: timedOut ? 'TIMEOUT' : 'UNREACHABLE',
        });
        sendBffError(
          res, timedOut ? 504 : 502, timedOut ? 'TIMEOUT' : 'UNREACHABLE',
          timedOut ? 'Backend event stream connection timed out.' : 'Backend event stream is unavailable.',
        );
      } else {
        res.destroy();
      }
    } finally {
      clearTimeout(timer);
      res.removeListener('close', onClientClose);
      cleanup();
      if (established) {
        SafeLogger.info('UPSTREAM_SSE_CLOSED', {
          method: 'GET', route: UPSTREAM_SSE_PATH, statusCode: res.statusCode || 200,
        });
      }
    }
  };
}
