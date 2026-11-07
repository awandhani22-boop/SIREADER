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
 * Task State Machine & Transition Validator (Phase 2.1 + Audit Remediation)
 * Enforces deterministic lifecycle transitions, terminal state immutability,
 * runtime QUEUED -> ASSIGNED -> RUNNING step integrity, and Phase 1.1
 * intra-RUNNING execution stage updates (`updateTaskExecutionStage`).
 */

export const TERMINAL_TASK_STATUSES: readonly TaskLifecycleStatus[] = Object.freeze([
  'COMPLETED',
  'CANCELLED',
] as const);

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
    return Object.freeze([] as const);
  }
  const lifecycle = toTaskLifecycleStatus(fromStatus);
  return ALLOWED_TASK_TRANSITIONS[lifecycle] ?? Object.freeze([] as const);
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
        allowedTargets: Object.freeze([] as const),
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
  readonly fallbackWorkerId?: WorkerId;
  readonly result?: TaskResultPayload | null;
  readonly error?: TaskErrorDetail | null;
  readonly progress?: number;
  readonly elapsedSimMs?: number;
  readonly simulatedTokens?: number;
  readonly simulatedCostUsd?: number;
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
 * - If the transition is invalid (or if `task.lifecycleStatus` is inconsistent with `task.status`),
 *   returns `{ ok: false, task, error }` with the original task untouched.
 * - If the transition is valid, returns a new `TaskEntity` with updated `status`, `lifecycleStatus`,
 *   consistent `workerId`/`assignedWorkerId`, and simulation timestamps (`queuedAt`, `startedAt`, `completedAt`, `updatedAt`).
 */
export function transitionTaskStatus(
  task: TaskEntity,
  toStatus: TaskStatus,
  options: TransitionTaskOptions,
): TransitionTaskEntityResult {
  if (
    !isValidTaskStatus(task.status) ||
    !isTaskLifecycleStatus(task.lifecycleStatus) ||
    task.lifecycleStatus !== toTaskLifecycleStatus(task.status)
  ) {
    return {
      ok: false,
      task,
      error: Object.freeze({
        code: 'INVALID_STATUS_TRANSITION',
        taskId: task.id,
        fromStatus: task.status,
        fromLifecycleStatus: isTaskLifecycleStatus(task.lifecycleStatus)
          ? task.lifecycleStatus
          : 'PENDING',
        toStatus,
        toLifecycleStatus: isValidTaskStatus(toStatus)
          ? toTaskLifecycleStatus(toStatus)
          : 'PENDING',
        allowedTargets: Object.freeze([] as const),
        message: `Task "${task.id}" has inconsistent status ("${String(task.status)}") and lifecycleStatus ("${String(task.lifecycleStatus)}").`,
      }),
    };
  }

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
  let nextProgress = options.progress !== undefined ? options.progress : task.progress;
  let nextElapsedSimMs =
    options.elapsedSimMs !== undefined ? options.elapsedSimMs : task.elapsedSimMs;
  let nextSimulatedTokens =
    options.simulatedTokens !== undefined
      ? options.simulatedTokens
      : task.simulatedTokens;
  let nextSimulatedCostUsd =
    options.simulatedCostUsd !== undefined
      ? options.simulatedCostUsd
      : task.simulatedCostUsd;

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
    nextElapsedSimMs =
      options.elapsedSimMs !== undefined
        ? options.elapsedSimMs
        : task.totalDurationSimMs;
    nextSimulatedTokens =
      options.simulatedTokens !== undefined
        ? options.simulatedTokens
        : task.targetTokens;
    nextSimulatedCostUsd =
      options.simulatedCostUsd !== undefined
        ? options.simulatedCostUsd
        : Number(
            (
              (nextSimulatedTokens / 1000) *
              task.costPerThousandTokensUsd
            ).toFixed(6),
          );
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

  const nextWorkerId: WorkerId =
    nextAssignedWorkerId !== null
      ? nextAssignedWorkerId
      : options.fallbackWorkerId ?? task.workerId;

  const updatedTask: TaskEntity = {
    ...task,
    workerId: nextWorkerId,
    assignedWorkerId: nextAssignedWorkerId,
    status: toStatus,
    lifecycleStatus: nextLifecycle,
    dependencyIds: [...task.dependencyIds],
    stagePipeline: task.stagePipeline.map((s) => ({ ...s })),
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
    elapsedSimMs: nextElapsedSimMs,
    simulatedTokens: nextSimulatedTokens,
    simulatedCostUsd: nextSimulatedCostUsd,
  };

  return {
    ok: true,
    task: updatedTask,
    error: null,
  };
}

export interface UpdateTaskExecutionStageOptions {
  readonly simTimeMs: number;
  readonly elapsedSimMs?: number;
  readonly progress?: number;
  readonly simulatedTokens?: number;
  readonly simulatedCostUsd?: number;
}

/**
 * Dedicated Phase 1.1 + Phase 2.1 Execution Stage Update Helper.
 * Updates intra-RUNNING execution stage (`ROUTING`, `EXTRACTING`, `ANALYZING`, `VALIDATING`, `ARCHIVING`)
 * and deterministic telemetry without performing a lifecycle transition or mutating the original `TaskEntity`.
 *
 * Rules:
 * - Only operates when `task.lifecycleStatus === 'RUNNING'` and `toTaskLifecycleStatus(task.status) === 'RUNNING'`.
 * - Only accepts a valid `TaskExecutionStageStatus` (`ROUTING | EXTRACTING | ANALYZING | VALIDATING | ARCHIVING`).
 * - Guarantees `lifecycleStatus` remains `'RUNNING'` and consistent with `status`.
 * - Updates `updatedAt` using `simTimeMs`.
 */
