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

export type BudgetWarningLevel = 'NONE' | 'SOFT' | 'WARNING' | 'CRITICAL' | 'HARD_LIMIT';
export type BudgetWindowKind = 'DAILY' | 'ROLLING_MONTH' | 'MONTHLY';
export interface BudgetWindowDto {
  readonly currency: CurrencyCode;
  readonly window: BudgetWindowKind;
  readonly period_start: string;
  readonly period_end: string;
  readonly budget_amount: number | string;
  readonly hard_limit_amount: number | string | null;
  readonly actual_cost: number | string;
  readonly reserved_cost: number | string;
  readonly projected_cost: number | string;
  readonly remaining_budget: number | string;
  readonly remaining_hard_limit: number | string | null;
  readonly percent_used: number | string;
  readonly warning_threshold_percent: number | null;
  readonly warning_level: BudgetWarningLevel;
  readonly status_counts: Readonly<Record<string, number>>;
}
export interface BudgetTierDto {
  readonly tier: 'FAST' | 'REASONING' | 'ESCALATION';
  readonly currency: 'IDR';
  readonly budget_amount: number | string;
  readonly actual_cost: number | string;
  readonly reserved_cost: number | string;
  readonly projected_cost: number | string;
  readonly remaining_budget: number | string;
  readonly percent_used: number | string;
  readonly budget_reached: boolean;
}
export interface WorkerCostBreakdownDto {
  readonly worker_id: string;
  readonly currency: CurrencyCode;
  readonly actual_cost: number | string;
  readonly reserved_cost: number | string;
  readonly projected_cost: number | string;
  readonly requests: number;
}
export interface TaskCostBreakdownDto {
  readonly task_id: string;
  readonly worker_id: string;
  readonly tier: string;
  readonly model: string;
  readonly currency: CurrencyCode;
  readonly actual_cost: number | string;
  readonly reserved_cost: number | string;
  readonly projected_cost: number | string;
  readonly requests: number;
}
export interface BudgetObservabilityDto {
  readonly daily_idr: BudgetWindowDto;
  readonly rolling_month_idr: BudgetWindowDto;
  readonly monthly_anthropic_usd: BudgetWindowDto;
  readonly idr_tiers: readonly BudgetTierDto[];
  readonly worker_breakdown: readonly WorkerCostBreakdownDto[];
  readonly recent_task_costs: readonly TaskCostBreakdownDto[];
}

export interface TelemetryUsageDto {
  readonly period_start: string;
  readonly period_end: string;
  readonly period_days: number;
  readonly currencies: readonly CurrencyTelemetryDto[];
  readonly models: readonly ModelTelemetryDto[];
  readonly budget: BudgetObservabilityDto;
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
  | 'TASK_WAITING_REVIEW' | 'TASK_DEAD_LETTERED' | 'WORKER_HEARTBEAT' | 'WORKER_STATE_CHANGED'
  | 'HUMAN_REVIEW_QUEUED' | 'HUMAN_REVIEW_APPROVED' | 'HUMAN_REVIEW_EDITED'
  | 'HUMAN_REVIEW_REJECTED' | 'HUMAN_REVIEW_EXPIRED';

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
  readonly related_task_id: string | null;
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
  readonly event_seq: number;
  readonly actor_type: WorkforceActorType;
  readonly actor_id: string | null;
  readonly related_task_id: string | null;
}


export type WorkforceActorType =
  | 'SYSTEM'
  | 'WORKER'
  | 'OPERATOR'
  | 'LEGACY_UNKNOWN';

export interface WorkforceTimelineEventDto {
  readonly event_seq: number;
  readonly event_id: string;
  readonly task_id: string | null;
  readonly event_type: WorkforceActivityType;
  readonly occurred_at: string;
  readonly actor_type: WorkforceActorType;
  readonly actor_id: string | null;
  readonly worker_id: string | null;
  readonly attempt_id: string | null;
  readonly attempt_number: number | null;
  readonly related_task_id: string | null;
  readonly correlation_id: string;
  readonly event_summary: Readonly<Record<string, unknown>>;
}

