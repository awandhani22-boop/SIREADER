import type { WorkerEntity } from './worker.types';

/**
 * Worker Concurrency Helpers (Phase 2.2 — Local Deterministic Simulation)
 *
 * Centralizes all active-task list (`activeTaskIds`) and primary task (`currentTaskId`)
 * mutations and invariant assertions.
 *
 * Mandatory Invariants:
 * 1. `activeTaskIds` is the canonical ordered list of active tasks for a worker.
 * 2. `currentTaskId === (activeTaskIds[0] ?? null)` at all times.
 * 3. If a legacy worker fixture omits `activeTaskIds`, `getActiveTaskIds` derives
 *    the fallback from `currentTaskId`; once `activeTaskIds` exists, it is authoritative.
 * 4. `activeTaskIds` contains no duplicate or empty task IDs.
 */

export function getActiveTaskIds(
  worker: Pick<WorkerEntity, 'activeTaskIds' | 'currentTaskId'>,
): string[] {
  const maybeExplicit = (worker as Partial<Pick<WorkerEntity, 'activeTaskIds'>>).activeTaskIds;
  if (Array.isArray(maybeExplicit)) {
    return [...maybeExplicit];
  }
  if (typeof worker.currentTaskId === 'string' && worker.currentTaskId.trim().length > 0) {
    return [worker.currentTaskId];
  }
  return [];
}

export function withTaskActivated(
  worker: WorkerEntity,
  taskId: string,
): WorkerEntity {
  const normalizedTaskId = taskId.trim();
  if (normalizedTaskId.length === 0) {
    throw new Error(
      `[WorkerConcurrency] Cannot activate an empty taskId on worker "${worker.id}".`,
    );
  }

  const hasExplicitActiveIds = Array.isArray(
    (worker as Partial<Pick<WorkerEntity, 'activeTaskIds'>>).activeTaskIds,
  );
  const currentIds = getActiveTaskIds(worker);
  const alreadyPresent = currentIds.includes(normalizedTaskId);
  const nextActiveIds = alreadyPresent
    ? currentIds
    : [...currentIds, normalizedTaskId];
  const nextCurrentTaskId = nextActiveIds[0] ?? null;

  if (
    hasExplicitActiveIds &&
    alreadyPresent &&
    worker.currentTaskId === nextCurrentTaskId &&
    worker.activeTaskIds.length === nextActiveIds.length &&
    worker.activeTaskIds.every((id, index) => id === nextActiveIds[index])
  ) {
    return worker;
  }

  return {
    ...worker,
    activeTaskIds: nextActiveIds,
    currentTaskId: nextCurrentTaskId,
  };
}

export function withTaskDeactivated(
  worker: WorkerEntity,
  taskId: string,
): WorkerEntity {
  const normalizedTaskId = taskId.trim();
  const hasExplicitActiveIds = Array.isArray(
    (worker as Partial<Pick<WorkerEntity, 'activeTaskIds'>>).activeTaskIds,
  );
  const currentIds = getActiveTaskIds(worker);
  const nextActiveIds = currentIds.filter((id) => id !== normalizedTaskId);
  const nextCurrentTaskId = nextActiveIds[0] ?? null;

  if (
    hasExplicitActiveIds &&
    worker.currentTaskId === nextCurrentTaskId &&
    worker.activeTaskIds.length === nextActiveIds.length &&
    worker.activeTaskIds.every((id, index) => id === nextActiveIds[index])
  ) {
    return worker;
  }

  return {
    ...worker,
    activeTaskIds: nextActiveIds,
    currentTaskId: nextCurrentTaskId,
  };
}

export function assertWorkerConcurrencyInvariant(
  worker: Pick<WorkerEntity, 'id' | 'activeTaskIds' | 'currentTaskId'>,
  maxConcurrency: number,
): void {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error(
      `[WorkerConcurrency] Invalid maxConcurrency (${String(maxConcurrency)}) for worker "${worker.id}"; expected an integer >= 1.`,
    );
  }

  if (!Array.isArray(worker.activeTaskIds)) {
    throw new Error(
      `[WorkerConcurrency] Worker "${worker.id}" is missing canonical activeTaskIds array.`,
    );
  }

  if (worker.activeTaskIds.length > maxConcurrency) {
    throw new Error(
      `[WorkerConcurrency] Worker "${worker.id}" activeTaskIds length (${worker.activeTaskIds.length}) exceeds maxConcurrency (${maxConcurrency}).`,
    );
  }

  const seen = new Set<string>();
  for (const taskId of worker.activeTaskIds) {
    if (typeof taskId !== 'string' || taskId.trim().length === 0) {
      throw new Error(
        `[WorkerConcurrency] Worker "${worker.id}" contains an empty or non-string taskId in activeTaskIds.`,
      );
    }
    if (seen.has(taskId)) {
      throw new Error(
        `[WorkerConcurrency] Worker "${worker.id}" contains duplicate active taskId "${taskId}".`,
      );
    }
    seen.add(taskId);
  }

  const expectedPrimaryTaskId = worker.activeTaskIds[0] ?? null;
  if (worker.currentTaskId !== expectedPrimaryTaskId) {
    throw new Error(
      `[WorkerConcurrency] Worker "${worker.id}" currentTaskId (${String(worker.currentTaskId)}) does not match activeTaskIds[0] (${String(expectedPrimaryTaskId)}).`,
    );
  }
}
