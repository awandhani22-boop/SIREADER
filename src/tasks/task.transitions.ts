import {
  TASK_EXECUTION_STAGE_STATUSES,
  TASK_LIFECYCLE_STATUSES,
  TaskErrorDetail,
  TaskExecutionStageStatus,
  TaskLifecycleStatus,
  TaskResultPayload,
  TaskStatus,
  TaskTransitionError,
  WorkerId,
} from './task.types';
import { TaskEntity } from '../workers/worker.types';

/**
 * Task State Machine & Transition Validator (Phase 2.1)
 * Enforces deterministic lifecycle transitions, terminal state immutability,
 * and backward-compatible mapping for Phase 1.1 stage statuses.
 */

export const TERMINAL_TASK_STATUSES: readonly TaskLifecycleStatus[] = Object.freeze([
  'COMPLETED',
  'CANCELLED',
]);

/**
 * Official Phase 2.1 Allowed Task Lifecycle Transitions.
 */
export const ALLOWED_TASK_TRANSITIONS: Readonly<
  Record<TaskLifecycleStatus, readonly TaskLifecycleStatus[]>
> = Object.freeze({
  PENDING: Object.freeze(['QUEUED', 'CANCELLED'] as const),
  QUEUED: Object.freeze(['ASSIGNED', 'CANCELLED', 'BLOCKED'] as const),
  ASSIGNED: Object.freeze(['RUNNING', 'QUEUED', 'CANCELLED'] as const),
  RUNNING: Object.freeze(['COMPLETED', 'FAILED', 'CANCELLED', 'RETRY_WAIT'] as const),
  FAILED: Object.freeze(['RETRY_WAIT'] as const),
  RETRY_WAIT: Object.freeze(['QUEUED', 'CANCELLED'] as const),
  BLOCKED: Object.freeze(['QUEUED', 'CANCELLED'] as const),
  COMPLETED: Object.freeze([] as const),
  CANCELLED: Object.freeze([] as const),
});

export function isTaskLifecycleStatus(status: string): status is TaskLifecycleStatus {
  return (TASK_LIFECYCLE_STATUSES as readonly string[]).includes(status);
}

export function isTaskExecutionStageStatus(
  status: string,
): status is TaskExecutionStageStatus {
  return (TASK_EXECUTION_STAGE_STATUSES as readonly string[]).includes(status);
}

export function isValidTaskStatus(status: string): status is TaskStatus {
  return isTaskLifecycleStatus(status) || isTaskExecutionStageStatus(status);
}

/**
 * Maps any unified TaskStatus (including Phase 1.1 stage sub-statuses
 * 'ROUTING' | 'EXTRACTING' | 'ANALYZING' | 'VALIDATING' | 'ARCHIVING')
 * to its canonical Phase 2.1 TaskLifecycleStatus.
 */
export function toTaskLifecycleStatus(status: TaskStatus): TaskLifecycleStatus {
  if (isTaskExecutionStageStatus(status)) {
    return 'RUNNING';
  }
  return status;
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  const lifecycle = toTaskLifecycleStatus(status);
  return TERMINAL_TASK_STATUSES.includes(lifecycle);
}

export function getAllowedTargetStatuses(
  fromStatus: TaskStatus,
): readonly TaskLifecycleStatus[] {
  if (!isValidTaskStatus(fromStatus)) {
    return Object.freeze([]);
  }
  const lifecycle = toTaskLifecycleStatus(fromStatus);
  return ALLOWED_TASK_TRANSITIONS[lifecycle] ?? Object.freeze([]);
}

/**
 * Checks whether transitioning from `fromStatus` to `toStatus` is valid
 * under the Phase 2.1 Task State Machine.
 */
export function canTransitionTaskStatus(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
): boolean {
  if (!isValidTaskStatus(fromStatus) || !isValidTaskStatus(toStatus)) {
    return false;
  }
  const fromLifecycle = toTaskLifecycleStatus(fromStatus);
  const toLifecycle = toTaskLifecycleStatus(toStatus);

  const allowed = ALLOWED_TASK_TRANSITIONS[fromLifecycle];
  return allowed.includes(toLifecycle);
}

export interface TaskTransitionValidationOutcome {
  readonly ok: boolean;
  readonly error: TaskTransitionError | null;
}

/**
 * Validates a status transition and returns a structured `TaskTransitionError`
 * when the transition is rejected.
 */
export function validateTaskStatusTransition(
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  taskId: string | null = null,
): TaskTransitionValidationOutcome {
  if (!isValidTaskStatus(fromStatus) || !isValidTaskStatus(toStatus)) {
    return {
      ok: false,
      error: Object.freeze({
        code: 'UNKNOWN_TASK_STATUS',
        taskId,
        fromStatus,
        fromLifecycleStatus: isValidTaskStatus(fromStatus)
          ? toTaskLifecycleStatus(fromStatus)
          : 'PENDING',
        toStatus,
        toLifecycleStatus: isValidTaskStatus(toStatus)
          ? toTaskLifecycleStatus(toStatus)
          : 'PENDING',
        allowedTargets: Object.freeze([]),
        message: `Unknown task status in transition "${String(fromStatus)}" -> "${String(toStatus)}".`,
      }),
    };
  }

  const fromLifecycle = toTaskLifecycleStatus(fromStatus);
  const toLifecycle = toTaskLifecycleStatus(toStatus);
  const allowedTargets = ALLOWED_TASK_TRANSITIONS[fromLifecycle];

  if (TERMINAL_TASK_STATUSES.includes(fromLifecycle)) {
    return {
      ok: false,
      error: Object.freeze({
        code: 'TERMINAL_STATUS_IMMUTABLE',
        taskId,
        fromStatus,
        fromLifecycleStatus: fromLifecycle,
        toStatus,
        toLifecycleStatus: toLifecycle,
        allowedTargets,
        message: `Task${taskId ? ` "${taskId}"` : ''} is in terminal status "${fromLifecycle}" and cannot transition to "${toLifecycle}".`,
      }),
    };
  }

  if (!allowedTargets.includes(toLifecycle)) {
    return {
      ok: false,
      error: Object.freeze({
        code: 'INVALID_STATUS_TRANSITION',
        taskId,
        fromStatus,
        fromLifecycleStatus: fromLifecycle,
        toStatus,
        toLifecycleStatus: toLifecycle,
        allowedTargets,
        message: `Invalid task transition "${fromLifecycle}" -> "${toLifecycle}". Allowed targets from "${fromLifecycle}": [${allowedTargets.join(', ')}].`,
      }),
    };
  }

  return {
    ok: true,
    error: null,
  };
}

