/** Fixed, server-only proxy for the isolated workforce command API. */
import type { RequestHandler, Response as ExpressResponse } from 'express';
import { sendBffError } from './errors.ts';
import { SafeLogger } from './log.ts';

export const WORKFORCE_COMMAND_ORIGIN = 'http://127.0.0.1:8010' as const;
export const WORKFORCE_COMMAND_TIMEOUT_MS = 5_000;
export const WORKFORCE_COMMAND_MAX_BODY_BYTES = 20 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;

const CAPABILITY_TASKS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  instruction_intake: ['INSTRUCTION_INTAKE', 'ROUTING'],
  task_decomposition: ['TASK_DECOMPOSITION', 'ROUTING'],
  workflow_supervision: ['WORKFLOW_SUPERVISION', 'ROUTING'],
  task_assignment_oversight: ['TASK_ASSIGNMENT_OVERSIGHT', 'ROUTING'],
  result_review: ['RESULT_REVIEW', 'REVIEW'],
  quick_research: ['QUICK_RESEARCH', 'RESEARCH'],
  information_extraction: ['INFORMATION_EXTRACTION', 'CLASSIFICATION'],
  summarization: ['SUMMARIZATION', 'CLASSIFICATION'],
  lightweight_classification: ['LIGHTWEIGHT_CLASSIFICATION', 'CLASSIFICATION'],
  data_analysis: ['DATA_ANALYSIS', 'REASONING'],
  comparison: ['COMPARISON', 'REASONING'],
  evaluation: ['EVALUATION', 'REASONING'],
  structured_reasoning: ['STRUCTURED_REASONING', 'REASONING'],
  complex_reasoning: ['COMPLEX_REASONING', 'ESCALATION'],
  strategic_analysis: ['STRATEGIC_ANALYSIS', 'ESCALATION'],
  deep_review: ['DEEP_REVIEW', 'ESCALATION'],
  data_archiving: ['DATA_ARCHIVING', 'ARCHIVAL'],
  artifact_indexing: ['ARTIFACT_INDEXING', 'ARCHIVAL'],
  historical_retrieval_simulation: ['HISTORICAL_RETRIEVAL_SIMULATION', 'ARCHIVAL'],
  data_organization: ['DATA_ORGANIZATION', 'ARCHIVAL'],
});
const WORKER_CAPABILITIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  supervisor: ['instruction_intake', 'task_decomposition', 'workflow_supervision', 'task_assignment_oversight', 'result_review'],
  haiku: ['quick_research', 'information_extraction', 'summarization', 'lightweight_classification'],
  sonnet: ['data_analysis', 'comparison', 'evaluation', 'structured_reasoning'],
  opus: ['complex_reasoning', 'strategic_analysis', 'deep_review'],
  data_archivist: ['data_archiving', 'artifact_indexing', 'historical_retrieval_simulation', 'data_organization'],
});
const ALLOWED_WORKERS = new Set(Object.keys(WORKER_CAPABILITIES));

export type WorkforceCommandPath =
  | '/api/v1/commands/tasks/enqueue'
  | '/api/v1/commands/tasks/cancel'
  | '/api/v1/commands/tasks/retry'
  | '/api/v1/commands/workers/scheduling';

export interface WorkforceCommandProxyOptions {
  readonly tokenProvider?: () => string | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}
function safeInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function validateWorkforceCommandBody(path: WorkforceCommandPath, value: unknown): boolean {
  if (!isObject(value)) return false;
  if (path === '/api/v1/commands/tasks/enqueue') {
    if (!exactKeys(value, [
      'task_type', 'title', 'required_capability', 'requested_worker_id',
      'input_payload', 'priority', 'max_attempts', 'non_trading_acknowledged',
    ])) return false;
    const capability = value.required_capability;
    const worker = value.requested_worker_id;
    if (!boundedString(value.task_type, 2, 64) ||
        !boundedString(value.title, 1, 180) ||
        !boundedString(capability, 2, 64) ||
        !boundedString(worker, 2, 64) ||
        !ALLOWED_WORKERS.has(worker) ||
        !CAPABILITY_TASKS[capability]?.includes(value.task_type) ||
        !WORKER_CAPABILITIES[worker]?.includes(capability) ||
        !isObject(value.input_payload) ||
        !safeInteger(value.priority, 1, 100) ||
        !safeInteger(value.max_attempts, 1, 3) ||
        value.non_trading_acknowledged !== true) return false;
    try {
      return Buffer.byteLength(JSON.stringify(value.input_payload), 'utf8') <= 16 * 1024;
    } catch {
      return false;
    }
  }
  if (path === '/api/v1/commands/tasks/cancel' || path === '/api/v1/commands/tasks/retry') {
    return exactKeys(value, ['task_id']) &&
      typeof value.task_id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value.task_id);
  }
  return exactKeys(value, ['worker_id', 'accepting_tasks']) &&
    typeof value.worker_id === 'string' && ALLOWED_WORKERS.has(value.worker_id) &&
    typeof value.accepting_tasks === 'boolean';
}

