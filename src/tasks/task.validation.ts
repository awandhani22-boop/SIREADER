import {
  PermanentWorkerId,
  TASK_PRIORITIES,
  TASK_TYPES,
  TaskValidationIssue,
  TaskValidationResult,
  WorkerCapabilityProfile,
} from './task.types';
import {
  isTaskLifecycleStatus,
  isValidTaskStatus,
  toTaskLifecycleStatus,
} from './task.transitions';
import {
  isPermanentWorkerId,
  supportsTaskType,
} from '../workers/worker.capabilities';
import { TaskEntity } from '../workers/worker.types';

/**
 * Task Validation Module (Phase 2.1 + Audit Remediation)
 * Validates all structural, lifecycle-consistency, capability-matching,
 * worker-assignment, and simulation-timestamp invariants for a TaskEntity.
 */

export interface ValidateTaskOptions {
  readonly existingTaskIds?: ReadonlySet<string> | readonly string[];
  readonly capabilityRegistry?: Readonly<
    Record<PermanentWorkerId, WorkerCapabilityProfile>
  >;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSimTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateTaskEntity(
  task: TaskEntity,
  options?: ValidateTaskOptions,
): TaskValidationResult {
  const issues: TaskValidationIssue[] = [];

  // 1. Task ID must be valid and unique
  if (typeof task.id !== 'string' || task.id.trim().length === 0) {
    issues.push({
      code: 'INVALID_TASK_ID',
      field: 'id',
      message: 'Task ID must be a non-empty string.',
    });
  } else if (options?.existingTaskIds) {
    const isDuplicate = Array.isArray(options.existingTaskIds)
      ? options.existingTaskIds.includes(task.id)
      : (options.existingTaskIds as ReadonlySet<string>).has(task.id);
    if (isDuplicate) {
      issues.push({
        code: 'DUPLICATE_TASK_ID',
        field: 'id',
        message: `Task ID "${task.id}" already exists.`,
      });
    }
  }

  // 2. `type` must be a known TaskType
  const typeValid =
    typeof task.type === 'string' &&
    (TASK_TYPES as readonly string[]).includes(task.type);
  if (!typeValid) {
    issues.push({
      code: 'UNKNOWN_TASK_TYPE',
      field: 'type',
      message: `Unknown task type "${String(task.type)}".`,
    });
  }

  // 3. `priority` must be valid
  if (
    typeof task.priority !== 'string' ||
    !(TASK_PRIORITIES as readonly string[]).includes(task.priority)
  ) {
    issues.push({
      code: 'INVALID_PRIORITY',
      field: 'priority',
      message: `Invalid task priority "${String(task.priority)}".`,
    });
  }

  // 4. `status` and `lifecycleStatus` must be valid AND consistent with each other
  const statusValid =
    typeof task.status === 'string' && isValidTaskStatus(task.status);
  if (!statusValid) {
    issues.push({
      code: 'INVALID_STATUS',
      field: 'status',
      message: `Invalid task status "${String(task.status)}".`,
    });
  }

  const lifecycleStatusValid =
    typeof task.lifecycleStatus === 'string' &&
    isTaskLifecycleStatus(task.lifecycleStatus);
  if (!lifecycleStatusValid) {
    issues.push({
      code: 'INVALID_LIFECYCLE_STATUS',
      field: 'lifecycleStatus',
      message: `Invalid canonical task lifecycleStatus "${String(task.lifecycleStatus)}".`,
    });
  }

  if (statusValid && lifecycleStatusValid) {
    const expectedLifecycleStatus = toTaskLifecycleStatus(task.status);
    if (task.lifecycleStatus !== expectedLifecycleStatus) {
      issues.push({
        code: 'STATUS_LIFECYCLE_MISMATCH',
        field: 'lifecycleStatus',
        message: `Task status "${task.status}" maps to lifecycleStatus "${expectedLifecycleStatus}", but found "${task.lifecycleStatus}".`,
      });
    }
  }

  // 5. `maxAttempts` must be > 0
  if (
    typeof task.maxAttempts !== 'number' ||
    !Number.isInteger(task.maxAttempts) ||
    task.maxAttempts <= 0
  ) {
    issues.push({
      code: 'INVALID_MAX_ATTEMPTS',
      field: 'maxAttempts',
      message: `maxAttempts must be a positive integer greater than 0 (received ${String(task.maxAttempts)}).`,
    });
  }

  // 6. `attemptCount` must not be negative
  if (
    typeof task.attemptCount !== 'number' ||
    !Number.isInteger(task.attemptCount) ||
    task.attemptCount < 0
  ) {
    issues.push({
      code: 'NEGATIVE_ATTEMPT_COUNT',
      field: 'attemptCount',
      message: `attemptCount cannot be negative (received ${String(task.attemptCount)}).`,
    });
  }

  // 7. `attemptCount` must not exceed `maxAttempts`
  if (
    typeof task.attemptCount === 'number' &&
    typeof task.maxAttempts === 'number' &&
    task.maxAttempts > 0 &&
    task.attemptCount > task.maxAttempts
  ) {
    issues.push({
      code: 'ATTEMPT_COUNT_EXCEEDS_MAX',
      field: 'attemptCount',
      message: `attemptCount (${task.attemptCount}) cannot exceed maxAttempts (${task.maxAttempts}).`,
    });
  }

  // 8. `dependencyIds` must not contain duplicates
  if (!Array.isArray(task.dependencyIds)) {
    issues.push({
      code: 'DUPLICATE_DEPENDENCY_IDS',
      field: 'dependencyIds',
      message: 'dependencyIds must be an array of task IDs.',
    });
  } else {
    const seenDeps = new Set<string>();
    let hasDuplicateDep = false;
    for (const depId of task.dependencyIds) {
      if (seenDeps.has(depId)) {
        hasDuplicateDep = true;
        break;
      }
      seenDeps.add(depId);
    }
    if (hasDuplicateDep) {
      issues.push({
        code: 'DUPLICATE_DEPENDENCY_IDS',
        field: 'dependencyIds',
        message: 'dependencyIds must not contain duplicate task IDs.',
      });
    }

    // 9. Task must not depend on itself
    if (typeof task.id === 'string' && task.dependencyIds.includes(task.id)) {
      issues.push({
        code: 'SELF_DEPENDENCY_DETECTED',
        field: 'dependencyIds',
        message: `Task "${task.id}" cannot depend on itself.`,
      });
    }
  }

  // 10. `assignedWorkerId`, capability matching, and `workerId` consistency
  if (task.assignedWorkerId !== null) {
    if (
      typeof task.assignedWorkerId !== 'string' ||
      !isPermanentWorkerId(task.assignedWorkerId)
    ) {
      issues.push({
        code: 'INVALID_ASSIGNED_WORKER_ID',
        field: 'assignedWorkerId',
        message: `assignedWorkerId "${String(task.assignedWorkerId)}" does not reference a valid registered worker.`,
      });
    } else {
      // Consistency between legacy workerId and assignedWorkerId when assigned
      if (task.workerId !== task.assignedWorkerId) {
        issues.push({
          code: 'WORKER_ASSIGNMENT_MISMATCH',
          field: 'workerId',
          message: `Task workerId ("${String(task.workerId)}") must match assignedWorkerId ("${task.assignedWorkerId}") when assignedWorkerId is non-null.`,
        });
      }

      // Capability validation against active worker capabilities
      if (
        typeValid &&
        !supportsTaskType(
          task.assignedWorkerId,
          task.type,
          options?.capabilityRegistry,
        )
      ) {
        issues.push({
          code: 'UNSUPPORTED_WORKER_CAPABILITY',
          field: 'assignedWorkerId',
          message: `Worker "${task.assignedWorkerId}" does not have an active capability supporting task type "${task.type}".`,
        });
      }
    }
  } else {
    // Unassigned legacy workerId fallback must still reference a valid registered worker
    if (
      typeof task.workerId !== 'string' ||
      !isPermanentWorkerId(task.workerId)
    ) {
      issues.push({
        code: 'INVALID_ASSIGNED_WORKER_ID',
        field: 'workerId',
        message: `Fallback workerId "${String(task.workerId)}" does not reference a valid registered worker.`,
      });
    }
  }

  // 11. `input` must be a structured object
  if (
    !isPlainRecord(task.input) ||
    typeof task.input.instruction !== 'string' ||
    task.input.instruction.trim().length === 0 ||
    !isPlainRecord(task.input.parameters) ||
    !Array.isArray(task.input.contextTags)
  ) {
    issues.push({
      code: 'INVALID_INPUT_STRUCTURE',
      field: 'input',
      message:
        'Task input must be a structured object with non-empty instruction, parameters object, and contextTags array.',
    });
  }

  // 12. `result` must be a structured object when not null
  if (task.result !== null) {
    if (
      !isPlainRecord(task.result) ||
      typeof task.result.summary !== 'string' ||
      !isPlainRecord(task.result.outputData) ||
      !Array.isArray(task.result.artifacts) ||
      typeof task.result.confidenceScore !== 'number' ||
      task.result.isSimulated !== true
    ) {
      issues.push({
        code: 'INVALID_RESULT_STRUCTURE',
        field: 'result',
        message:
          'Task result must be null or a structured object with summary, outputData, artifacts, confidenceScore, and isSimulated: true.',
      });
    }
  }

  // Simulation timestamp non-negativity checks
  if (!isValidSimTimestamp(task.createdAt) || !isValidSimTimestamp(task.updatedAt)) {
    issues.push({
      code: 'NEGATIVE_SIMULATION_TIMESTAMP',
      field: 'createdAt',
      message: 'createdAt and updatedAt must be non-negative finite simulation timestamps.',
    });
  }

  const effectiveLifecycle = statusValid
    ? toTaskLifecycleStatus(task.status)
    : lifecycleStatusValid
      ? task.lifecycleStatus
      : null;

  // 13. Task with status COMPLETED must have completedAt
  if (effectiveLifecycle === 'COMPLETED' && !isValidSimTimestamp(task.completedAt)) {
    issues.push({
      code: 'MISSING_COMPLETED_AT_TIMESTAMP',
      field: 'completedAt',
      message: 'Task with status COMPLETED must have a valid completedAt simulation timestamp.',
    });
  }

  // 14. Task with status RUNNING must have startedAt
  if (effectiveLifecycle === 'RUNNING' && !isValidSimTimestamp(task.startedAt)) {
    issues.push({
      code: 'MISSING_STARTED_AT_TIMESTAMP',
      field: 'startedAt',
      message: 'Task with status RUNNING must have a valid startedAt simulation timestamp.',
    });
  }

  // 15. Task with status PENDING must NOT have queuedAt
  if (effectiveLifecycle === 'PENDING' && task.queuedAt !== null) {
    issues.push({
      code: 'PENDING_TASK_HAS_QUEUED_AT',
      field: 'queuedAt',
      message: 'Task with status PENDING must not have a queuedAt timestamp (must be null).',
    });
  }

  // 16. completedAt must not be less than startedAt
  if (
    isValidSimTimestamp(task.completedAt) &&
    isValidSimTimestamp(task.startedAt) &&
    task.completedAt < task.startedAt
  ) {
    issues.push({
      code: 'INVALID_TIMESTAMP_ORDER_COMPLETED_BEFORE_STARTED',
      field: 'completedAt',
      message: `completedAt (${task.completedAt}) cannot be earlier than startedAt (${task.startedAt}).`,
    });
  }

  // 17. updatedAt must not be less than createdAt
  if (
    isValidSimTimestamp(task.updatedAt) &&
    isValidSimTimestamp(task.createdAt) &&
    task.updatedAt < task.createdAt
  ) {
    issues.push({
      code: 'INVALID_TIMESTAMP_ORDER_UPDATED_BEFORE_CREATED',
      field: 'updatedAt',
      message: `updatedAt (${task.updatedAt}) cannot be earlier than createdAt (${task.createdAt}).`,
    });
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export function assertValidTaskEntity(
  task: TaskEntity,
  options?: ValidateTaskOptions,
): void {
  const result = validateTaskEntity(task, options);
  if (!result.valid) {
    const summary = result.issues.map((i) => `[${i.code}] ${i.message}`).join('; ');
    throw new Error(`Invalid TaskEntity: ${summary}`);
  }
}
