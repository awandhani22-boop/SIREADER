import type {
  PermanentWorkerId,
  WorkerCapabilityProfile,
} from '../tasks/task.types';
import {
  getWorkerCapabilityProfile,
  isPermanentWorkerId,
  supportsTaskType,
} from '../workers/worker.capabilities';
import { getActiveTaskIds } from '../workers/worker.concurrency';
import type {
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from '../workers/worker.types';

/**
 * Worker Matching & Dispatch State Builder (Phase 2.2 — Local Deterministic Simulation)
 *
 * Pure, side-effect-free inspection of worker eligibility, concurrency occupancy,
 * legacy queue reservation, and capability support.
 */

export type WorkerExclusion =
  | 'BLOCKED_STATE'
  | 'LEGACY_QUEUE_RESERVED'
  | 'AT_CAPACITY';

export interface WorkerDispatchState {
  readonly workerId: WorkerId;
  readonly activeCount: number;
  readonly maxConcurrency: number;
  readonly exclusion: WorkerExclusion | null;
}

const ELIGIBLE_WORKER_STATUSES: ReadonlySet<WorkerStatus> = new Set<WorkerStatus>([
  'IDLE',
  'WAITING',
  'TASK_RECEIVED',
  'WALKING',
  'BUSY',
]);

function resolveMaxConcurrency(rawMaxConcurrency: unknown): number {
  if (
    typeof rawMaxConcurrency === 'number' &&
    Number.isFinite(rawMaxConcurrency) &&
    Number.isInteger(rawMaxConcurrency) &&
    rawMaxConcurrency >= 1
  ) {
    return rawMaxConcurrency;
  }
  return 1;
}

function evaluateWorkerExclusion(
  worker: WorkerEntity,
  activeCount: number,
  maxConcurrency: number,
): WorkerExclusion | null {
  if (!ELIGIBLE_WORKER_STATUSES.has(worker.status)) {
    return 'BLOCKED_STATE';
  }

  const hasPendingLegacyQueue =
    Array.isArray(worker.taskQueueIds) && worker.taskQueueIds.length > 0;
  if (hasPendingLegacyQueue) {
    return 'LEGACY_QUEUE_RESERVED';
  }

  if (activeCount >= maxConcurrency) {
    return 'AT_CAPACITY';
  }

  return null;
}

/**
 * Builds deterministic dispatch states for workers present in both `snapshot.workerOrder`
 * and `snapshot.workers` whose IDs are canonical permanent worker IDs.
 */
export function buildWorkerDispatchStates(
  snapshot: SimulationSnapshot,
  registry?: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>>,
): Record<WorkerId, WorkerDispatchState> {
  const states = {} as Record<WorkerId, WorkerDispatchState>;

  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !Array.isArray(snapshot.workerOrder) ||
    !snapshot.workers ||
    typeof snapshot.workers !== 'object'
  ) {
    return states;
  }

  const seenWorkerIds = new Set<string>();

  for (const rawWorkerId of snapshot.workerOrder) {
    if (typeof rawWorkerId !== 'string' || seenWorkerIds.has(rawWorkerId)) {
      continue;
    }
    seenWorkerIds.add(rawWorkerId);

    if (!isPermanentWorkerId(rawWorkerId)) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(snapshot.workers, rawWorkerId)) {
      continue;
    }

    const worker = snapshot.workers[rawWorkerId];
    if (!worker || typeof worker !== 'object') {
      continue;
    }

    const profile = getWorkerCapabilityProfile(rawWorkerId, registry);
    const maxConcurrency = resolveMaxConcurrency(profile?.maxConcurrency);
    const activeCount = getActiveTaskIds(worker).length;
    const exclusion = evaluateWorkerExclusion(
      worker,
      activeCount,
      maxConcurrency,
    );

    states[rawWorkerId] = {
      workerId: rawWorkerId,
      activeCount,
      maxConcurrency,
      exclusion,
    };
  }

  return states;
}

/**
 * Returns permanent worker IDs from `workerOrder` (deduplicated in first-occurrence order)
 * that actively support `task.type` according to `supportsTaskType()`.
 */
export function findCapableWorkerIds(
  task: TaskEntity,
  workerOrder: readonly WorkerId[],
  registry?: Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>>,
): WorkerId[] {
  if (!task || typeof task !== 'object' || !Array.isArray(workerOrder)) {
    return [];
  }

  const seenWorkerIds = new Set<string>();
  const capableWorkerIds: WorkerId[] = [];

  for (const rawWorkerId of workerOrder) {
    if (typeof rawWorkerId !== 'string' || seenWorkerIds.has(rawWorkerId)) {
      continue;
    }
    seenWorkerIds.add(rawWorkerId);

    if (!isPermanentWorkerId(rawWorkerId)) {
      continue;
    }

    if (supportsTaskType(rawWorkerId, task.type, registry)) {
      capableWorkerIds.push(rawWorkerId);
    }
  }

  return capableWorkerIds;
}
