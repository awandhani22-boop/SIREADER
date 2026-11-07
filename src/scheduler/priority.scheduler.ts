import type { TaskPriority } from '../tasks/task.types';
import type { TaskEntity } from '../workers/worker.types';
import type { QueuedTaskEntry } from './scheduler.types';

/**
 * Priority Scheduler (Phase 2.2 — Local Deterministic Simulation)
 *
 * Pure, side-effect-free priority and FIFO ordering module for the global scheduler queue.
 *
 * Total Ordering Rules:
 * 1. Existing task entities sort before entries whose task entity is missing (`task === null`).
 * 2. Priority rank ascending: `CRITICAL` (0) < `HIGH` (1) < `NORMAL` (2) < `LOW` (3) < unknown runtime priority (4).
 * 3. FIFO sequence ascending (`entry.sequence`). `enqueuedAtSimMs` never determines FIFO order.
 * 4. Original array index ascending (`originalIndex`) as the final deterministic tie-breaker.
 */

export const PRIORITY_RANK = Object.freeze({
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
} satisfies Record<TaskPriority, number>);

const UNKNOWN_PRIORITY_FALLBACK_RANK = 4;

export interface OrderedQueueItem {
  readonly entry: QueuedTaskEntry;
  readonly task: TaskEntity | null;
  readonly originalIndex: number;
}

/**
 * Resolves the numeric priority rank for a task priority value.
 * Known `TaskPriority` values return `0..3` from `PRIORITY_RANK`.
 * Any unknown runtime value returns fallback rank `4` (never `NaN`).
 */
export function resolvePriorityRank(priority: unknown): number {
  if (
    typeof priority === 'string' &&
    Object.prototype.hasOwnProperty.call(PRIORITY_RANK, priority)
  ) {
    return PRIORITY_RANK[priority as TaskPriority];
  }
  return UNKNOWN_PRIORITY_FALLBACK_RANK;
}

/**
 * Pure total-order comparator for two `OrderedQueueItem` elements.
 */
export function compareOrderedQueueItems(
  a: OrderedQueueItem,
  b: OrderedQueueItem,
): number {
  // 1. Existing task entities before missing task entities
  const aMissing = a.task === null ? 1 : 0;
  const bMissing = b.task === null ? 1 : 0;
  if (aMissing !== bMissing) {
    return aMissing - bMissing;
  }

  // 2. Priority rank ascending (only when both have existing task entities)
  if (a.task !== null && b.task !== null) {
    const aRank = resolvePriorityRank(a.task.priority);
    const bRank = resolvePriorityRank(b.task.priority);
    if (aRank !== bRank) {
      return aRank - bRank;
    }
  }

  // 3. FIFO sequence ascending
  if (a.entry.sequence !== b.entry.sequence) {
    return a.entry.sequence - b.entry.sequence;
  }

  // 4. Original array index ascending
  return a.originalIndex - b.originalIndex;
}

/**
 * Returns a newly ordered array of `OrderedQueueItem` records without mutating
 * `entries`, `tasks`, or any individual entry/task object.
 */
export function orderQueue(
  entries: readonly QueuedTaskEntry[],
  tasks: Readonly<Record<string, TaskEntity>>,
): readonly OrderedQueueItem[] {
  const indexedItems: OrderedQueueItem[] = entries.map((entry, originalIndex) => {
    const task =
      typeof entry.taskId === 'string' &&
      Object.prototype.hasOwnProperty.call(tasks, entry.taskId)
        ? (tasks[entry.taskId] ?? null)
        : null;
    return {
      entry,
      task,
      originalIndex,
    };
  });

  return indexedItems.sort(compareOrderedQueueItems);
}