function expectedCommand(path: WorkforceCommandPath): string {
  switch (path) {
    case '/api/v1/commands/tasks/enqueue': return 'TASK_ENQUEUE';
    case '/api/v1/commands/tasks/cancel': return 'TASK_CANCEL';
    case '/api/v1/commands/tasks/retry': return 'TASK_RETRY';
    case '/api/v1/commands/workers/scheduling': return 'WORKER_SCHEDULING_SET';
  }
}

function expectedTarget(path: WorkforceCommandPath, body: Record<string, unknown>, response: Record<string, unknown>): string | null {
  if (path === '/api/v1/commands/workers/scheduling') return String(body.worker_id);
  if (path !== '/api/v1/commands/tasks/enqueue') return String(body.task_id);
  return typeof response.target_id === 'string' ? response.target_id : null;
}

function validCommandResponse(
  path: WorkforceCommandPath,
  body: Record<string, unknown>,
  value: unknown,
): boolean {
  if (!isObject(value) || !exactKeys(value, [
    'command_id', 'actor_id', 'command_type', 'target_id',
    'correlation_id', 'outcome', 'created_at', 'replayed',
  ])) return false;
  const target = expectedTarget(path, body, value);
  if (!boundedString(value.command_id, 8, 64) ||
      value.actor_id !== 'local_operator' ||
      value.command_type !== expectedCommand(path) ||
      !target || value.target_id !== target ||
      !boundedString(value.correlation_id, 8, 64) ||
      !isObject(value.outcome) ||
      typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at)) ||
      typeof value.replayed !== 'boolean') return false;

  const outcome = value.outcome;
  if (path === '/api/v1/commands/tasks/enqueue') {
    return exactKeys(outcome, ['accepted', 'created', 'status', 'task_id']) &&
      outcome.accepted === true && typeof outcome.created === 'boolean' &&
      outcome.task_id === target && outcome.status === 'QUEUED';
  }
  if (path === '/api/v1/commands/tasks/cancel') {
    return exactKeys(outcome, ['accepted', 'status', 'provider_outcome_unknown', 'cancelled']) &&
      outcome.accepted === true &&
      (outcome.status === 'CANCELLED' || outcome.status === 'WAITING_REVIEW') &&
      outcome.provider_outcome_unknown === (outcome.status === 'WAITING_REVIEW') &&
      outcome.cancelled === (outcome.status === 'CANCELLED');
  }
  if (path === '/api/v1/commands/tasks/retry') {
    return exactKeys(outcome, ['accepted', 'created', 'status', 'task_id', 'retry_of_task_id']) &&
      outcome.accepted === true && outcome.created === true &&
      outcome.status === 'QUEUED' && outcome.task_id === target &&
      typeof outcome.retry_of_task_id === 'string' &&
      outcome.retry_of_task_id === body.task_id;
  }
  return exactKeys(outcome, ['accepted', 'worker_id', 'accepting_tasks', 'schedule_state']) &&
    outcome.accepted === true && outcome.worker_id === target &&
    typeof outcome.accepting_tasks === 'boolean' &&
    outcome.accepting_tasks === body.accepting_tasks &&
    outcome.schedule_state === (outcome.accepting_tasks ? 'ACCEPTING' : 'PAUSED');
}