export interface WorkforceTaskSummaryDto {
  readonly task_id: string;
  readonly status: WorkforceTaskStatus;
  readonly title: string;
  readonly task_type: string;
  readonly required_capability: string;
  readonly assigned_worker_id: string | null;
  readonly requested_worker_id: string | null;
  readonly priority: number;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly created_at: string;
  readonly completed_at: string | null;
  readonly related_task_id: string | null;
}

export interface WorkforceRetryLineageDto {
  readonly retry_of_task_id: string | null;
  readonly retried_by_task_id: string | null;
}

export interface WorkforceTaskTimelineResponseDto {
  readonly server_time_utc: string;
  readonly task_id: string;
  readonly task: WorkforceTaskSummaryDto;
  readonly retry_lineage: WorkforceRetryLineageDto;
  readonly total_events: number;
  readonly limit: number;
  readonly offset: number;
  readonly events: readonly WorkforceTimelineEventDto[];
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

function validBudgetWindow(value: unknown): value is BudgetWindowDto {
  return isObject(value) &&
    hasExactKeys(value, [
      'currency', 'window', 'period_start', 'period_end', 'budget_amount',
      'hard_limit_amount', 'actual_cost', 'reserved_cost', 'projected_cost',
      'remaining_budget', 'remaining_hard_limit', 'percent_used',
      'warning_threshold_percent', 'warning_level', 'status_counts',
    ]) && hasCurrency(value.currency) &&
    ['DAILY', 'ROLLING_MONTH', 'MONTHLY'].includes(String(value.window)) &&
    isIsoDate(value.period_start) && isIsoDate(value.period_end) &&
    isDecimal(value.budget_amount) && isDecimal(value.hard_limit_amount, true) &&
    isDecimal(value.actual_cost) && isDecimal(value.reserved_cost) &&
    isDecimal(value.projected_cost) && isDecimal(value.remaining_budget) &&
    isDecimal(value.remaining_hard_limit, true) && isDecimal(value.percent_used) &&
    (value.warning_threshold_percent === null || isInteger(value.warning_threshold_percent, 1)) &&
    ['NONE', 'SOFT', 'WARNING', 'CRITICAL', 'HARD_LIMIT'].includes(String(value.warning_level)) &&
    isObject(value.status_counts) && Object.values(value.status_counts).every((item) => isInteger(item));
}
function validBudgetTier(value: unknown): value is BudgetTierDto {
  return isObject(value) &&
    hasExactKeys(value, ['tier', 'currency', 'budget_amount', 'actual_cost', 'reserved_cost', 'projected_cost', 'remaining_budget', 'percent_used', 'budget_reached']) &&
    ['FAST', 'REASONING', 'ESCALATION'].includes(String(value.tier)) && value.currency === 'IDR' &&
    isDecimal(value.budget_amount) && isDecimal(value.actual_cost) && isDecimal(value.reserved_cost) &&
    isDecimal(value.projected_cost) && isDecimal(value.remaining_budget) && isDecimal(value.percent_used) &&
    isBoolean(value.budget_reached);
}
function validWorkerCost(value: unknown): value is WorkerCostBreakdownDto {
  return isObject(value) &&
    hasExactKeys(value, ['worker_id', 'currency', 'actual_cost', 'reserved_cost', 'projected_cost', 'requests']) &&
    isString(value.worker_id) && hasCurrency(value.currency) &&
    isDecimal(value.actual_cost) && isDecimal(value.reserved_cost) &&
    isDecimal(value.projected_cost) && isInteger(value.requests);
}
function validTaskCost(value: unknown): value is TaskCostBreakdownDto {
  return isObject(value) &&
    hasExactKeys(value, ['task_id', 'worker_id', 'tier', 'model', 'currency', 'actual_cost', 'reserved_cost', 'projected_cost', 'requests']) &&
    isString(value.task_id) && isString(value.worker_id) && isString(value.tier) &&
    isString(value.model) && hasCurrency(value.currency) &&
    isDecimal(value.actual_cost) && isDecimal(value.reserved_cost) &&
    isDecimal(value.projected_cost) && isInteger(value.requests);
}
function validBudgetObservability(value: unknown): value is BudgetObservabilityDto {
  return isObject(value) &&
    hasExactKeys(value, ['daily_idr', 'rolling_month_idr', 'monthly_anthropic_usd', 'idr_tiers', 'worker_breakdown', 'recent_task_costs']) &&
    validBudgetWindow(value.daily_idr) && validBudgetWindow(value.rolling_month_idr) &&
    validBudgetWindow(value.monthly_anthropic_usd) &&
    value.daily_idr.currency === 'IDR' && value.daily_idr.window === 'DAILY' &&
    value.rolling_month_idr.currency === 'IDR' && value.rolling_month_idr.window === 'ROLLING_MONTH' &&
    value.monthly_anthropic_usd.currency === 'USD' &&
    Array.isArray(value.idr_tiers) && value.idr_tiers.length === 3 && value.idr_tiers.every(validBudgetTier) &&
    Array.isArray(value.worker_breakdown) && value.worker_breakdown.length <= 50 && value.worker_breakdown.every(validWorkerCost) &&
    Array.isArray(value.recent_task_costs) && value.recent_task_costs.length <= 25 && value.recent_task_costs.every(validTaskCost);
}

function validTelemetryUsage(value: unknown): value is TelemetryUsageDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['period_start', 'period_end', 'period_days', 'currencies', 'models', 'budget']) &&
    isIsoDate(value.period_start) &&
    isIsoDate(value.period_end) &&
    isInteger(value.period_days, 1) &&
    Array.isArray(value.currencies) &&
    value.currencies.every(validCurrencyTelemetry) &&
    Array.isArray(value.models) &&
    value.models.every(validModelTelemetry) &&
    validBudgetObservability(value.budget)
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
  'HUMAN_REVIEW_QUEUED', 'HUMAN_REVIEW_APPROVED', 'HUMAN_REVIEW_EDITED',
  'HUMAN_REVIEW_REJECTED', 'HUMAN_REVIEW_EXPIRED',
];

