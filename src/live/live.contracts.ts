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
  '/api/v1/workforce/runtime',
  '/api/v1/workforce/tasks',
  '/api/v1/workforce/activity',
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


export type WorkforceProcessStatus =
  | 'STARTING' | 'READY' | 'DRAINING' | 'STOPPED' | 'FAILED'
  | 'STALE' | 'OFFLINE' | 'DISABLED';
export type WorkforceTaskStatus =
  | 'QUEUED' | 'CLAIMED' | 'RUNNING' | 'RETRY_WAIT' | 'WAITING_REVIEW'
  | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DEAD_LETTERED';
export type WorkforceAttemptStatus =
  | 'CLAIMED' | 'STARTED' | 'PROVIDER_REQUESTED' | 'COMPLETED'
  | 'FAILED' | 'TIMED_OUT' | 'UNKNOWN' | 'CANCELLED';
export type WorkforceActivityType =
  | 'TASK_ENQUEUED' | 'TASK_CLAIMED' | 'TASK_STARTED' | 'PROVIDER_REQUESTED'
  | 'TASK_RETRIED' | 'TASK_COMPLETED' | 'TASK_FAILED' | 'TASK_CANCELLED'
  | 'TASK_WAITING_REVIEW' | 'TASK_DEAD_LETTERED' | 'WORKER_HEARTBEAT' | 'WORKER_STATE_CHANGED';

