import {
  TASK_PRIORITIES,
  type PermanentWorkerId,
  type TaskPriority,
  type WorkerCapabilityProfile,
} from '../tasks/task.types';
import { activateQueuedTaskForExecution } from '../tasks/task.transitions';
import { validateTaskEntity } from '../tasks/task.validation';
import { isPermanentWorkerId } from '../workers/worker.capabilities';
import {
  getActiveTaskIds,
  withTaskActivated,
} from '../workers/worker.concurrency';
import { COST_PER_1K_TOKENS_SIMULATED } from '../workers/worker.registry';
import type {
  ActivityEvent,
  AnimationClipKey,
  SimulationSnapshot,
  TaskEntity,
  TaskStatus,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from '../workers/worker.types';
import { orderQueue } from './priority.scheduler';
import { normalizeSchedulerState } from './scheduler.state';
import type {
  BlockedTaskRecord,
  DispatchBlockReason,
  DispatchedTaskRecord,
  DispatchPassResult,
  DroppedEntryRecord,
  EnqueueRejection,
  EnqueueResult,
  QueuedTaskEntry,
  SchedulerSnapshotState,
} from './scheduler.types';
import {
  buildWorkerDispatchStates,
  findCapableWorkerIds,
  type WorkerDispatchState,
  type WorkerExclusion,
} from './worker.matching';
import { selectWorker } from './worker.selector';

/**
 * Global Task Enqueue & Deterministic Dispatch Pass Module (Phase 2.2)
 *
 * Pure, deterministic, side-effect-free operations for inserting unassigned
 * `QUEUED` tasks into the global scheduler queue (`snapshot.scheduler`) and
 * dispatching queued entries to eligible, capable workers.
 *
 * Strict Enqueue Rejection Precedence:
 * 1. Invalid/missing task or snapshot data -> `'INVALID_TASK'`
 * 2. `task.assignedWorkerId !== null` -> `'PINNED_TASK_NOT_ALLOWED'`
 * 3. `task.status !== 'QUEUED' || task.lifecycleStatus !== 'QUEUED'` -> `'TASK_NOT_QUEUED'`
 * 4. Existing scheduler entry for `task.id` -> `'DUPLICATE_ENTRY'`
 * 5. Existing task-map ID (`enqueueTask` only) or worker active/legacy/completed tracking -> `'TASK_ALREADY_TRACKED'`
 * 6. Remaining `validateTaskEntity` failures -> `'INVALID_TASK'`
 *
 * Every rejection and global-pause skip returns the exact original `snapshot` reference untouched.
 */

const MAX_EVENT_LOG_LENGTH = 80;

export interface DispatchPassOptions {
  readonly capabilityRegistry?: Readonly<
    Record<PermanentWorkerId, WorkerCapabilityProfile>
  >;
  readonly costRates?: Readonly<Partial<Record<WorkerId, number>>>;
  readonly selectionWorkerOrder?: readonly WorkerId[];
}

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

function resolveSafePriorityForRecord(priority: unknown): TaskPriority {
  if (
    typeof priority === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(priority)
  ) {
    return priority as TaskPriority;
  }
  return 'LOW';
}

function evaluateTaskDispatchability(
  snapshot: SimulationSnapshot,
  entryTaskId: string,
  task: TaskEntity,
  capabilityRegistry?: Readonly<
    Record<PermanentWorkerId, WorkerCapabilityProfile>
  >,
): string | null {
  if (typeof task.id !== 'string' || task.id !== entryTaskId) {
    return `Task entity id "${String(task.id)}" does not match queue entry taskId "${entryTaskId}".`;
  }

  if (task.assignedWorkerId !== null) {
    return `Task "${entryTaskId}" is pinned to worker "${String(task.assignedWorkerId)}" (assignedWorkerId must be null for global dispatch).`;
  }

  if (task.status !== 'QUEUED' || task.lifecycleStatus !== 'QUEUED') {
    return `Task "${entryTaskId}" is not in QUEUED status (status="${String(task.status)}", lifecycleStatus="${String(task.lifecycleStatus)}").`;
  }

  if (
    hasDuplicateEntityUnderOtherKey(snapshot.tasks, entryTaskId) ||
    isTaskTrackedOnAnyWorker(snapshot, entryTaskId)
  ) {
    return `Task "${entryTaskId}" is already tracked in worker active, queued, or completed lists.`;
  }

  const otherTaskIds = Object.keys(snapshot.tasks).filter(
    (key) => key !== entryTaskId,
  );
  const validation = validateTaskEntity(task, {
    existingTaskIds: otherTaskIds,
    capabilityRegistry,
  });
  if (!validation.valid) {
    return validation.issues
      .map((issue) => `[${issue.code}] ${issue.message}`)
      .join('; ');
  }

  return null;
}

function classifyCapableWorkersBlockReason(
  capableStates: readonly WorkerDispatchState[],
): { readonly reason: DispatchBlockReason; readonly detail?: string } {
  const exclusionTypes = new Set<WorkerExclusion>();
  for (const state of capableStates) {
    if (state.exclusion !== null) {
      exclusionTypes.add(state.exclusion);
    }
  }

  if (exclusionTypes.size === 1) {
    const [soleExclusion] = exclusionTypes;
    if (soleExclusion === 'AT_CAPACITY') {
      return { reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY' };
    }
    if (soleExclusion === 'BLOCKED_STATE') {
      return { reason: 'ALL_CAPABLE_WORKERS_BLOCKED_STATE' };
    }
    if (soleExclusion === 'LEGACY_QUEUE_RESERVED') {
      return { reason: 'ALL_CAPABLE_WORKERS_RESERVED_BY_LEGACY_QUEUE' };
    }
  }

  const summary = capableStates
    .map((state) => `${state.workerId}:${state.exclusion ?? 'ELIGIBLE'}`)
    .join(', ');
  return {
    reason: 'CAPABLE_WORKERS_UNAVAILABLE_MIXED',
    detail: `Capable workers unavailable due to mixed exclusions (${summary}).`,
  };
}

function resolveInitialTaskStageStatus(task: TaskEntity): TaskStatus {
  if (Array.isArray(task.stagePipeline) && task.stagePipeline.length > 0) {
    for (const stage of task.stagePipeline) {
      if (0 >= stage.startPercent && 0 < stage.endPercent) {
        return stage.status;
      }
    }
    const lastStage = task.stagePipeline[task.stagePipeline.length - 1];
    if (lastStage) {
      return lastStage.status;
    }
  }
  return 'ANALYZING';
}

function deriveWorkerAnimationState(
  workerStatus: WorkerStatus,
  taskStatus: TaskStatus | null,
): AnimationClipKey {
  if (workerStatus === 'WALKING') return 'walking';
  if (workerStatus === 'PAUSED') return 'seated';
  if (workerStatus === 'TASK_RECEIVED' || workerStatus === 'COMPLETED') {
    return 'talking';
  }
  if (workerStatus === 'BUSY') {
    if (taskStatus === 'ROUTING' || taskStatus === 'VALIDATING') {
      return 'talking';
    }
    return 'typing';
  }
  return 'seated';
}

function resolveFiniteWorkerCostRate(
  costRates: Readonly<Partial<Record<WorkerId, number>>>,
  workerId: PermanentWorkerId,
  fallbackTaskRate: number,
): number {
  if (
    costRates &&
    typeof costRates === 'object' &&
    Object.prototype.hasOwnProperty.call(costRates, workerId)
  ) {
    const candidate = costRates[workerId];
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate >= 0
    ) {
      return candidate;
    }
  }

  const canonicalRate = COST_PER_1K_TOKENS_SIMULATED[workerId];
  if (
    typeof canonicalRate === 'number' &&
    Number.isFinite(canonicalRate) &&
    canonicalRate >= 0
  ) {
    return canonicalRate;
  }

  return typeof fallbackTaskRate === 'number' &&
    Number.isFinite(fallbackTaskRate) &&
    fallbackTaskRate >= 0
    ? fallbackTaskRate
    : 0.002;
}

function createDispatchStartedEvent(
  snapshot: SimulationSnapshot,
  worker: WorkerEntity,
  task: TaskEntity,
): ActivityEvent {
  const currentEvents = Array.isArray(snapshot.events) ? snapshot.events : [];
  let previousSeq = 0;
  const latestEvent = currentEvents[0];
  if (latestEvent && typeof latestEvent.id === 'string') {
    const lastUnderscoreIdx = latestEvent.id.lastIndexOf('_');
    if (lastUnderscoreIdx !== -1) {
      const parsed = Number.parseInt(
        latestEvent.id.slice(lastUnderscoreIdx + 1),
        10,
      );
      if (Number.isFinite(parsed) && parsed > 0) {
        previousSeq = parsed;
      }
    }
  }

  const tickCount =
    typeof snapshot.tickCount === 'number' &&
    Number.isFinite(snapshot.tickCount)
      ? snapshot.tickCount
      : 0;
  const eventIndex = Math.max(
    tickCount + currentEvents.length + 1,
    previousSeq + 1,
  );
  const normalizedSimTime = Number(snapshot.simTimeMs.toFixed(3));

  return {
    id: `evt_${normalizedSimTime}_${eventIndex}`,
    simTimestampMs: normalizedSimTime,
    workerId: worker.id,
    workerName: worker.name,
    department: worker.department,
    taskId: task.id,
    type: 'TASK_STARTED',
    message: `[SIMULATED] Dispatched "${task.title}" to ${worker.name} (${task.priority}, ${task.status})`,
    accentColor: worker.avatarConfig.accentColor,
    isSimulated: true,
  };
}

function appendCappedEvent(
  events: readonly ActivityEvent[],
  event: ActivityEvent,
): ActivityEvent[] {
  const safeEvents = Array.isArray(events) ? events : [];
  return [event, ...safeEvents].slice(0, MAX_EVENT_LOG_LENGTH);
}

/**
 * Executes a deterministic global dispatch pass across `snapshot.scheduler`.
 *
 * - Immediately short-circuits when `snapshot.isGlobalPaused === true`, returning the
 *   exact original `snapshot` reference without normalizing `scheduler`.
 * - Evaluates entries in `CRITICAL > HIGH > NORMAL > LOW`, FIFO `sequence`, and
 *   `originalIndex` order via `orderQueue()`.
 * - Evicts missing task entries into `dropped` (`MISSING_TASK_ENTITY`).
 * - Leaves non-dispatchable or worker-blocked entries untouched in `snapshot.tasks`
 *   and records structured diagnostics in `blocked`.
 * - Recomputes worker dispatch states against the updated `workingSnapshot` after each
 *   successful dispatch and chains deterministic `TASK_STARTED` events capped at 80.
 */
export function dispatchPass(
  snapshot: SimulationSnapshot,
  options?: DispatchPassOptions,
): DispatchPassResult<SimulationSnapshot> {
  // 1. Global pause must be checked FIRST before any normalization or cloning
  if (snapshot.isGlobalPaused === true) {
    return {
      snapshot,
      dispatched: [],
      blocked: [],
      dropped: [],
      skipped: 'GLOBALLY_PAUSED',
    };
  }

  const normalizedScheduler = normalizeSchedulerState(snapshot.scheduler);
  const schedulerWasNormalized = normalizedScheduler !== snapshot.scheduler;

  if (normalizedScheduler.entries.length === 0) {
    if (!schedulerWasNormalized) {
      return {
        snapshot,
        dispatched: [],
        blocked: [],
        dropped: [],
      };
    }

    return {
      snapshot: {
        ...snapshot,
        scheduler: normalizedScheduler,
      },
      dispatched: [],
      blocked: [],
      dropped: [],
    };
  }

  const orderedItems = orderQueue(normalizedScheduler.entries, snapshot.tasks);
  const effectiveCostRates = options?.costRates ?? COST_PER_1K_TOKENS_SIMULATED;

  let workingSnapshot: SimulationSnapshot = snapshot;
  const dispatched: DispatchedTaskRecord[] = [];
  const blocked: BlockedTaskRecord[] = [];
  const dropped: DroppedEntryRecord[] = [];
  const evictedTaskIds = new Set<string>();

  for (const item of orderedItems) {
    const { entry } = item;
    const hasTaskInMap =
      isPlainRecord(workingSnapshot.tasks) &&
      Object.prototype.hasOwnProperty.call(workingSnapshot.tasks, entry.taskId);
    const candidateTask = hasTaskInMap
      ? workingSnapshot.tasks[entry.taskId]
      : undefined;

    // 3. Missing task entity -> record in dropped and evict from queue
    if (!isPlainRecord(candidateTask)) {
      dropped.push({
        taskId: entry.taskId,
        sequence: entry.sequence,
        reason: 'MISSING_TASK_ENTITY',
      });
      evictedTaskIds.add(entry.taskId);
      continue;
    }

    const task = candidateTask as unknown as TaskEntity;

    // 4. Non-dispatchable task -> record TASK_NOT_DISPATCHABLE with detail; never modify task
    const nonDispatchableDetail = evaluateTaskDispatchability(
      workingSnapshot,
      entry.taskId,
      task,
      options?.capabilityRegistry,
    );
    if (nonDispatchableDetail !== null) {
      blocked.push({
        taskId: entry.taskId,
        priority: resolveSafePriorityForRecord(task.priority),
        sequence: entry.sequence,
        reason: 'TASK_NOT_DISPATCHABLE',
        detail: nonDispatchableDetail,
      });
      continue;
    }

    // 5. Worker matching & eligibility against latest workingSnapshot
    const dispatchStates = buildWorkerDispatchStates(
      workingSnapshot,
      options?.capabilityRegistry,
    );
    const capableIds = findCapableWorkerIds(
      task,
      workingSnapshot.workerOrder,
      options?.capabilityRegistry,
    );

    const capableStates: WorkerDispatchState[] = [];
    for (const workerId of capableIds) {
      if (Object.prototype.hasOwnProperty.call(dispatchStates, workerId)) {
        capableStates.push(dispatchStates[workerId]);
      }
    }

    if (capableStates.length === 0) {
      blocked.push({
        taskId: task.id,
        priority: task.priority,
        sequence: entry.sequence,
        reason: 'NO_CAPABLE_WORKER',
      });
      continue;
    }

    const selectionOrder =
      options?.selectionWorkerOrder ?? workingSnapshot.workerOrder;
    const selectedWorkerId = selectWorker(
      capableStates,
      effectiveCostRates,
      selectionOrder,
    );

    // 6. Block reason classification across capable workers only
    if (selectedWorkerId === null) {
      const classification = classifyCapableWorkersBlockReason(capableStates);
      blocked.push({
        taskId: task.id,
        priority: task.priority,
        sequence: entry.sequence,
        reason: classification.reason,
        ...(classification.detail !== undefined
          ? { detail: classification.detail }
          : {}),
      });
      continue;
    }

    if (!isPermanentWorkerId(selectedWorkerId)) {
      blocked.push({
        taskId: task.id,
        priority: task.priority,
        sequence: entry.sequence,
        reason: 'NO_CAPABLE_WORKER',
      });
      continue;
    }

    const selectedWorker = workingSnapshot.workers[selectedWorkerId];
    const selectedState = dispatchStates[selectedWorkerId];
    if (
      !selectedWorker ||
      !selectedState ||
      selectedState.activeCount >= selectedState.maxConcurrency
    ) {
      blocked.push({
        taskId: task.id,
        priority: task.priority,
        sequence: entry.sequence,
        reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY',
      });
      continue;
    }

    // 7. Dispatch success: QUEUED -> ASSIGNED -> RUNNING + immutable worker/event/queue update
    const loadRatioBeforeDispatch =
      selectedState.activeCount / selectedState.maxConcurrency;
    const costRateUsd = resolveFiniteWorkerCostRate(
      effectiveCostRates,
      selectedWorkerId,
      task.costPerThousandTokensUsd,
    );

    const taskPreparedForWorker: TaskEntity =
      task.costPerThousandTokensUsd === costRateUsd
        ? task
        : {
            ...task,
            costPerThousandTokensUsd: costRateUsd,
          };

    const initialStageStatus = resolveInitialTaskStageStatus(
      taskPreparedForWorker,
    );
    const activation = activateQueuedTaskForExecution(
      taskPreparedForWorker,
      initialStageStatus,
      {
        simTimeMs: workingSnapshot.simTimeMs,
        assignedWorkerId: selectedWorkerId,
      },
    );

    if (!activation.ok) {
      blocked.push({
        taskId: task.id,
        priority: task.priority,
        sequence: entry.sequence,
        reason: 'TASK_NOT_DISPATCHABLE',
        detail: activation.error.message,
      });
      continue;
    }

    const startedTask = activation.runningTask;
    const workerWithActivatedTask = withTaskActivated(
      selectedWorker,
      startedTask.id,
    );

    const startsFromRest =
      selectedWorker.status === 'IDLE' || selectedWorker.status === 'WAITING';
    const nextWorkerStatus: WorkerStatus = startsFromRest
      ? 'TASK_RECEIVED'
      : selectedWorker.status;
    const nextTransitionSimMs = startsFromRest
      ? 0
      : selectedWorker.transitionSimMs;

    const primaryTaskId = workerWithActivatedTask.currentTaskId;
    const primaryTaskStatus: TaskStatus | null =
      primaryTaskId === startedTask.id
        ? startedTask.status
        : primaryTaskId
          ? (workingSnapshot.tasks[primaryTaskId]?.status ?? startedTask.status)
          : startedTask.status;

    const updatedWorker: WorkerEntity = {
      ...workerWithActivatedTask,
      status: nextWorkerStatus,
      transitionSimMs: nextTransitionSimMs,
      animationState: deriveWorkerAnimationState(
        nextWorkerStatus,
        primaryTaskStatus,
      ),
      metrics: {
        ...selectedWorker.metrics,
        lastActivitySimMs: workingSnapshot.simTimeMs,
      },
    };

    const startedEvent = createDispatchStartedEvent(
      workingSnapshot,
      updatedWorker,
      startedTask,
    );
    const nextEvents = appendCappedEvent(workingSnapshot.events, startedEvent);

    evictedTaskIds.add(entry.taskId);
    const nextRemainingEntries = normalizedScheduler.entries.filter(
      (candidateEntry) => !evictedTaskIds.has(candidateEntry.taskId),
    );

    workingSnapshot = {
      ...workingSnapshot,
      tasks: {
        ...workingSnapshot.tasks,
        [startedTask.id]: startedTask,
      },
      workers: {
        ...workingSnapshot.workers,
        [selectedWorkerId]: updatedWorker,
      },
      events: nextEvents,
      scheduler: {
        entries: nextRemainingEntries,
        nextSequence: normalizedScheduler.nextSequence,
      },
    };

    dispatched.push({
      taskId: startedTask.id,
      taskTitle: startedTask.title,
      taskStatus: startedTask.status,
      workerId: selectedWorkerId,
      priority: startedTask.priority,
      sequence: entry.sequence,
      loadRatioBeforeDispatch,
      costRateUsd,
    });
  }

  if (evictedTaskIds.size === 0 && !schedulerWasNormalized) {
    return {
      snapshot,
      dispatched,
      blocked,
      dropped,
    };
  }

  const finalScheduler: SchedulerSnapshotState = {
    entries: normalizedScheduler.entries.filter(
      (candidateEntry) => !evictedTaskIds.has(candidateEntry.taskId),
    ),
    nextSequence: normalizedScheduler.nextSequence,
  };

  const finalSnapshot: SimulationSnapshot = {
    ...workingSnapshot,
    scheduler: finalScheduler,
  };

  return {
    snapshot: finalSnapshot,
    dispatched,
    blocked,
    dropped,
  };
}
