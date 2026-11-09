/**
 * SIREADER Phase 3.2 BFF — fixed, bounded Python API proxy.
 * Only fixed loopback destinations and five compile-time paths are permitted.
 * Browser headers are never forwarded; redirects, oversized bodies and invalid
 * DTOs are rejected before data is returned to the browser.
 */
import type { RequestHandler } from 'express';
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
  '/api/v1/workforce/runtime',
  '/api/v1/workforce/tasks',
  '/api/v1/workforce/attempts',
  '/api/v1/workforce/activity',
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


const WORKFORCE_PROCESS_STATUSES = [
  'STARTING', 'READY', 'DRAINING', 'STOPPED', 'FAILED', 'STALE', 'OFFLINE', 'DISABLED',
] as const;
const WORKFORCE_TASK_STATUSES = [
  'QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_WAIT', 'WAITING_REVIEW',
  'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTERED',
] as const;
const WORKFORCE_ATTEMPT_STATUSES = [
  'CLAIMED', 'STARTED', 'PROVIDER_REQUESTED', 'COMPLETED',
  'FAILED', 'TIMED_OUT', 'UNKNOWN', 'CANCELLED',
] as const;
const WORKFORCE_ACTIVITY_TYPES = [
  'TASK_ENQUEUED', 'TASK_CLAIMED', 'TASK_STARTED', 'PROVIDER_REQUESTED',
  'TASK_RETRIED', 'TASK_COMPLETED', 'TASK_FAILED', 'TASK_CANCELLED',
  'TASK_WAITING_REVIEW', 'TASK_DEAD_LETTERED', 'WORKER_HEARTBEAT', 'WORKER_STATE_CHANGED',
] as const;

function validNullableDateTime(value: unknown): boolean {
  return value === null || isIsoDateTime(value);
}

function validWorkforceWorker(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'worker_id', 'display_name', 'role', 'department', 'enabled',
      'max_concurrency', 'model_tier', 'capability_ids', 'process_status',
      'heartbeat_at', 'active_task_count', 'in_flight_provider_requests',
      'schema_version', 'created_at', 'updated_at',
    ]) &&
    isString(value.worker_id) && value.worker_id.length >= 2 && value.worker_id.length <= 64 &&
    isString(value.display_name) && isString(value.role) && isString(value.department) &&
    isBoolean(value.enabled) &&
    isInteger(value.max_concurrency, 1) && value.max_concurrency <= 32 &&
    ['NONE', 'FAST', 'REASONING', 'ESCALATION'].includes(String(value.model_tier)) &&
    Array.isArray(value.capability_ids) && value.capability_ids.length <= 28 &&
    value.capability_ids.every((item) => isString(item) && /^[a-z][a-z0-9_]{1,63}$/.test(item)) &&
    WORKFORCE_PROCESS_STATUSES.includes(value.process_status as typeof WORKFORCE_PROCESS_STATUSES[number]) &&
    validNullableDateTime(value.heartbeat_at) &&
    isInteger(value.active_task_count) &&
    isInteger(value.in_flight_provider_requests) &&
    value.schema_version === 1 &&
    isIsoDateTime(value.created_at) && isIsoDateTime(value.updated_at)
  );
}

function validWorkforceRuntime(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'observed_at', 'configured_workers', 'ready_workers', 'stale_workers',
      'offline_workers', 'active_tasks', 'queued_tasks', 'waiting_review_tasks',
      'dead_lettered_tasks', 'completed_last_24h',
    ]) &&
    isIsoDateTime(value.observed_at) &&
    isInteger(value.configured_workers) && isInteger(value.ready_workers) &&
    isInteger(value.stale_workers) && isInteger(value.offline_workers) &&
    isInteger(value.active_tasks) && isInteger(value.queued_tasks) &&
    isInteger(value.waiting_review_tasks) && isInteger(value.dead_lettered_tasks) &&
    isInteger(value.completed_last_24h)
  );
}

function validWorkforceTask(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'task_id', 'correlation_id', 'schema_version', 'task_type', 'title',
      'required_capability', 'requested_worker_id', 'assigned_worker_id',
      'priority', 'status', 'attempts', 'max_attempts', 'not_before',
      'deadline_at', 'lease_expires_at', 'failure_code', 'created_at',
      'updated_at', 'completed_at',
    ]) &&
    isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    isString(value.correlation_id) && value.correlation_id.length >= 8 && value.correlation_id.length <= 64 &&
    value.schema_version === 1 &&
    isString(value.task_type) && isString(value.title) && isString(value.required_capability) &&
    (value.requested_worker_id === null || isString(value.requested_worker_id)) &&
    (value.assigned_worker_id === null || isString(value.assigned_worker_id)) &&
    isInteger(value.priority, 1) && value.priority <= 100 &&
    WORKFORCE_TASK_STATUSES.includes(value.status as typeof WORKFORCE_TASK_STATUSES[number]) &&
    isInteger(value.attempts) && value.attempts <= 100 &&
    isInteger(value.max_attempts, 1) && value.max_attempts <= 10 &&
    isIsoDateTime(value.not_before) &&
    validNullableDateTime(value.deadline_at) &&
    validNullableDateTime(value.lease_expires_at) &&
    (value.failure_code === null || isString(value.failure_code)) &&
    isIsoDateTime(value.created_at) && isIsoDateTime(value.updated_at) &&
    validNullableDateTime(value.completed_at)
  );
}

