import { validateTaskEntity } from '../tasks/task.validation';
import { getActiveTaskIds } from '../workers/worker.concurrency';
import type {
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
} from '../workers/worker.types';
import { normalizeSchedulerState } from './scheduler.state';
import type {
  EnqueueRejection,
  EnqueueResult,
  QueuedTaskEntry,
  SchedulerSnapshotState,
} from './scheduler.types';

/**
 * Global Task Enqueue Module (Phase 2.2 — Commit 4: Enqueue Only)
 *
 * Pure, deterministic, side-effect-free operations for inserting unassigned
 * `QUEUED` tasks into the global scheduler queue (`snapshot.scheduler`).
 *
 * Strict Rejection Precedence:
 * 1. Invalid/missing task or snapshot data -> `'INVALID_TASK'`
 * 2. `task.assignedWorkerId !== null` -> `'PINNED_TASK_NOT_ALLOWED'`
 * 3. `task.status !== 'QUEUED' || task.lifecycleStatus !== 'QUEUED'` -> `'TASK_NOT_QUEUED'`
 * 4. Existing scheduler entry for `task.id` -> `'DUPLICATE_ENTRY'`
 * 5. Existing task-map ID (`enqueueTask` only) or worker active/legacy/completed tracking -> `'TASK_ALREADY_TRACKED'`
 * 6. Remaining `validateTaskEntity` failures -> `'INVALID_TASK'`
 *
 * Every rejection returns the exact original `snapshot` reference untouched.
 */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSnapshotForEnqueue(
  snapshot: unknown,
): snapshot is SimulationSnapshot {
  return (
    isPlainRecord(snapshot) &&
    typeof snapshot.simTimeMs === 'number' &&
    Number.isFinite(snapshot.simTimeMs) &&
    snapshot.simTimeMs >= 0 &&
    isPlainRecord(snapshot.tasks)
  );
}

function rejectEnqueue(
  snapshot: SimulationSnapshot,
  reason: EnqueueRejection,
): EnqueueResult<SimulationSnapshot> {
  return {
    ok: false,
    snapshot,
    reason,
  };
}

function isTaskIdInArray(maybeIds: unknown, taskId: string): boolean {
  if (!Array.isArray(maybeIds)) {
    return false;
  }
  for (const rawId of maybeIds) {
    if (typeof rawId === 'string' && rawId.trim() === taskId) {
      return true;
    }
  }
  return false;
}

function isTaskTrackedOnAnyWorker(
  snapshot: SimulationSnapshot,
  taskId: string,
): boolean {
  if (!isPlainRecord(snapshot.workers)) {
    return false;
  }

  for (const workerKey of Object.keys(snapshot.workers)) {
    if (!Object.prototype.hasOwnProperty.call(snapshot.workers, workerKey)) {
      continue;
    }
    const rawWorker = snapshot.workers[workerKey];
    if (!isPlainRecord(rawWorker)) {
      continue;
    }
    const worker = rawWorker as unknown as WorkerEntity;

    const activeIds = getActiveTaskIds(worker);
    if (isTaskIdInArray(activeIds, taskId)) {
      return true;
    }
    if (isTaskIdInArray(worker.taskQueueIds, taskId)) {
      return true;
    }
    if (isTaskIdInArray(worker.completedTaskIds, taskId)) {
      return true;
    }
  }

  return false;
}

function isTaskIdInTaskMap(
  tasks: Readonly<Record<string, TaskEntity>>,
  taskId: string,
): boolean {
  if (Object.prototype.hasOwnProperty.call(tasks, taskId)) {
    return true;
  }
  for (const key of Object.keys(tasks)) {
    const candidate = tasks[key];
    if (isPlainRecord(candidate) && candidate.id === taskId) {
      return true;
    }
  }
  return false;
}

function hasDuplicateEntityUnderOtherKey(
  tasks: Readonly<Record<string, TaskEntity>>,
  taskId: string,
): boolean {
  for (const key of Object.keys(tasks)) {
    if (key === taskId) {
      continue;
    }
    const candidate = tasks[key];
    if (isPlainRecord(candidate) && candidate.id === taskId) {
      return true;
    }
  }
  return false;
}

/**
 * Enqueues a NEW unassigned `QUEUED` `TaskEntity` that is not yet stored in `snapshot.tasks`.
 * Inserts `task` into `snapshot.tasks` and appends a `QueuedTaskEntry` to `snapshot.scheduler`
 * only after all validations pass. Never emits events and never mutates inputs.
 */
