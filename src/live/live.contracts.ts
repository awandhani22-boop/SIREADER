/**
 * Strict browser-side DTO contracts for the authenticated SIREADER BFF.
 *
 * These validators intentionally mirror the Python Pydantic DTOs and the BFF
 * upstream validators. Unknown fields are rejected so schema drift is visible.
 * No provider credentials, database URLs, or operator secrets belong here.
 */
export const LIVE_API_PATHS = Object.freeze([
  '/api/v1/system/status',
  '/api/v1/telemetry/usage',
  '/api/v1/pipeline/active',
  '/api/v1/market-watches/active',
  '/api/v1/audit/decisions',
] as const);

export type LiveApiPath = (typeof LIVE_API_PATHS)[number];
export type CurrencyCode = 'IDR' | 'USD';

export interface RuntimeControlDto {
  readonly execution_mode: string;
  readonly trading_mode: string;
  readonly auto_execution_enabled: boolean;
  readonly auto_paused: boolean;
  readonly updated_at: string;
}

export interface SystemStatusDto {
  readonly api_status: 'HEALTHY' | 'DEGRADED';
  readonly database_status: 'CONNECTED' | 'DISCONNECTED';
  readonly server_time_utc: string;
  readonly runtime_control: RuntimeControlDto | null;
  readonly process_monitoring_note: string;
}

export interface TokenBreakdownDto {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_write_tokens: number;
  readonly thinking_tokens: number;
}

export interface CurrencyTelemetryDto {
  readonly currency: CurrencyCode;
  readonly total_cost: number | string;
  readonly total_reserved: number | string;
  readonly total_projected: number | string;
  readonly total_requests: number;
  readonly tokens: TokenBreakdownDto;
  readonly status_counts: Readonly<Record<string, number>>;
}

export interface ModelTelemetryDto {
  readonly model: string;
  readonly tier: string;
  readonly currency: CurrencyCode;
  readonly requests: number;
  readonly cost: number | string;
  readonly reserved: number | string;
  readonly projected: number | string;
  readonly tokens: TokenBreakdownDto;
}

export interface TelemetryUsageDto {
  readonly period_start: string;
  readonly period_end: string;
  readonly period_days: number;
  readonly currencies: readonly CurrencyTelemetryDto[];
  readonly models: readonly ModelTelemetryDto[];
}

export interface InFlightAnalysisDto {
  readonly task_id: number;
  readonly status: 'PROCESSING';
  readonly liveness_status: 'IN_FLIGHT_UNCONFIRMED';
  readonly created_at: string;
  readonly elapsed_seconds: number;
}

export interface QueuedMessageDto {
  readonly queue_item_id: number;
  readonly status: 'PENDING' | 'CLAIMED';
  readonly queue_reason: 'BLOCKED_HARD_BUDGET' | 'MANUAL_REVIEW_BUDGET' | 'OTHER';
  readonly attempts: number;
  readonly claimed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ActivePipelineDto {
  readonly server_time_utc: string;
  readonly total_in_flight: number;
  readonly total_queued: number;
  readonly in_flight_tasks: readonly InFlightAnalysisDto[];
  readonly queued_messages: readonly QueuedMessageDto[];
}

export interface MarketWatchDto {
  readonly watch_id: number;
  readonly symbol: string;
  readonly status: 'WAITING_FOR_SPREAD' | 'RECHECKING';
  readonly spread_pips: number | string | null;
  readonly maximum_spread_pips: number | string;
  readonly last_bid: number | string | null;
  readonly last_ask: number | string | null;
  readonly check_count: number;
  readonly last_checked_at: string | null;
  readonly next_check_at: string;
  readonly created_at: string;
}

export interface ActiveMarketWatchesDto {
  readonly server_time_utc: string;
  readonly total_active_watches: number;
  readonly watches: readonly MarketWatchDto[];
}

export interface AuditDecisionDto {
  readonly audit_id: number;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly previous_status: string;
  readonly new_status: string;
  readonly reviewer_role: 'Authorized Approver';
  readonly decided_at: string;
}

export interface AuditDecisionsDto {
  readonly server_time_utc: string;
  readonly total_returned: number;
  readonly offset: number;
  readonly decisions: readonly AuditDecisionDto[];
}

export interface LiveApiResponseMap {
  '/api/v1/system/status': SystemStatusDto;
  '/api/v1/telemetry/usage': TelemetryUsageDto;
  '/api/v1/pipeline/active': ActivePipelineDto;
  '/api/v1/market-watches/active': ActiveMarketWatchesDto;
  '/api/v1/audit/decisions': AuditDecisionsDto;
}

export interface AuthenticatedSessionDto {
  readonly authenticated: true;
  readonly csrfToken: string;
}

export interface LoggedOutDto {
  readonly authenticated: false;
}

export const BFF_ERROR_CODES = Object.freeze([
  'BAD_REQUEST',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'SESSION_REQUIRED',
  'AUTH_NOT_CONFIGURED',
  'CSRF_INVALID',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'TIMEOUT',
  'UNREACHABLE',
  'UPSTREAM_AUTH_FAILED',
  'BACKEND_ERROR',
  'TOO_LARGE',
  'INVALID_UPSTREAM_CONTENT_TYPE',
  'SCHEMA_INVALID',
  'NOT_IMPLEMENTED',
] as const);

export type BffErrorCode = (typeof BFF_ERROR_CODES)[number];

export class LiveContractError extends Error {
  readonly code = 'SCHEMA_INVALID' as const;