export interface WorkforceWorkerDto {
  readonly worker_id: string;
  readonly display_name: string;
  readonly role: string;
  readonly department: string;
  readonly enabled: boolean;
  readonly accepting_tasks: boolean;
  readonly max_concurrency: number;
  readonly model_tier: 'NONE' | 'FAST' | 'REASONING' | 'ESCALATION';
  readonly capability_ids: readonly string[];
  readonly process_status: WorkforceProcessStatus;
  readonly heartbeat_at: string | null;
  readonly active_task_count: number;
  readonly in_flight_provider_requests: number;
  readonly schema_version: 1;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface WorkforceRuntimeDto {
  readonly observed_at: string;
  readonly configured_workers: number;
  readonly ready_workers: number;
  readonly stale_workers: number;
  readonly offline_workers: number;
  readonly active_tasks: number;
  readonly queued_tasks: number;
  readonly waiting_review_tasks: number;
  readonly dead_lettered_tasks: number;
  readonly completed_last_24h: number;
}

export interface WorkforceRuntimeResponseDto {
  readonly server_time_utc: string;
  readonly runtime: WorkforceRuntimeDto;
  readonly workers: readonly WorkforceWorkerDto[];
}

export interface WorkforceTaskDto {
  readonly task_id: string;
  readonly correlation_id: string;
  readonly schema_version: 1;
  readonly task_type: string;
  readonly title: string;
  readonly required_capability: string;
  readonly requested_worker_id: string | null;
  readonly assigned_worker_id: string | null;
  readonly priority: number;
  readonly status: WorkforceTaskStatus;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly not_before: string;
  readonly deadline_at: string | null;
  readonly lease_expires_at: string | null;
  readonly failure_code: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at: string | null;
}

export interface WorkforceTasksResponseDto {
  readonly server_time_utc: string;
  readonly total_count: number;
  readonly limit: number;
  readonly offset: number;
  readonly tasks: readonly WorkforceTaskDto[];
}

export interface WorkforceAttemptDto {
  readonly attempt_id: string;
  readonly task_id: string;
  readonly attempt_number: number;
  readonly worker_id: string;
  readonly status: WorkforceAttemptStatus;
  readonly billing_currency: CurrencyCode | null;
  readonly cost_amount: number | string | null;
  readonly error_code: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly created_at: string;
}

export interface WorkforceAttemptsResponseDto {
  readonly server_time_utc: string;
  readonly task_id: string;
  readonly attempts: readonly WorkforceAttemptDto[];
}

export interface WorkforceActivityDto {
  readonly event_id: string;
  readonly event_type: WorkforceActivityType;
  readonly occurred_at: string;
  readonly worker_id: string | null;
  readonly task_id: string | null;
  readonly attempt_id: string | null;
  readonly correlation_id: string;
}

export interface WorkforceActivityResponseDto {
  readonly server_time_utc: string;
  readonly total_count: number;
  readonly limit: number;
  readonly offset: number;
  readonly events: readonly WorkforceActivityDto[];
}

export interface LiveApiResponseMap {
  '/api/v1/system/status': SystemStatusDto;
  '/api/v1/telemetry/usage': TelemetryUsageDto;
  '/api/v1/pipeline/active': ActivePipelineDto;
  '/api/v1/market-watches/active': ActiveMarketWatchesDto;
  '/api/v1/audit/decisions': AuditDecisionsDto;
  '/api/v1/workforce/runtime': WorkforceRuntimeResponseDto;
  '/api/v1/workforce/tasks': WorkforceTasksResponseDto;
  '/api/v1/workforce/activity': WorkforceActivityResponseDto;
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


const WORKFORCE_PROCESS_STATUSES: readonly WorkforceProcessStatus[] = [
  'STARTING', 'READY', 'DRAINING', 'STOPPED', 'FAILED', 'STALE', 'OFFLINE', 'DISABLED',
];
const WORKFORCE_TASK_STATUSES: readonly WorkforceTaskStatus[] = [
  'QUEUED', 'CLAIMED', 'RUNNING', 'RETRY_WAIT', 'WAITING_REVIEW',
  'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTERED',
];
const WORKFORCE_ATTEMPT_STATUSES: readonly WorkforceAttemptStatus[] = [
  'CLAIMED', 'STARTED', 'PROVIDER_REQUESTED', 'COMPLETED',
  'FAILED', 'TIMED_OUT', 'UNKNOWN', 'CANCELLED',
];
const WORKFORCE_ACTIVITY_TYPES: readonly WorkforceActivityType[] = [
  'TASK_ENQUEUED', 'TASK_CLAIMED', 'TASK_STARTED', 'PROVIDER_REQUESTED',
  'TASK_RETRIED', 'TASK_COMPLETED', 'TASK_FAILED', 'TASK_CANCELLED',
  'TASK_WAITING_REVIEW', 'TASK_DEAD_LETTERED', 'WORKER_HEARTBEAT', 'WORKER_STATE_CHANGED',
];

function validNullableDateTime(value: unknown): boolean {
  return value === null || isIsoDateTime(value);
}

function validWorkforceWorker(value: unknown): value is WorkforceWorkerDto {
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
    (value.model_tier === 'NONE' || value.model_tier === 'FAST' ||
      value.model_tier === 'REASONING' || value.model_tier === 'ESCALATION') &&
    Array.isArray(value.capability_ids) && value.capability_ids.length <= 28 &&
    value.capability_ids.every((item) => isString(item) && /^[a-z][a-z0-9_]{1,63}$/.test(item)) &&
    WORKFORCE_PROCESS_STATUSES.includes(value.process_status as WorkforceProcessStatus) &&
    validNullableDateTime(value.heartbeat_at) &&
    isInteger(value.active_task_count) &&
    isInteger(value.in_flight_provider_requests) &&
    value.schema_version === 1 &&
    isIsoDateTime(value.created_at) && isIsoDateTime(value.updated_at)
  );
}

function validWorkforceRuntime(value: unknown): value is WorkforceRuntimeDto {
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

function validWorkforceRuntimeResponse(value: unknown): value is WorkforceRuntimeResponseDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'runtime', 'workers']) &&
    isIsoDateTime(value.server_time_utc) &&
    validWorkforceRuntime(value.runtime) &&
    Array.isArray(value.workers) && value.workers.length <= 100 &&
    value.workers.every(validWorkforceWorker)
  );
}

function validWorkforceTask(value: unknown): value is WorkforceTaskDto {
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
    WORKFORCE_TASK_STATUSES.includes(value.status as WorkforceTaskStatus) &&
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

function validWorkforceTasksResponse(value: unknown): value is WorkforceTasksResponseDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'total_count', 'limit', 'offset', 'tasks']) &&
    isIsoDateTime(value.server_time_utc) &&
    isInteger(value.total_count) &&
    isInteger(value.limit, 1) && value.limit <= 100 &&
    isInteger(value.offset) &&
    Array.isArray(value.tasks) && value.tasks.length <= 100 &&
    value.tasks.every(validWorkforceTask)
  );
}

function validWorkforceAttempt(value: unknown): value is WorkforceAttemptDto {
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
    WORKFORCE_ATTEMPT_STATUSES.includes(value.status as WorkforceAttemptStatus) &&
    (value.billing_currency === null || hasCurrency(value.billing_currency)) &&
    isDecimal(value.cost_amount, true) &&
    (value.error_code === null || isString(value.error_code)) &&
    validNullableDateTime(value.started_at) &&
    validNullableDateTime(value.finished_at) &&
    isIsoDateTime(value.created_at)
  );
}