export function enqueueTask(
  snapshot: SimulationSnapshot,
  task: TaskEntity,
): EnqueueResult<SimulationSnapshot> {
  // 1. Invalid/missing task or snapshot data -> INVALID_TASK
  if (!isValidSnapshotForEnqueue(snapshot) || !isPlainRecord(task)) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  if (
    typeof task.id !== 'string' ||
    task.id.trim().length === 0 ||
    task.id !== task.id.trim() ||
    task.assignedWorkerId === undefined ||
    typeof task.status !== 'string' ||
    typeof task.lifecycleStatus !== 'string'
  ) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  // 2. Pinned task -> PINNED_TASK_NOT_ALLOWED
  if (task.assignedWorkerId !== null) {
    return rejectEnqueue(snapshot, 'PINNED_TASK_NOT_ALLOWED');
  }

  // 3. Non-QUEUED status or lifecycleStatus -> TASK_NOT_QUEUED
  if (task.status !== 'QUEUED' || task.lifecycleStatus !== 'QUEUED') {
    return rejectEnqueue(snapshot, 'TASK_NOT_QUEUED');
  }

  // 4. Existing scheduler entry -> DUPLICATE_ENTRY
  const normalizedScheduler = normalizeSchedulerState(snapshot.scheduler);
  if (normalizedScheduler.entries.some((entry) => entry.taskId === task.id)) {
    return rejectEnqueue(snapshot, 'DUPLICATE_ENTRY');
  }

  // 5. Existing task-map ID or worker active/legacy/completed tracking -> TASK_ALREADY_TRACKED
  if (
    isTaskIdInTaskMap(snapshot.tasks, task.id) ||
    isTaskTrackedOnAnyWorker(snapshot, task.id)
  ) {
    return rejectEnqueue(snapshot, 'TASK_ALREADY_TRACKED');
  }

  // 6. Remaining validateTaskEntity failures -> INVALID_TASK
  const existingTaskIds = Object.keys(snapshot.tasks);
  const validation = validateTaskEntity(task, { existingTaskIds });
  if (!validation.valid) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  const entry: QueuedTaskEntry = {
    taskId: task.id,
    sequence: normalizedScheduler.nextSequence,
    enqueuedAtSimMs: snapshot.simTimeMs,
  };

  const nextScheduler: SchedulerSnapshotState = {
    entries: [...normalizedScheduler.entries, entry],
    nextSequence: normalizedScheduler.nextSequence + 1,
  };

  const nextSnapshot: SimulationSnapshot = {
    ...snapshot,
    tasks: {
      ...snapshot.tasks,
      [task.id]: task,
    },
    scheduler: nextScheduler,
  };

  return {
    ok: true,
    snapshot: nextSnapshot,
    entry,
  };
}

/**
 * Enqueues an EXISTING unassigned `QUEUED` task already stored in `snapshot.tasks[taskId]`.
 * Preserves the exact `snapshot.tasks` map reference, appends a `QueuedTaskEntry`
 * to `snapshot.scheduler`, never emits events, and never mutates inputs.
 */
export function enqueueExistingTaskById(
  snapshot: SimulationSnapshot,
  taskId: string,
): EnqueueResult<SimulationSnapshot> {
  // 1. Invalid/missing taskId, snapshot, or task entity -> INVALID_TASK
  if (
    !isValidSnapshotForEnqueue(snapshot) ||
    typeof taskId !== 'string' ||
    taskId.trim().length === 0 ||
    taskId !== taskId.trim()
  ) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  if (!Object.prototype.hasOwnProperty.call(snapshot.tasks, taskId)) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  const task = snapshot.tasks[taskId];
  if (
    !isPlainRecord(task) ||
    typeof task.id !== 'string' ||
    task.id.trim().length === 0 ||
    task.id !== taskId ||
    task.assignedWorkerId === undefined ||
    typeof task.status !== 'string' ||
    typeof task.lifecycleStatus !== 'string'
  ) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  // 2. Pinned task -> PINNED_TASK_NOT_ALLOWED
  if (task.assignedWorkerId !== null) {
    return rejectEnqueue(snapshot, 'PINNED_TASK_NOT_ALLOWED');
  }

  // 3. Non-QUEUED status or lifecycleStatus -> TASK_NOT_QUEUED
  if (task.status !== 'QUEUED' || task.lifecycleStatus !== 'QUEUED') {
    return rejectEnqueue(snapshot, 'TASK_NOT_QUEUED');
  }

  // 4. Existing scheduler entry -> DUPLICATE_ENTRY
  const normalizedScheduler = normalizeSchedulerState(snapshot.scheduler);
  if (normalizedScheduler.entries.some((entry) => entry.taskId === taskId)) {
    return rejectEnqueue(snapshot, 'DUPLICATE_ENTRY');
  }

  // 5. Worker active/legacy/completed tracking -> TASK_ALREADY_TRACKED
  if (
    hasDuplicateEntityUnderOtherKey(snapshot.tasks, taskId) ||
    isTaskTrackedOnAnyWorker(snapshot, taskId)
  ) {
    return rejectEnqueue(snapshot, 'TASK_ALREADY_TRACKED');
  }

  // 6. Remaining validateTaskEntity failures -> INVALID_TASK
  const otherTaskIds = Object.keys(snapshot.tasks).filter(
    (key) => key !== taskId,
  );
  const validation = validateTaskEntity(task, {
    existingTaskIds: otherTaskIds,
  });
  if (!validation.valid) {
    return rejectEnqueue(snapshot, 'INVALID_TASK');
  }

  const entry: QueuedTaskEntry = {
    taskId: task.id,
    sequence: normalizedScheduler.nextSequence,
    enqueuedAtSimMs: snapshot.simTimeMs,
  };

  const nextScheduler: SchedulerSnapshotState = {
    entries: [...normalizedScheduler.entries, entry],
    nextSequence: normalizedScheduler.nextSequence + 1,
  };

  const nextSnapshot: SimulationSnapshot = {
    ...snapshot,
    scheduler: nextScheduler,
  };

  return {
    ok: true,
    snapshot: nextSnapshot,
    entry,
  };
}