  constructor() {
    super('The LIVE API response did not match the expected contract.');
    this.name = 'LiveContractError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
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

function hasCurrency(value: unknown): value is CurrencyCode {
  return value === 'IDR' || value === 'USD';
}

function validTokenBreakdown(value: unknown): value is TokenBreakdownDto {
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

function validRuntimeControl(value: unknown): value is RuntimeControlDto | null {
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

function validSystemStatus(value: unknown): value is SystemStatusDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['api_status', 'database_status', 'server_time_utc', 'runtime_control', 'process_monitoring_note']) &&
    (value.api_status === 'HEALTHY' || value.api_status === 'DEGRADED') &&
    (value.database_status === 'CONNECTED' || value.database_status === 'DISCONNECTED') &&
    isIsoDateTime(value.server_time_utc) &&
    validRuntimeControl(value.runtime_control) &&
    isString(value.process_monitoring_note)
  );
}

function validCurrencyTelemetry(value: unknown): value is CurrencyTelemetryDto {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['currency', 'total_cost', 'total_reserved', 'total_projected', 'total_requests', 'tokens', 'status_counts']) ||
    !hasCurrency(value.currency)
  ) return false;

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

function validModelTelemetry(value: unknown): value is ModelTelemetryDto {
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

function validTelemetryUsage(value: unknown): value is TelemetryUsageDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['period_start', 'period_end', 'period_days', 'currencies', 'models']) &&
    isIsoDate(value.period_start) &&
    isIsoDate(value.period_end) &&
    isInteger(value.period_days, 1) &&
    Array.isArray(value.currencies) &&
    value.currencies.every(validCurrencyTelemetry) &&
    Array.isArray(value.models) &&
    value.models.every(validModelTelemetry)
  );
}

function validInFlightTask(value: unknown): value is InFlightAnalysisDto {
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

function validQueuedMessage(value: unknown): value is QueuedMessageDto {
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

function validActivePipeline(value: unknown): value is ActivePipelineDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'total_in_flight', 'total_queued', 'in_flight_tasks', 'queued_messages']) &&
    isIsoDateTime(value.server_time_utc) &&
    isInteger(value.total_in_flight) &&
    isInteger(value.total_queued) &&
    Array.isArray(value.in_flight_tasks) &&
    value.in_flight_tasks.every(validInFlightTask) &&
    Array.isArray(value.queued_messages) &&
    value.queued_messages.every(validQueuedMessage)
  );
}

function validMarketWatch(value: unknown): value is MarketWatchDto {
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

function validActiveMarketWatches(value: unknown): value is ActiveMarketWatchesDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'total_active_watches', 'watches']) &&
    isIsoDateTime(value.server_time_utc) &&
    isInteger(value.total_active_watches) &&
    Array.isArray(value.watches) &&
    value.watches.every(validMarketWatch)
  );
}

function validAuditDecision(value: unknown): value is AuditDecisionDto {
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

function validAuditDecisions(value: unknown): value is AuditDecisionsDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'total_returned', 'offset', 'decisions']) &&
    isIsoDateTime(value.server_time_utc) &&
    isInteger(value.total_returned) &&
    isInteger(value.offset) &&
    Array.isArray(value.decisions) &&
    value.decisions.every(validAuditDecision)
  );
}

export function parseLiveApiResponse<K extends LiveApiPath>(
  path: K,
  value: unknown,
): LiveApiResponseMap[K] {
  let valid = false;
  switch (path) {
    case '/api/v1/system/status':
      valid = validSystemStatus(value);
      break;
    case '/api/v1/telemetry/usage':
      valid = validTelemetryUsage(value);
      break;
    case '/api/v1/pipeline/active':
      valid = validActivePipeline(value);
      break;
    case '/api/v1/market-watches/active':
      valid = validActiveMarketWatches(value);
      break;
    case '/api/v1/audit/decisions':
      valid = validAuditDecisions(value);
      break;
    default:
      throw new LiveContractError();
  }
  if (!valid) throw new LiveContractError();
  return value as LiveApiResponseMap[K];
}

export function parseAuthenticatedSession(value: unknown): AuthenticatedSessionDto {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['authenticated', 'csrfToken']) ||
    value.authenticated !== true ||
    !isString(value.csrfToken) ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken)
  ) throw new LiveContractError();
  return value as AuthenticatedSessionDto;
}

export function parseLoggedOut(value: unknown): LoggedOutDto {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['authenticated']) ||
    value.authenticated !== false
  ) throw new LiveContractError();
  return value as LoggedOutDto;
}

export function parseBffErrorCode(value: unknown): BffErrorCode | null {
  if (!isObject(value) || !hasExactKeys(value, ['error'])) return null;
  const error = value.error;
  if (!isObject(error) || !hasExactKeys(error, ['code', 'message']) || !isString(error.message)) return null;
  return BFF_ERROR_CODES.includes(error.code as BffErrorCode) ? error.code as BffErrorCode : null;
}