function validNullableDateTime(value: unknown): boolean {
  return value === null || isIsoDateTime(value);
}

function validWorkforceWorker(value: unknown): value is WorkforceWorkerDto {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'worker_id', 'display_name', 'role', 'department', 'enabled',
      'accepting_tasks', 'max_concurrency', 'model_tier', 'capability_ids', 'process_status',
      'heartbeat_at', 'active_task_count', 'in_flight_provider_requests',
      'schema_version', 'created_at', 'updated_at',
    ]) &&
    isString(value.worker_id) && value.worker_id.length >= 2 && value.worker_id.length <= 64 &&
    isString(value.display_name) && isString(value.role) && isString(value.department) &&
    isBoolean(value.enabled) &&
    isBoolean(value.accepting_tasks) &&
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
      'updated_at', 'completed_at', 'related_task_id',
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
    validNullableDateTime(value.completed_at) &&
    (value.related_task_id === null || (isString(value.related_task_id) && value.related_task_id.length >= 8 && value.related_task_id.length <= 64))
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
      'task_id', 'attempt_id', 'correlation_id', 'event_seq',
      'actor_type', 'actor_id', 'related_task_id',
    ]) &&
    isString(value.event_id) && value.event_id.length >= 8 && value.event_id.length <= 64 &&
    WORKFORCE_ACTIVITY_TYPES.includes(value.event_type as WorkforceActivityType) &&
    isIsoDateTime(value.occurred_at) &&
    (value.worker_id === null || isString(value.worker_id)) &&
    (value.task_id === null || isString(value.task_id)) &&
    (value.attempt_id === null || isString(value.attempt_id)) &&
    isString(value.correlation_id) && value.correlation_id.length >= 8 && value.correlation_id.length <= 64 &&
    isInteger(value.event_seq, 1) &&
    WORKFORCE_ACTOR_TYPES.includes(value.actor_type as WorkforceActorType) &&
    (value.actor_id === null || (isString(value.actor_id) && value.actor_id.length <= 128)) &&
    (value.related_task_id === null || (isString(value.related_task_id) && value.related_task_id.length >= 8 && value.related_task_id.length <= 64))
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