function validWorkforceAttemptsResponse(value: unknown): value is WorkforceAttemptsResponseDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'task_id', 'attempts']) &&
    isIsoDateTime(value.server_time_utc) &&
    isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    Array.isArray(value.attempts) && value.attempts.length <= 10 &&
    value.attempts.every(validWorkforceAttempt)
  );
}

function validWorkforceActivity(value: unknown): value is WorkforceActivityDto {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'event_id', 'event_type', 'occurred_at', 'worker_id',
      'task_id', 'attempt_id', 'correlation_id',
    ]) &&
    isString(value.event_id) && value.event_id.length >= 8 && value.event_id.length <= 64 &&
    WORKFORCE_ACTIVITY_TYPES.includes(value.event_type as WorkforceActivityType) &&
    isIsoDateTime(value.occurred_at) &&
    (value.worker_id === null || isString(value.worker_id)) &&
    (value.task_id === null || isString(value.task_id)) &&
    (value.attempt_id === null || isString(value.attempt_id)) &&
    isString(value.correlation_id) && value.correlation_id.length >= 8 && value.correlation_id.length <= 64
  );
}

function validWorkforceActivityResponse(value: unknown): value is WorkforceActivityResponseDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['server_time_utc', 'total_count', 'limit', 'offset', 'events']) &&
    isIsoDateTime(value.server_time_utc) &&
    isInteger(value.total_count) &&
    isInteger(value.limit, 1) && value.limit <= 100 &&
    isInteger(value.offset) &&
    Array.isArray(value.events) && value.events.length <= 100 &&
    value.events.every(validWorkforceActivity)
  );
}

export function parseWorkforceAttemptsResponse(
  value: unknown,
  expectedTaskId: string,
): WorkforceAttemptsResponseDto {
  if (!validWorkforceAttemptsResponse(value) || value.task_id !== expectedTaskId) {
    throw new LiveContractError();
  }
  return value;
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
    case '/api/v1/workforce/runtime':
      valid = validWorkforceRuntimeResponse(value);
      break;
    case '/api/v1/workforce/tasks':
      valid = validWorkforceTasksResponse(value);
      break;
    case '/api/v1/workforce/activity':
      valid = validWorkforceActivityResponse(value);
      break;
    default:
      throw new LiveContractError();
  }
  if (!valid) throw new LiveContractError();
  return value as LiveApiResponseMap[K];
}

export function parseAuthenticatedSession(value: unknown): AuthenticatedSessionDto {
  if (!isObject(value)) throw new LiveContractError();
  const authenticated = value.authenticated;
  const csrfToken = value.csrfToken;
  if (
    !hasExactKeys(value, ['authenticated', 'csrfToken']) ||
    authenticated !== true ||
    !isString(csrfToken) ||
    !/^[A-Za-z0-9_-]{43}$/.test(csrfToken)
  ) throw new LiveContractError();
  return { authenticated: true, csrfToken };
}

export function parseLoggedOut(value: unknown): LoggedOutDto {
  if (!isObject(value)) throw new LiveContractError();
  if (!hasExactKeys(value, ['authenticated']) || value.authenticated !== false) {
    throw new LiveContractError();
  }
  return { authenticated: false };
}

export function parseBffErrorCode(value: unknown): BffErrorCode | null {
  if (!isObject(value) || !hasExactKeys(value, ['error'])) return null;
  const error = value.error;
  if (!isObject(error) || !hasExactKeys(error, ['code', 'message']) || !isString(error.message)) return null;
  return BFF_ERROR_CODES.includes(error.code as BffErrorCode) ? error.code as BffErrorCode : null;
}


export type WorkforceCommandPath =
  | '/api/v1/commands/tasks/enqueue'
  | '/api/v1/commands/tasks/cancel'
  | '/api/v1/commands/tasks/retry'
  | '/api/v1/commands/workers/scheduling';