export function updateTaskExecutionStage(
  task: TaskEntity,
  nextStageStatus: TaskStatus,
  options: UpdateTaskExecutionStageOptions,
): TransitionTaskEntityResult {
  const currentLifecycle = isValidTaskStatus(task.status)
    ? toTaskLifecycleStatus(task.status)
    : task.lifecycleStatus;

  if (
    task.lifecycleStatus !== 'RUNNING' ||
    currentLifecycle !== 'RUNNING' ||
    !isTaskExecutionStageStatus(nextStageStatus)
  ) {
    return {
      ok: false,
      task,
      error: Object.freeze({
        code: 'INVALID_EXECUTION_STAGE_UPDATE',
        taskId: task.id,
        fromStatus: task.status,
        fromLifecycleStatus: isTaskLifecycleStatus(task.lifecycleStatus)
          ? task.lifecycleStatus
          : 'PENDING',
        toStatus: nextStageStatus,
        toLifecycleStatus: isValidTaskStatus(nextStageStatus)
          ? toTaskLifecycleStatus(nextStageStatus)
          : 'PENDING',
        allowedTargets: Object.freeze(['RUNNING'] as const),
        message: `Cannot update execution stage to "${String(nextStageStatus)}" when task "${task.id}" has status "${String(task.status)}" (lifecycleStatus "${String(task.lifecycleStatus)}"). Task must be RUNNING and target must be an execution stage.`,
      }),
    };
  }

  const simTimeMs = Math.max(task.updatedAt, options.simTimeMs);
  const updatedTask: TaskEntity = {
    ...task,
    status: nextStageStatus,
    lifecycleStatus: 'RUNNING',
    elapsedSimMs:
      options.elapsedSimMs !== undefined
        ? options.elapsedSimMs
        : task.elapsedSimMs,
    progress:
      options.progress !== undefined ? options.progress : task.progress,
    simulatedTokens:
      options.simulatedTokens !== undefined
        ? options.simulatedTokens
        : task.simulatedTokens,
    simulatedCostUsd:
      options.simulatedCostUsd !== undefined
        ? options.simulatedCostUsd
        : task.simulatedCostUsd,
    updatedAt: simTimeMs,
    dependencyIds: [...task.dependencyIds],
    stagePipeline: task.stagePipeline.map((s) => ({ ...s })),
    input: {
      ...task.input,
      parameters: { ...task.input.parameters },
      contextTags: [...task.input.contextTags],
    },
    result: task.result
      ? {
          ...task.result,
          outputData: { ...task.result.outputData },
          artifacts: [...task.result.artifacts],
        }
      : null,
    error: task.error ? { ...task.error } : null,
  };

  return {
    ok: true,
    task: updatedTask,
    error: null,
  };
}

export interface ActivateQueuedTaskOptions {
  readonly simTimeMs: number;
  readonly assignedWorkerId: WorkerId;
}

export type ActivateQueuedTaskResult =
  | {
      readonly ok: true;
      readonly assignedTask: TaskEntity;
      readonly runningTask: TaskEntity;
      readonly transitionHistory: readonly [TaskLifecycleStatus, TaskLifecycleStatus, TaskLifecycleStatus];
      readonly error: null;
    }
  | {
      readonly ok: false;
      readonly assignedTask: null;
      readonly runningTask: TaskEntity;
      readonly transitionHistory: readonly TaskLifecycleStatus[];
      readonly error: TaskTransitionError;
    };

/**
 * Canonical runtime activation helper that transitions a task from `QUEUED`
 * through `ASSIGNED` and into `RUNNING` (or an initial Phase 1.1 execution stage mapped to `RUNNING`)
 * without skipping the `ASSIGNED` state.
 */
export function activateQueuedTaskForExecution(
  task: TaskEntity,
  initialExecutionStage: TaskStatus,
  options: ActivateQueuedTaskOptions,
): ActivateQueuedTaskResult {
  // Step 1: QUEUED -> ASSIGNED
  const toAssigned = transitionTaskStatus(task, 'ASSIGNED', {
    simTimeMs: options.simTimeMs,
    assignedWorkerId: options.assignedWorkerId,
  });
  if (!toAssigned.ok) {
    return {
      ok: false,
      assignedTask: null,
      runningTask: task,
      transitionHistory: Object.freeze([task.lifecycleStatus]),
      error: toAssigned.error,
    };
  }

  // Step 2: ASSIGNED -> RUNNING (via initialExecutionStage which maps to RUNNING)
  const targetStage: TaskStatus =
    toTaskLifecycleStatus(initialExecutionStage) === 'RUNNING'
      ? initialExecutionStage
      : 'RUNNING';

  const toRunning = transitionTaskStatus(toAssigned.task, targetStage, {
    simTimeMs: options.simTimeMs,
    assignedWorkerId: options.assignedWorkerId,
  });
  if (!toRunning.ok) {
    return {
      ok: false,
      assignedTask: null,
      runningTask: task,
      transitionHistory: Object.freeze([task.lifecycleStatus, 'ASSIGNED']),
      error: toRunning.error,
    };
  }

  return {
    ok: true,
    assignedTask: toAssigned.task,
    runningTask: toRunning.task,
    transitionHistory: Object.freeze([
      task.lifecycleStatus,
      toAssigned.task.lifecycleStatus,
      toRunning.task.lifecycleStatus,
    ] as const),
    error: null,
  };
}
