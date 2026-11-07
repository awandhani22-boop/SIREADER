import type {
  PermanentWorkerId,
  TaskPriority,
  TaskStatus,
} from '../tasks/task.types';

/**
 * Foundational Scheduler Domain Types (Phase 2.2 — Local Deterministic Simulation)
 *
 * Strictly independent of `src/workers/worker.types.ts` to guarantee an acyclic
 * dependency graph across `tasks`, `scheduler`, and `workers`.
 *
 * Key Invariants:
 * - `QueuedTaskEntry` does NOT duplicate `priority`; task priority is read canonically
 *   from `snapshot.tasks[entry.taskId].priority`.
 * - `SchedulerSnapshotState.nextSequence` is the monotonic FIFO sequence counter
 *   (starts at 1, increments by 1 per enqueued global task).
 */

export interface QueuedTaskEntry {
  readonly taskId: string;
  readonly sequence: number;
  readonly enqueuedAtSimMs: number;
}

export interface SchedulerSnapshotState {
  readonly entries: readonly QueuedTaskEntry[];
  readonly nextSequence: number;
}

export type DispatchBlockReason =
  | 'MISSING_TASK_ENTITY'
  | 'NO_CAPABLE_WORKER'
  | 'ALL_CAPABLE_WORKERS_AT_CAPACITY'
  | 'ALL_CAPABLE_WORKERS_BLOCKED_STATE'
  | 'ALL_CAPABLE_WORKERS_RESERVED_BY_LEGACY_QUEUE'
  | 'CAPABLE_WORKERS_UNAVAILABLE_MIXED'
  | 'TASK_NOT_DISPATCHABLE';

export type EnqueueRejection =
  | 'TASK_NOT_QUEUED'
  | 'DUPLICATE_ENTRY'
  | 'TASK_ALREADY_TRACKED'
  | 'PINNED_TASK_NOT_ALLOWED'
  | 'INVALID_TASK';

export type EnqueueResult<TSnapshot> =
  | {
      readonly ok: true;
      readonly snapshot: TSnapshot;
      readonly entry: QueuedTaskEntry;
    }
  | {
      readonly ok: false;
      readonly snapshot: TSnapshot;
      readonly reason: EnqueueRejection;
    };

export interface DispatchedTaskRecord {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly taskStatus: TaskStatus;
  readonly workerId: PermanentWorkerId;
  readonly priority: TaskPriority;
  readonly sequence: number;
  readonly loadRatioBeforeDispatch: number;
  readonly costRateUsd: number;
}

export interface BlockedTaskRecord {
  readonly taskId: string;
  readonly priority: TaskPriority;
  readonly sequence: number;
  readonly reason: DispatchBlockReason;
  readonly detail?: string;
}

export interface DroppedEntryRecord {
  readonly taskId: string;
  readonly sequence: number;
  readonly reason: DispatchBlockReason;
  readonly detail?: string;
}

export interface DispatchPassResult<TSnapshot> {
  readonly snapshot: TSnapshot;
  readonly dispatched: readonly DispatchedTaskRecord[];
  readonly blocked: readonly BlockedTaskRecord[];
  readonly dropped: readonly DroppedEntryRecord[];
  readonly skipped?: 'GLOBALLY_PAUSED';
}