export interface EnqueueWorkforceTaskRequest {
  readonly task_type: string;
  readonly title: string;
  readonly required_capability: string;
  readonly requested_worker_id: string;
  readonly input_payload: Readonly<Record<string, unknown>>;
  readonly priority: number;
  readonly max_attempts: number;
  readonly non_trading_acknowledged: true;
}
export interface TaskCommandRequest {
  readonly task_id: string;
}
export interface WorkerSchedulingRequest {
  readonly worker_id: string;
  readonly accepting_tasks: boolean;
}
export type WorkforceCommandRequest =
  | EnqueueWorkforceTaskRequest
  | TaskCommandRequest
  | WorkerSchedulingRequest;

export interface WorkforceCommandResponseDto {
  readonly command_id: string;
  readonly actor_id: 'local_operator';
  readonly command_type: 'TASK_ENQUEUE' | 'TASK_CANCEL' | 'TASK_RETRY' | 'WORKER_SCHEDULING_SET';
  readonly target_id: string;
  readonly correlation_id: string;
  readonly outcome: Readonly<Record<string, unknown>>;
  readonly created_at: string;
  readonly replayed: boolean;
}

export function parseWorkforceCommandResponse(
  value: unknown,
  path: WorkforceCommandPath,
  request: WorkforceCommandRequest,
): WorkforceCommandResponseDto {
  if (!isObject(value) || !hasExactKeys(value, [
    'command_id', 'actor_id', 'command_type', 'target_id',
    'correlation_id', 'outcome', 'created_at', 'replayed',
  ])) throw new LiveContractError();
  const expectedCommand = path === '/api/v1/commands/tasks/enqueue' ? 'TASK_ENQUEUE'
    : path === '/api/v1/commands/tasks/cancel' ? 'TASK_CANCEL'
    : path === '/api/v1/commands/tasks/retry' ? 'TASK_RETRY'
    : 'WORKER_SCHEDULING_SET';
  const expectedTarget = path === '/api/v1/commands/workers/scheduling'
    ? (request as WorkerSchedulingRequest).worker_id
    : path === '/api/v1/commands/tasks/enqueue'
      ? value.target_id
      : (request as TaskCommandRequest).task_id;
  if (
    !isString(value.command_id) || value.command_id.length < 8 || value.command_id.length > 64 ||
    value.actor_id !== 'local_operator' || value.command_type !== expectedCommand ||
    !isString(value.target_id) || value.target_id !== expectedTarget ||
    !isString(value.correlation_id) || value.correlation_id.length < 8 || value.correlation_id.length > 64 ||
    !isObject(value.outcome) || !isIsoDateTime(value.created_at) ||
    typeof value.replayed !== 'boolean'
  ) throw new LiveContractError();
  const outcome = value.outcome;
  if (path === '/api/v1/commands/tasks/enqueue') {
    if (!hasExactKeys(outcome, ['accepted', 'created', 'status', 'task_id']) ||
        outcome.accepted !== true || typeof outcome.created !== 'boolean' ||
        outcome.status !== 'QUEUED' || outcome.task_id !== value.target_id) throw new LiveContractError();
  } else if (path === '/api/v1/commands/tasks/cancel') {
    if (!hasExactKeys(outcome, ['accepted', 'status', 'provider_outcome_unknown', 'cancelled']) ||
        outcome.accepted !== true ||
        (outcome.status !== 'CANCELLED' && outcome.status !== 'WAITING_REVIEW') ||
        outcome.provider_outcome_unknown !== (outcome.status === 'WAITING_REVIEW') ||
        outcome.cancelled !== (outcome.status === 'CANCELLED')) throw new LiveContractError();
  } else if (path === '/api/v1/commands/tasks/retry') {
    if (!hasExactKeys(outcome, ['accepted', 'created', 'status', 'task_id', 'retry_of_task_id']) ||
        outcome.accepted !== true || outcome.created !== true || outcome.status !== 'QUEUED' ||
        outcome.task_id !== value.target_id ||
        outcome.retry_of_task_id !== (request as TaskCommandRequest).task_id) throw new LiveContractError();
  } else {
    const scheduling = request as WorkerSchedulingRequest;
    if (!hasExactKeys(outcome, ['accepted', 'worker_id', 'accepting_tasks', 'schedule_state']) ||
        outcome.accepted !== true || outcome.worker_id !== scheduling.worker_id ||
        outcome.accepting_tasks !== scheduling.accepting_tasks ||
        outcome.schedule_state !== (scheduling.accepting_tasks ? 'ACCEPTING' : 'PAUSED')) throw new LiveContractError();
  }
  return value as unknown as WorkforceCommandResponseDto;
}