export interface TransitionTaskOptions {
  readonly simTimeMs: number;
  readonly assignedWorkerId?: WorkerId | null;
  readonly result?: TaskResultPayload | null;
  readonly error?: TaskErrorDetail | null;
}

export type TransitionTaskEntityResult =
  | {
      readonly ok: true;
      readonly task: TaskEntity;
      readonly error: null;
    }
  | {
      readonly ok: false;
      readonly task: TaskEntity;
      readonly error: TaskTransitionError;
    };

/**
 * Pure, immutable state transition function for a `TaskEntity`.
 * - Never mutates the input `task`.
 * - If the transition is invalid, returns `{ ok: false, task, error }` with the original task untouched.
 * - If the transition is valid, returns a new `TaskEntity` with updated `status`, `lifecycleStatus`,
 *   and consistent simulation timestamps (`queuedAt`, `startedAt`, `completedAt`, `updatedAt`).
 */
export function transitionTaskStatus(
  task: TaskEntity,
  toStatus: TaskStatus,
  options: TransitionTaskOptions,
): TransitionTaskEntityResult {
  const validation = validateTaskStatusTransition(task.status, toStatus, task.id);
  if (!validation.ok || validation.error) {
    return {
      ok: false,
      task,
      error: validation.error!,
    };
  }

  const nextLifecycle = toTaskLifecycleStatus(toStatus);
  const simTimeMs = Math.max(task.updatedAt, options.simTimeMs);

  let nextQueuedAt = task.queuedAt;
  let nextStartedAt = task.startedAt;
  let nextCompletedAt = task.completedAt;
  let nextAttemptCount = task.attemptCount;
  let nextAssignedWorkerId =
    options.assignedWorkerId !== undefined
      ? options.assignedWorkerId
      : task.assignedWorkerId;
  let nextResult = options.result !== undefined ? options.result : task.result;
  let nextError = options.error !== undefined ? options.error : task.error;
  let nextProgress = task.progress;

  if (nextLifecycle === 'QUEUED') {
    nextQueuedAt = task.queuedAt ?? simTimeMs;
    if (options.assignedWorkerId === undefined && task.lifecycleStatus === 'ASSIGNED') {
      nextAssignedWorkerId = null;
    }
  } else if (nextLifecycle === 'ASSIGNED') {
    nextQueuedAt = task.queuedAt ?? simTimeMs;
  } else if (nextLifecycle === 'RUNNING') {
    nextQueuedAt = task.queuedAt ?? simTimeMs;
    nextStartedAt = task.startedAt ?? simTimeMs;
    if (task.lifecycleStatus !== 'RUNNING') {
      nextAttemptCount = Math.min(task.maxAttempts, task.attemptCount + 1);
    }
  } else if (nextLifecycle === 'COMPLETED') {
    nextQueuedAt = task.queuedAt ?? simTimeMs;
    nextStartedAt = task.startedAt ?? simTimeMs;
    nextCompletedAt = Math.max(nextStartedAt, simTimeMs);
    nextProgress = 100;
    nextError = null;
    if (!nextResult) {
      nextResult = {
        summary: `Completed "${task.title}"`,
        outputData: { completedAtSimMs: nextCompletedAt },
        artifacts: [],
        confidenceScore: 1,
        isSimulated: true,
      };
    }
  } else if (nextLifecycle === 'FAILED') {
    nextStartedAt = task.startedAt ?? simTimeMs;
    if (!nextError) {
      nextError = {
        code: 'EXECUTION_FAILURE_SIMULATED',
        message: `Task "${task.id}" failed at ${simTimeMs}ms (SIMULATED).`,
        occurredAtSimMs: simTimeMs,
        attemptNumber: Math.max(1, nextAttemptCount),
        recoverable: nextAttemptCount < task.maxAttempts,
      };
    }
  }

  const nextWorkerId: WorkerId = nextAssignedWorkerId ?? task.workerId;

  const updatedTask: TaskEntity = {
    ...task,
    workerId: nextWorkerId,
    assignedWorkerId: nextAssignedWorkerId,
    status: toStatus,
    lifecycleStatus: nextLifecycle,
    dependencyIds: [...task.dependencyIds],
    input: {
      ...task.input,
      parameters: { ...task.input.parameters },
      contextTags: [...task.input.contextTags],
    },
    result: nextResult
      ? {
          ...nextResult,
          outputData: { ...nextResult.outputData },
          artifacts: [...nextResult.artifacts],
        }
      : null,
    error: nextError ? { ...nextError } : null,
    attemptCount: nextAttemptCount,
    queuedAt: nextQueuedAt,
    startedAt: nextStartedAt,
    completedAt: nextCompletedAt,
    updatedAt: simTimeMs,
    startedAtSimMs: nextStartedAt,
    completedAtSimMs: nextCompletedAt,
    progress: nextProgress,
  };

  return {
    ok: true,
    task: updatedTask,
    error: null,
  };
}