const WORKFORCE_ACTOR_TYPES: readonly WorkforceActorType[] = [
  'SYSTEM', 'WORKER', 'OPERATOR', 'LEGACY_UNKNOWN',
];

function validEventSummary(value: unknown): boolean {
  if (!isObject(value)) return false;
  const prohibitedKeywords = [
    'password', 'secret', 'bearer', 'lease_token', 'database_url', 'api_key', 'authorization',
  ];
  for (const [key, val] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (prohibitedKeywords.some((p) => lowerKey.includes(p))) return false;
    if (typeof val === 'string') {
      const lowerVal = val.toLowerCase();
      if (prohibitedKeywords.some((p) => lowerVal.includes(p))) return false;
    }
  }
  return true;
}

function validWorkforceTimelineEvent(value: unknown): value is WorkforceTimelineEventDto {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'event_seq', 'event_id', 'task_id', 'event_type', 'occurred_at',
      'actor_type', 'actor_id', 'worker_id', 'attempt_id', 'attempt_number',
      'related_task_id', 'correlation_id', 'event_summary',
    ]) &&
    isInteger(value.event_seq, 1) &&
    isString(value.event_id) && value.event_id.length >= 8 && value.event_id.length <= 64 &&
    (value.task_id === null || (isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64)) &&
    WORKFORCE_ACTIVITY_TYPES.includes(value.event_type as WorkforceActivityType) &&
    isIsoDateTime(value.occurred_at) &&
    WORKFORCE_ACTOR_TYPES.includes(value.actor_type as WorkforceActorType) &&
    (value.actor_id === null || isString(value.actor_id)) &&
    (value.worker_id === null || isString(value.worker_id)) &&
    (value.attempt_id === null || isString(value.attempt_id)) &&
    (value.attempt_number === null || isInteger(value.attempt_number, 1)) &&
    (value.related_task_id === null || (isString(value.related_task_id) && value.related_task_id.length >= 8 && value.related_task_id.length <= 64)) &&
    isString(value.correlation_id) && value.correlation_id.length >= 8 && value.correlation_id.length <= 64 &&
    validEventSummary(value.event_summary)
  );
}

function validWorkforceTaskSummary(value: unknown): value is WorkforceTaskSummaryDto {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'task_id', 'status', 'title', 'task_type', 'required_capability',
      'assigned_worker_id', 'requested_worker_id', 'priority',
      'attempts', 'max_attempts', 'created_at', 'completed_at', 'related_task_id',
    ]) &&
    isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    WORKFORCE_TASK_STATUSES.includes(value.status as WorkforceTaskStatus) &&
    isString(value.title) &&
    isString(value.task_type) &&
    isString(value.required_capability) &&
    (value.assigned_worker_id === null || isString(value.assigned_worker_id)) &&
    (value.requested_worker_id === null || isString(value.requested_worker_id)) &&
    isInteger(value.priority, 1) && value.priority <= 100 &&
    isInteger(value.attempts, 0) && value.attempts <= 100 &&
    isInteger(value.max_attempts, 1) && value.max_attempts <= 10 &&
    isIsoDateTime(value.created_at) &&
    validNullableDateTime(value.completed_at) &&
    (value.related_task_id === null || isString(value.related_task_id))
  );
}

function validWorkforceRetryLineage(value: unknown): value is WorkforceRetryLineageDto {
  return (
    isObject(value) &&
    hasExactKeys(value, ['retry_of_task_id', 'retried_by_task_id']) &&
    (value.retry_of_task_id === null || isString(value.retry_of_task_id)) &&
    (value.retried_by_task_id === null || isString(value.retried_by_task_id))
  );
}

export function validWorkforceTaskTimelineResponse(
  value: unknown,
): value is WorkforceTaskTimelineResponseDto {
  return (
    isObject(value) &&
    hasExactKeys(value, [
      'server_time_utc', 'task_id', 'task', 'retry_lineage',
      'total_events', 'limit', 'offset', 'events',
    ]) &&
    isIsoDateTime(value.server_time_utc) &&
    isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    validWorkforceTaskSummary(value.task) &&
    validWorkforceRetryLineage(value.retry_lineage) &&
    isInteger(value.total_events, 0) &&
    isInteger(value.limit, 1) && value.limit <= 200 &&
    isInteger(value.offset, 0) &&
    Array.isArray(value.events) && value.events.length <= 200 &&
    value.events.every(validWorkforceTimelineEvent)
  );
}

