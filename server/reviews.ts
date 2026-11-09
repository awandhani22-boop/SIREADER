/** Fixed read-only BFF proxy for human output reviews. */
import type { RequestHandler } from 'express';
import { sendBffError } from './errors.ts';
import { SafeLogger } from './log.ts';

export const REVIEW_READ_ORIGIN = 'http://127.0.0.1:8000' as const;
const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1_048_576;

export interface ReviewReadProxyOptions {
  readonly tokenProvider?: () => string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function isDateTime(value: unknown): boolean {
  return typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value));
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
function nullableDateTime(value: unknown): boolean {
  return value === null || isDateTime(value);
}
function validReviewSummary(value: unknown): boolean {
  if (!isObject(value) || !exactKeys(value, [
    'review_id', 'task_id', 'attempt_id', 'status', 'original_output_sha256',
    'adjusted_output_sha256', 'adjudicated_by', 'adjudicated_at', 'reason_code',
    'notes', 'review_expires_at', 'created_at', 'updated_at', 'payload_purged_at',
  ])) return false;
  return typeof value.review_id === 'string' && /^rev_[A-Za-z0-9_-]{8,60}$/.test(value.review_id) &&
    typeof value.task_id === 'string' && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    typeof value.attempt_id === 'string' && value.attempt_id.length >= 8 && value.attempt_id.length <= 64 &&
    ['PENDING', 'APPROVED', 'EDITED', 'REJECTED', 'EXPIRED'].includes(String(value.status)) &&
    typeof value.original_output_sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.original_output_sha256) &&
    (value.adjusted_output_sha256 === null || (typeof value.adjusted_output_sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.adjusted_output_sha256))) &&
    nullableString(value.adjudicated_by) && nullableDateTime(value.adjudicated_at) &&
    nullableString(value.reason_code) && nullableString(value.notes) &&
    isDateTime(value.review_expires_at) && isDateTime(value.created_at) &&
    isDateTime(value.updated_at) && nullableDateTime(value.payload_purged_at);
}
export function validateWorkforceReviewsResponse(value: unknown): boolean {
  return isObject(value) && exactKeys(value, ['server_time_utc', 'total_count', 'limit', 'offset', 'reviews']) &&
    isDateTime(value.server_time_utc) &&
    typeof value.total_count === 'number' && Number.isSafeInteger(value.total_count) && value.total_count >= 0 &&
    typeof value.limit === 'number' && Number.isSafeInteger(value.limit) && value.limit >= 1 && value.limit <= 100 &&
    typeof value.offset === 'number' && Number.isSafeInteger(value.offset) && value.offset >= 0 &&
    Array.isArray(value.reviews) && value.reviews.length <= 100 && value.reviews.every(validReviewSummary);
}
export function validateWorkforceReviewDetail(value: unknown): boolean {
  if (!isObject(value) || !exactKeys(value, [
    'review_id', 'task_id', 'attempt_id', 'status', 'original_output_sha256',
    'adjusted_output_sha256', 'adjudicated_by', 'adjudicated_at', 'reason_code',
    'notes', 'review_expires_at', 'created_at', 'updated_at', 'payload_purged_at',
    'original_output', 'adjusted_output',
  ]) || !validReviewSummary(Object.fromEntries(Object.entries(value).filter(([key]) =>
    key !== 'original_output' && key !== 'adjusted_output',
  )))) return false;
  return (value.original_output === null || isObject(value.original_output)) &&
    (value.adjusted_output === null || isObject(value.adjusted_output));
}
async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
async function readBoundedJson(response: Response): Promise<unknown> {
  if ((response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('INVALID_CONTENT_TYPE');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    throw new Error('TOO_LARGE');
  }
  if (!response.body) throw new Error('INVALID_BODY');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
function readToken(): string | undefined {
  const token = process.env.SIREADER_API_AUTH_TOKEN?.trim();
  return token && /^[A-Za-z0-9._~+/-]+=*$/.test(token) ? token : undefined;
}

export function createReviewReadHandlers(options: ReviewReadProxyOptions = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenProvider = options.tokenProvider ?? readToken;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) {
    throw new Error('Review read timeout must be between 1 and 5000 milliseconds.');
  }

  const proxy = (backendPath: (req: Parameters<RequestHandler>[0]) => string, validate: (value: unknown) => boolean): RequestHandler =>
    async (req, res): Promise<void> => {
      const token = tokenProvider();
      if (!token || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
        sendBffError(res, 503, 'UPSTREAM_AUTH_FAILED', 'Backend authentication is not configured.');
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const upstream = await fetchImpl(new URL(backendPath(req), REVIEW_READ_ORIGIN), {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          redirect: 'manual',
          signal: controller.signal,
        });
        if (upstream.status >= 300 && upstream.status < 400) {
          await cancelBody(upstream);
          sendBffError(res, 502, 'BACKEND_ERROR', 'Backend returned an unsupported redirect.');
          return;
        }
        if (upstream.status !== 200) {
          const status = upstream.status;
          await cancelBody(upstream);
          sendBffError(res, status === 401 || status === 403 ? 502 : status === 404 ? 404 : 502,
            status === 401 || status === 403 ? 'UPSTREAM_AUTH_FAILED' : status === 404 ? 'NOT_FOUND' : 'BACKEND_ERROR',
            'Review backend request failed.');
          return;
        }
        const payload = await readBoundedJson(upstream);
        if (!validate(payload)) {
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'GET', route: req.path, statusCode: 502, errorCode: 'SCHEMA_INVALID',
          });
          sendBffError(res, 502, 'SCHEMA_INVALID', 'Review backend response did not match the required contract.');
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(payload);
      } catch (error) {
        if (controller.signal.aborted) {
          sendBffError(res, 504, 'TIMEOUT', 'Review backend request timed out.');
        } else if (error instanceof Error && error.message === 'TOO_LARGE') {
          sendBffError(res, 502, 'TOO_LARGE', 'Review backend response exceeds the 1 MiB limit.');
        } else {
          SafeLogger.warn('UPSTREAM_REQUEST_FAILED', {
            method: 'GET', route: req.path, statusCode: 502, errorCode: 'UNREACHABLE',
          });
          sendBffError(res, 502, 'UNREACHABLE', 'Review backend service is unavailable.');
        }
      } finally { clearTimeout(timer); }
    };

  const pending = (backendBase: string): RequestHandler => (req, res, next) => {
    const keys = Object.keys(req.query);
    const validBoundedInteger = (value: unknown, fallback: number, minimum: number, maximum: number): number | null => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,5})$/.test(value)) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
    };
    const limit = validBoundedInteger(req.query.limit, 50, 1, 100);
    const offset = validBoundedInteger(req.query.offset, 0, 0, 100_000);
    if (keys.some((key) => key !== 'limit' && key !== 'offset') || limit === null || offset === null) {
      sendBffError(res, 400, 'BAD_REQUEST', 'Only bounded limit and offset parameters are permitted.');
      return;
    }
    req.params.reviewQuery = backendBase + '?limit=' + limit + '&offset=' + offset;
    proxy((request) => request.params.reviewQuery, validateWorkforceReviewsResponse)(req, res, next);
  };

  const detail = (backendBase: string): RequestHandler => (req, res, next) => {
    const reviewId = req.params.reviewId;
    if (typeof reviewId !== 'string' || !/^rev_[A-Za-z0-9_-]{8,60}$/.test(reviewId)) {
      sendBffError(res, 400, 'BAD_REQUEST', 'A valid review_id path parameter is required.');
      return;
    }
    proxy(() => backendBase + '/' + encodeURIComponent(reviewId), validateWorkforceReviewDetail)(req, res, next);
  };

  return Object.freeze({
    workforcePending: pending('/api/v1/workforce/reviews/pending'),
    governancePending: pending('/api/v1/governance/reviews/pending'),
    workforceDetail: detail('/api/v1/workforce/reviews'),
    governanceDetail: detail('/api/v1/governance/reviews'),
  });
}