async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('INVALID_CONTENT_TYPE');
  }
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_RESPONSE_BYTES)) {
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
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function readCommandToken(): string | undefined {
  const token = process.env.SIREADER_WORKFORCE_COMMAND_AUTH_TOKEN?.trim();
  return token && /^[A-Za-z0-9._~+/-]{32,256}$/.test(token) ? token : undefined;
}

function sendSafeError(res: ExpressResponse, status: number, code: Parameters<typeof sendBffError>[2], message: string): void {
  sendBffError(res, status, code, message);
}

export function createWorkforceCommandHandlers(
  options: WorkforceCommandProxyOptions = {},
): Readonly<Record<WorkforceCommandPath, RequestHandler>> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const tokenProvider = options.tokenProvider ?? readCommandToken;
  const timeoutMs = options.timeoutMs ?? WORKFORCE_COMMAND_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > WORKFORCE_COMMAND_TIMEOUT_MS) {
    throw new Error('Workforce command timeout must be between 1 and 5000 milliseconds.');
  }

  const paths: readonly WorkforceCommandPath[] = [
    '/api/v1/commands/tasks/enqueue',
    '/api/v1/commands/tasks/cancel',
    '/api/v1/commands/tasks/retry',
    '/api/v1/commands/workers/scheduling',
  ];
  const handlers = {} as Record<WorkforceCommandPath, RequestHandler>;

  for (const path of paths) {
    handlers[path] = async (req, res): Promise<void> => {
      const body = req.body as unknown;
      if (!validateWorkforceCommandBody(path, body)) {
        sendSafeError(res, 400, 'BAD_REQUEST', 'Workforce command payload is invalid or outside the non-trading allowlist.');
        return;
      }
      const bodyRecord = body as Record<string, unknown>;
      const idempotencyKey = req.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._~-]{8,128}$/.test(idempotencyKey)) {
        sendSafeError(res, 400, 'BAD_REQUEST', 'A valid Idempotency-Key header is required.');
        return;
      }
      const token = tokenProvider();
      if (!token) {
        sendSafeError(res, 503, 'UPSTREAM_AUTH_FAILED', 'Workforce command service is not configured.');
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const upstream = await fetchImpl(new URL(path, WORKFORCE_COMMAND_ORIGIN), {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(bodyRecord),
          redirect: 'manual',
          signal: controller.signal,
        });
        if (upstream.status >= 300 && upstream.status < 400) {
          await cancelBody(upstream);
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'POST', route: path, statusCode: 502, errorCode: 'BACKEND_ERROR',
          });
          sendSafeError(res, 502, 'BACKEND_ERROR', 'Workforce command service returned an unsupported redirect.');
          return;
        }
        if (upstream.status !== 200) {
          const status = upstream.status;
          await cancelBody(upstream);
          if (status === 401 || status === 403) {
            sendSafeError(res, 502, 'UPSTREAM_AUTH_FAILED', 'Workforce command authentication failed.');
          } else if (status === 400 || status === 422) {
            sendSafeError(res, 400, 'BAD_REQUEST', 'Workforce command was rejected by validation.');
          } else if (status === 409) {
            sendSafeError(res, 409, 'BACKEND_ERROR', 'Workforce command conflicts with the current task state or idempotency record.');
          } else if (status === 429) {
            sendSafeError(res, 429, 'RATE_LIMITED', 'Workforce command rate limit exceeded.');
          } else {
            sendSafeError(res, 502, 'BACKEND_ERROR', 'Workforce command service failed.');
          }
          return;
        }
        let payload: unknown;
        try {
          payload = await readBoundedJson(upstream);
        } catch (error) {
          const code = error instanceof Error && error.message === 'TOO_LARGE' ? 'TOO_LARGE' : 'SCHEMA_INVALID';
          sendSafeError(res, 502, code, 'Workforce command response was invalid.');
          return;
        }
        if (!validCommandResponse(path, bodyRecord, payload)) {
          SafeLogger.warn('UPSTREAM_RESPONSE_REJECTED', {
            method: 'POST', route: path, statusCode: 502, errorCode: 'SCHEMA_INVALID',
          });
          sendSafeError(res, 502, 'SCHEMA_INVALID', 'Workforce command response did not match the required contract.');
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(payload);
      } catch {
        if (controller.signal.aborted) {
          sendSafeError(res, 504, 'TIMEOUT', 'Workforce command service timed out.');
          return;
        }
        sendSafeError(res, 502, 'UNREACHABLE', 'Workforce command service is unavailable.');
      } finally {
        clearTimeout(timer);
      }
    };
  }
  return Object.freeze(handlers);
}