export function parseWorkforceTaskTimelineResponse(
  value: unknown,
  expectedTaskId?: string,
): WorkforceTaskTimelineResponseDto {
  if (
    !validWorkforceTaskTimelineResponse(value) ||
    (expectedTaskId !== undefined && value.task_id !== expectedTaskId)
  ) {
    throw new LiveContractError();
  }
  return value;
}

export type WorkforceReviewStatus = 'PENDING' | 'APPROVED' | 'EDITED' | 'REJECTED' | 'EXPIRED';

export interface WorkforceTaskReviewSummaryDto {
  readonly review_id: string;
  readonly task_id: string;
  readonly attempt_id: string;
  readonly status: WorkforceReviewStatus;
  readonly original_output_sha256: string;
  readonly adjusted_output_sha256: string | null;
  readonly adjudicated_by: string | null;
  readonly adjudicated_at: string | null;
  readonly reason_code: string | null;
  readonly notes: string | null;
  readonly review_expires_at: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly payload_purged_at: string | null;
}
export interface WorkforceTaskReviewDetailDto extends WorkforceTaskReviewSummaryDto {
  readonly original_output: Readonly<Record<string, unknown>> | null;
  readonly adjusted_output: Readonly<Record<string, unknown>> | null;
}
export interface WorkforceTaskReviewsResponseDto {
  readonly server_time_utc: string;
  readonly total_count: number;
  readonly limit: number;
  readonly offset: number;
  readonly reviews: readonly WorkforceTaskReviewSummaryDto[];
}

function validWorkforceReviewSummary(value: unknown): value is WorkforceTaskReviewSummaryDto {
  return isObject(value) && hasExactKeys(value, [
    'review_id', 'task_id', 'attempt_id', 'status', 'original_output_sha256',
    'adjusted_output_sha256', 'adjudicated_by', 'adjudicated_at', 'reason_code',
    'notes', 'review_expires_at', 'created_at', 'updated_at', 'payload_purged_at',
  ]) &&
    isString(value.review_id) && /^rev_[A-Za-z0-9_-]{8,60}$/.test(value.review_id) &&
    isString(value.task_id) && value.task_id.length >= 8 && value.task_id.length <= 64 &&
    isString(value.attempt_id) && value.attempt_id.length >= 8 && value.attempt_id.length <= 64 &&
    ['PENDING', 'APPROVED', 'EDITED', 'REJECTED', 'EXPIRED'].includes(String(value.status)) &&
    isString(value.original_output_sha256) && /^[0-9a-f]{64}$/.test(value.original_output_sha256) &&
    (value.adjusted_output_sha256 === null || (isString(value.adjusted_output_sha256) && /^[0-9a-f]{64}$/.test(value.adjusted_output_sha256))) &&
    (value.adjudicated_by === null || isString(value.adjudicated_by)) &&
    (value.adjudicated_at === null || isIsoDateTime(value.adjudicated_at)) &&
    (value.reason_code === null || isString(value.reason_code)) &&
    (value.notes === null || isString(value.notes)) &&
    isIsoDateTime(value.review_expires_at) && isIsoDateTime(value.created_at) &&
    isIsoDateTime(value.updated_at) &&
    (value.payload_purged_at === null || isIsoDateTime(value.payload_purged_at));
}

export function validWorkforceReviewsResponse(value: unknown): value is WorkforceTaskReviewsResponseDto {
  return isObject(value) && hasExactKeys(value, ['server_time_utc', 'total_count', 'limit', 'offset', 'reviews']) &&
    isIsoDateTime(value.server_time_utc) && isInteger(value.total_count, 0) &&
    isInteger(value.limit, 1) && value.limit <= 100 && isInteger(value.offset, 0) &&
    Array.isArray(value.reviews) && value.reviews.length <= 100 &&
    value.reviews.every(validWorkforceReviewSummary);
}

