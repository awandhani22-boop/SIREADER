import type {
  QueuedTaskEntry,
  SchedulerSnapshotState,
} from './scheduler.types';
import {
  FIXED_TICK_SIM_MS,
  type SimulationSnapshot,
  type TaskEntity,
  type WorkerEntity,
  type WorkerId,
} from '../workers/worker.types';

/**
 * Scheduler State & Snapshot Normalizer (Phase 2.2 — Local Deterministic Simulation)
 *
 * Enforces the mandatory normalization and concurrency invariants:
 * 1. `activeTaskIds` is the canonical active-task list.
 * 2. `currentTaskId === (activeTaskIds[0] ?? null)` after normalization.
 * 3. If a legacy snapshot/worker has no `activeTaskIds` property, derive the fallback from `currentTaskId`.
 * 4. If `activeTaskIds` already exists, never prepend a mismatching `currentTaskId` to it (`activeTaskIds` wins).
 * 5. Remove missing and terminal/non-active task IDs (`COMPLETED`, `CANCELLED`, `FAILED`, `QUEUED`, `PENDING`)
 *    from `activeTaskIds`.
 * 6. Recover a `BUSY`, `TASK_RECEIVED`, or `WALKING` worker with no valid active tasks to `'IDLE'`,
 *    with `transitionSimMs: 0`, `animationState: 'seated'`, and `position3D: [...worker.homePosition3D]`.
 * 7. Preserve valid `WorkerEntity` references and preserve a valid `SimulationSnapshot` reference
 *    (zero unnecessary cloning on normal ticks).
 * 8. Preserve structurally valid scheduler entries whose task entity is missing from `snapshot.tasks`
 *    so the dispatcher can diagnose them explicitly.
 */

const INITIAL_SCHEDULER_ENTRIES: readonly QueuedTaskEntry[] = Object.freeze([]);

export function createInitialSchedulerState(): SchedulerSnapshotState {
  return {
    entries: INITIAL_SCHEDULER_ENTRIES,
    nextSequence: 1,
  };
}

function isStructurallyValidQueuedEntry(
  candidate: unknown,
): candidate is QueuedTaskEntry {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const entry = candidate as Partial<QueuedTaskEntry>;
  return (
    typeof entry.taskId === 'string' &&
    entry.taskId.trim().length > 0 &&
    typeof entry.sequence === 'number' &&
    Number.isInteger(entry.sequence) &&
    entry.sequence > 0 &&
    typeof entry.enqueuedAtSimMs === 'number' &&
    Number.isFinite(entry.enqueuedAtSimMs) &&
    entry.enqueuedAtSimMs >= 0
  );
}

export function normalizeSchedulerState(
  scheduler?: SchedulerSnapshotState | null,
): SchedulerSnapshotState {
  if (
    !scheduler ||
    typeof scheduler !== 'object' ||
    !Array.isArray(scheduler.entries)
  ) {
    return createInitialSchedulerState();
  }

  const seenTaskIds = new Set<string>();
  const validEntries: QueuedTaskEntry[] = [];
  let maxSequence = 0;
  let entriesIdentical = true;

  for (let i = 0; i < scheduler.entries.length; i++) {
    const rawEntry = scheduler.entries[i];
    if (!isStructurallyValidQueuedEntry(rawEntry)) {
      entriesIdentical = false;
      continue;
    }

    const trimmedTaskId = rawEntry.taskId.trim();
    if (seenTaskIds.has(trimmedTaskId)) {
      entriesIdentical = false;
      continue;
    }

    seenTaskIds.add(trimmedTaskId);
    if (rawEntry.sequence > maxSequence) {
      maxSequence = rawEntry.sequence;
    }

    if (trimmedTaskId !== rawEntry.taskId) {
      entriesIdentical = false;
      validEntries.push({
        taskId: trimmedTaskId,
        sequence: rawEntry.sequence,
        enqueuedAtSimMs: rawEntry.enqueuedAtSimMs,
      });
    } else {
      validEntries.push(rawEntry);
    }
  }

  const validNextSequence =
    typeof scheduler.nextSequence === 'number' &&
    Number.isInteger(scheduler.nextSequence) &&
    scheduler.nextSequence > maxSequence
      ? scheduler.nextSequence
      : maxSequence + 1;

  if (
    entriesIdentical &&
    validEntries.length === scheduler.entries.length &&
    scheduler.nextSequence === validNextSequence
  ) {
    return scheduler;
  }

  return {
    entries: validEntries,
    nextSequence: validNextSequence,
  };
}