const validateWorkforceRuntime: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'runtime', 'workers']) &&
  isIsoDateTime(value.server_time_utc) &&
  validWorkforceRuntime(value.runtime) &&
  Array.isArray(value.workers) &&
  value.workers.length <= 100 &&
  value.workers.every(validWorkforceWorker);

const validateWorkforceTasks: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'total_count', 'limit', 'offset', 'tasks']) &&
  isIsoDateTime(value.server_time_utc) &&
  isInteger(value.total_count) &&
  isInteger(value.limit, 1) && value.limit <= 100 &&
  isInteger(value.offset) &&
  Array.isArray(value.tasks) && value.tasks.length <= 100 &&
  value.tasks.every(validWorkforceTask);

function validWorkforceAttempt(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'attempt_id', 'task_id', 'attempt_number', 'worker_id', 'status',
      'billing_currency', 'cost_amount', 'error_code', 'started_at',
      'finished_at', 'created_at',
    ]) &&
    isString(value.attempt_id) && value.attempt_id.length >= 8 && value.attempt_id.length <= 64 &&
    isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    isInteger(value.attempt_number, 1) && value.attempt_number <= 10 &&
    isString(value.worker_id) &&
    WORKFORCE_ATTEMPT_STATUSES.includes(value.status as typeof WORKFORCE_ATTEMPT_STATUSES[number]) &&
    (value.billing_currency === null || hasCurrency(value.billing_currency)) &&
    isDecimal(value.cost_amount, true) &&
    (value.error_code === null || isString(value.error_code)) &&
    validNullableDateTime(value.started_at) &&
    validNullableDateTime(value.finished_at) &&
    isIsoDateTime(value.created_at)
  );
}

const validateWorkforceAttempts: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'task_id', 'attempts']) &&
  isIsoDateTime(value.server_time_utc) &&
  isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
  Array.isArray(value.attempts) && value.attempts.length <= 10 &&
  value.attempts.every(validWorkforceAttempt);

function validWorkforceActivity(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'event_id', 'event_type', 'occurred_at', 'worker_id',
      'task_id', 'attempt_id', 'correlation_id',
    ]) &&
    isString(value.event_id) && value.event_id.length >= 8 && value.event_id.length <= 64 &&
    WORKFORCE_ACTIVITY_TYPES.includes(value.event_type as typeof WORKFORCE_ACTIVITY_TYPES[number]) &&
    isIsoDateTime(value.occurred_at) &&
    (value.worker_id === null || isString(value.worker_id)) &&
    (value.task_id === null || isString(value.task_id)) &&
    (value.attempt_id === null || isString(value.attempt_id)) &&
    isString(value.correlation_id) && value.correlation_id.length >= 8 && value.correlation_id.length <= 64
  );
}

const validateWorkforceActivity: Validator = (value) =>
  isObject(value) &&
  hasExactKeys(value, ['server_time_utc', 'total_count', 'limit', 'offset', 'events']) &&
  isIsoDateTime(value.server_time_utc) &&
  isInteger(value.total_count) &&
  isInteger(value.limit, 1) && value.limit <= 100 &&
  isInteger(value.offset) &&
  Array.isArray(value.events) && value.events.length <= 100 &&
  value.events.every(validWorkforceActivity);

const RESPONSE_VALIDATORS: Readonly<Record<UpstreamApiPath, Validator>> = Object.freeze({
  '/api/v1/system/status': validateSystemStatus,
  '/api/v1/telemetry/usage': validateTelemetryUsage,
  '/api/v1/pipeline/active': validateActivePipeline,
  '/api/v1/market-watches/active': validateActiveMarketWatches,
  '/api/v1/audit/decisions': validateAuditDecisions,
  '/api/v1/workforce/runtime': validateWorkforceRuntime,
  '/api/v1/workforce/tasks': validateWorkforceTasks,
  '/api/v1/workforce/attempts': validateWorkforceAttempts,
  '/api/v1/workforce/activity': validateWorkforceActivity,
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

export function readServerToken(): string | undefined {
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
    handlers[path] = async (req, res): Promise<void> => {
      let taskId: string | undefined;
      if (path === '/api/v1/workforce/attempts') {
        const rawTaskId = req.query.task_id;
        if (
          typeof rawTaskId !== 'string' ||
          !/^[A-Za-z0-9_-]{8,64}$/.test(rawTaskId) ||
          Object.keys(req.query).length !== 1
        ) {
          sendBffError(res, 400, 'BAD_REQUEST', 'A valid task_id query parameter is required.');
          return;
        }
        taskId = rawTaskId;
      }
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
        if (taskId !== undefined) target.searchParams.set('task_id', taskId);
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