export function parseWorkforceReviewsResponse(value: unknown): WorkforceTaskReviewsResponseDto {
  if (!validWorkforceReviewsResponse(value)) throw new LiveContractError();
  return value;
}

export function parseWorkforceReviewDetail(value: unknown, expectedReviewId: string): WorkforceTaskReviewDetailDto {
  if (!isObject(value) || !hasExactKeys(value, [
    'review_id', 'task_id', 'attempt_id', 'status', 'original_output_sha256',
    'adjusted_output_sha256', 'adjudicated_by', 'adjudicated_at', 'reason_code',
    'notes', 'review_expires_at', 'created_at', 'updated_at', 'payload_purged_at',
    'original_output', 'adjusted_output',
  ]) || value.review_id !== expectedReviewId) throw new LiveContractError();
  const summary = Object.fromEntries(Object.entries(value).filter(([key]) =>
    key !== 'original_output' && key !== 'adjusted_output',
  ));
  if (!validWorkforceReviewSummary(summary) ||
      !(value.original_output === null || isObject(value.original_output)) ||
      !(value.adjusted_output === null || isObject(value.adjusted_output))) {
    throw new LiveContractError();
  }
  return value as unknown as WorkforceTaskReviewDetailDto;
}

export interface AdjudicateWorkforceReviewRequest {
  readonly review_id: string;
  readonly decision: 'APPROVED' | 'EDITED' | 'REJECTED';
  readonly expected_original_sha256: string;
  readonly adjusted_output: Readonly<Record<string, unknown>> | null;
  readonly reason_code: string | null;
  readonly notes: string | null;
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
  | '/api/v1/commands/workers/scheduling'
  | '/api/v1/commands/reviews/adjudicate';

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
  | WorkerSchedulingRequest
  | AdjudicateWorkforceReviewRequest;

export interface WorkforceCommandResponseDto {
  readonly command_id: string;
  readonly actor_id: 'local_operator';
  readonly command_type: 'TASK_ENQUEUE' | 'TASK_CANCEL' | 'TASK_RETRY' | 'WORKER_SCHEDULING_SET' | 'REVIEW_ADJUDICATE';
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
    : path === '/api/v1/commands/reviews/adjudicate' ? 'REVIEW_ADJUDICATE'
    : 'WORKER_SCHEDULING_SET';
  const expectedTarget = path === '/api/v1/commands/workers/scheduling'
    ? (request as WorkerSchedulingRequest).worker_id
    : path === '/api/v1/commands/reviews/adjudicate'
      ? (request as AdjudicateWorkforceReviewRequest).review_id
      : (path === '/api/v1/commands/tasks/enqueue' || path === '/api/v1/commands/tasks/retry')
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
  } else if (path === '/api/v1/commands/workers/scheduling') {
    const scheduling = request as WorkerSchedulingRequest;
    if (!hasExactKeys(outcome, ['accepted', 'worker_id', 'accepting_tasks', 'schedule_state']) ||
        outcome.accepted !== true || outcome.worker_id !== scheduling.worker_id ||
        outcome.accepting_tasks !== scheduling.accepting_tasks ||
        outcome.schedule_state !== (scheduling.accepting_tasks ? 'ACCEPTING' : 'PAUSED')) throw new LiveContractError();
  } else {
    const review = request as AdjudicateWorkforceReviewRequest;
    if (!hasExactKeys(outcome, [
      'accepted', 'review_id', 'task_id', 'decision',
      'adjudicated_by', 'adjudicated_at', 'task_status',
    ]) || outcome.accepted !== true || outcome.review_id !== review.review_id ||
        !isString(outcome.task_id) || outcome.task_id.length < 8 || outcome.task_id.length > 64 ||
        outcome.decision !== review.decision || outcome.adjudicated_by !== 'local_operator' ||
        !isIsoDateTime(outcome.adjudicated_at) || outcome.task_status !== 'COMPLETED') {
      throw new LiveContractError();
    }
  }
  return value as unknown as WorkforceCommandResponseDto;
}