function isNonTerminalActiveTask(task: TaskEntity | undefined): boolean {
  if (!task) {
    return false;
  }
  if (
    task.lifecycleStatus === 'COMPLETED' ||
    task.lifecycleStatus === 'CANCELLED' ||
    task.lifecycleStatus === 'FAILED' ||
    task.lifecycleStatus === 'QUEUED' ||
    task.lifecycleStatus === 'PENDING'
  ) {
    return false;
  }
  if (
    task.status === 'COMPLETED' ||
    task.status === 'CANCELLED' ||
    task.status === 'FAILED' ||
    task.status === 'QUEUED' ||
    task.status === 'PENDING'
  ) {
    return false;
  }
  return true;
}

export function normalizeWorkerEntity(
  worker: WorkerEntity,
  tasks: Readonly<Record<string, TaskEntity>>,
): WorkerEntity {
  const maybeExplicitActiveIds = (
    worker as Partial<Pick<WorkerEntity, 'activeTaskIds'>>
  ).activeTaskIds;
  const hasExplicitActiveIds = Array.isArray(maybeExplicitActiveIds);

  // Rule 3 & 4:
  // - If `activeTaskIds` does not exist on a legacy snapshot, derive fallback from `currentTaskId`.
  // - If `activeTaskIds` already exists, never prepend a mismatching `currentTaskId` to it (`activeTaskIds` wins).
  const candidateIds: readonly unknown[] = hasExplicitActiveIds
    ? maybeExplicitActiveIds
    : typeof worker.currentTaskId === 'string' &&
        worker.currentTaskId.trim().length > 0
      ? [worker.currentTaskId]
      : [];

  const seenIds = new Set<string>();
  const validActiveIds: string[] = [];

  for (const rawId of candidateIds) {
    if (typeof rawId !== 'string') {
      continue;
    }
    const trimmedId = rawId.trim();
    if (trimmedId.length === 0 || seenIds.has(trimmedId)) {
      continue;
    }
    const task = tasks[trimmedId];
    if (!isNonTerminalActiveTask(task)) {
      continue;
    }
    seenIds.add(trimmedId);
    validActiveIds.push(trimmedId);
  }

  const expectedCurrentTaskId = validActiveIds[0] ?? null;

  // Rule 6: Recover a BUSY, TASK_RECEIVED, or WALKING worker with no valid active tasks to IDLE
  const isStrandedInActiveState =
    validActiveIds.length === 0 &&
    (worker.status === 'BUSY' ||
      worker.status === 'TASK_RECEIVED' ||
      worker.status === 'WALKING');

  if (isStrandedInActiveState) {
    return {
      ...worker,
      status: 'IDLE',
      transitionSimMs: 0,
      animationState: 'seated',
      position3D: [...worker.homePosition3D],
      activeTaskIds: [],
      currentTaskId: null,
    };
  }

  // Rule 7: Preserve valid WorkerEntity reference when already normalized
  const activeIdsUnchanged =
    hasExplicitActiveIds &&
    maybeExplicitActiveIds.length === validActiveIds.length &&
    maybeExplicitActiveIds.every((id, index) => id === validActiveIds[index]);

  if (activeIdsUnchanged && worker.currentTaskId === expectedCurrentTaskId) {
    return worker;
  }

  return {
    ...worker,
    activeTaskIds: validActiveIds,
    currentTaskId: expectedCurrentTaskId,
  };
}

export function normalizeSimulationSnapshot(
  snapshot: SimulationSnapshot,
): SimulationSnapshot {
  let workersChanged = false;
  const nextWorkers: Record<WorkerId, WorkerEntity> = { ...snapshot.workers };

  for (const [workerId, worker] of Object.entries(snapshot.workers)) {
    if (!worker) {
      continue;
    }
    const normalizedWorker = normalizeWorkerEntity(worker, snapshot.tasks);
    if (normalizedWorker !== worker) {
      workersChanged = true;
      nextWorkers[workerId] = normalizedWorker;
    }
  }

  const normalizedScheduler = normalizeSchedulerState(snapshot.scheduler);
  const schedulerChanged = normalizedScheduler !== snapshot.scheduler;

  const rawAcc = snapshot.accumulatorMs;
  const hasValidAccumulator =
    typeof rawAcc === 'number' &&
    Number.isFinite(rawAcc) &&
    rawAcc >= 0 &&
    rawAcc < FIXED_TICK_SIM_MS;
  const normalizedAccumulatorMs = hasValidAccumulator
    ? Number(rawAcc.toFixed(3))
    : 0;
  const accumulatorChanged =
    !hasValidAccumulator || rawAcc !== normalizedAccumulatorMs;

  if (!workersChanged && !schedulerChanged && !accumulatorChanged) {
    return snapshot;
  }

  return {
    ...snapshot,
    accumulatorMs: normalizedAccumulatorMs,
    workers: workersChanged ? nextWorkers : snapshot.workers,
    scheduler: normalizedScheduler,
  };
}
