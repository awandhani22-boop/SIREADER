import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskEntity } from '../tasks/task.factory';
import type {
  PermanentWorkerId,
  TaskLifecycleStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
  WorkerCapabilityProfile,
} from '../tasks/task.types';
import {
  createCustomCapabilityRegistry,
  getAllWorkerCapabilityProfiles,
  mapTaskTypeToCategory,
} from '../workers/worker.capabilities';
import {
  assertWorkerConcurrencyInvariant,
  withTaskActivated,
} from '../workers/worker.concurrency';
import {
  COST_PER_1K_TOKENS_SIMULATED,
  createInitialWorkersRegistry,
  INITIAL_WORKER_ORDER,
} from '../workers/worker.registry';
import type {
  ActivityEvent,
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
  WorkerId,
} from '../workers/worker.types';
import { createInitialSchedulerState } from './scheduler.state';
import type {
  QueuedTaskEntry,
  SchedulerSnapshotState,
} from './scheduler.types';
import {
  dispatchPass,
  enqueueExistingTaskById,
  enqueueTask,
} from './task.dispatcher';

const SEED = 20261106;

function createCleanSnapshot(
  overrides?: Partial<SimulationSnapshot>,
): SimulationSnapshot {
  const initialEvent: ActivityEvent = {
    id: 'evt_1000_1',
    simTimestampMs: 1000,
    workerId: null,
    workerName: 'System',
    department: 'Command',
    taskId: null,
    type: 'SIMULATION_CONTROL',
    message: '[SIMULATED] Baseline initialized',
    accentColor: '#22d3ee',
    isSimulated: true,
  };

  return {
    seed: SEED,
    prngState: SEED,
    simTimeMs: 2500,
    tickCount: 5,
    isGlobalPaused: false,
    simSpeedMultiplier: 1,
    workers: createInitialWorkersRegistry(),
    workerOrder: [...INITIAL_WORKER_ORDER],
    tasks: {},
    events: [initialEvent],
    scheduler: createInitialSchedulerState(),
    ...overrides,
  };
}

function makeUnassignedQueuedTask(params?: {
  id?: string;
  sequenceNumber?: number;
  simTimeMs?: number;
  type?: TaskType;
  priority?: TaskPriority;
  title?: string;
}): TaskEntity {
  const sequenceNumber = params?.sequenceNumber ?? 101;
  const simTimeMs = params?.simTimeMs ?? 2500;
  const type: TaskType = params?.type ?? 'DATA_ANALYSIS';
  return createTaskEntity({
    id: params?.id ?? `tsk_pool_${sequenceNumber}_${simTimeMs}`,
    sequenceNumber,
    seed: SEED,
    simTimeMs,
    type,
    category: mapTaskTypeToCategory(type),
    title: params?.title ?? `Global Task #${sequenceNumber}`,
    description: `Deterministic global task #${sequenceNumber}`,
    priority: params?.priority ?? 'NORMAL',
    status: 'QUEUED',
    assignedWorkerId: null,
    fallbackWorkerId: 'supervisor',
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

test('1. New valid unassigned QUEUED task succeeds via enqueueTask', () => {
  const snapshot = createCleanSnapshot();
  const task = makeUnassignedQueuedTask({ id: 'tsk_new_1', sequenceNumber: 1 });

  const result = enqueueTask(snapshot, task);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.notStrictEqual(result.snapshot, snapshot);
  assert.equal(result.snapshot.tasks[task.id], task);
  assert.deepEqual(result.entry, {
    taskId: 'tsk_new_1',
    sequence: 1,
    enqueuedAtSimMs: 2500,
  });
  assert.deepEqual(result.snapshot.scheduler, {
    entries: [result.entry],
    nextSequence: 2,
  });
});

test('2. Existing valid unassigned QUEUED task succeeds through enqueueExistingTaskById', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_existing_1',
    sequenceNumber: 2,
  });
  const snapshot = createCleanSnapshot({
    tasks: { [task.id]: task },
  });

  const result = enqueueExistingTaskById(snapshot, task.id);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.notStrictEqual(result.snapshot, snapshot);
  assert.deepEqual(result.entry, {
    taskId: 'tsk_existing_1',
    sequence: 1,
    enqueuedAtSimMs: 2500,
  });
  assert.deepEqual(result.snapshot.scheduler, {
    entries: [result.entry],
    nextSequence: 2,
  });
});

test('3. Existing-task operation does not modify tasks map reference', () => {
  const taskA = makeUnassignedQueuedTask({ id: 'tsk_exist_a', sequenceNumber: 1 });
  const taskB = makeUnassignedQueuedTask({ id: 'tsk_exist_b', sequenceNumber: 2 });
  const tasksMap: Record<string, TaskEntity> = {
    [taskA.id]: taskA,
    [taskB.id]: taskB,
  };
  const snapshot = createCleanSnapshot({ tasks: tasksMap });

  const result = enqueueExistingTaskById(snapshot, taskA.id);

  assert.equal(result.ok, true);
  assert.strictEqual(result.snapshot.tasks, tasksMap);
  assert.strictEqual(result.snapshot.tasks[taskA.id], taskA);
  assert.strictEqual(result.snapshot.tasks[taskB.id], taskB);
});

test('4. New-task operation adds exactly one task entity and preserves task object reference', () => {
  const existingTask = makeUnassignedQueuedTask({
    id: 'tsk_already_stored',
    sequenceNumber: 1,
  });
  const newTask = makeUnassignedQueuedTask({
    id: 'tsk_brand_new',
    sequenceNumber: 2,
  });
  const snapshot = createCleanSnapshot({
    tasks: { [existingTask.id]: existingTask },
  });

  const result = enqueueTask(snapshot, newTask);

  assert.equal(result.ok, true);
  assert.notStrictEqual(result.snapshot.tasks, snapshot.tasks);
  assert.equal(Object.keys(snapshot.tasks).length, 1);
  assert.equal(Object.keys(result.snapshot.tasks).length, 2);
  assert.strictEqual(result.snapshot.tasks[existingTask.id], existingTask);
  assert.strictEqual(result.snapshot.tasks[newTask.id], newTask);
});

test('5. Entry uses normalized nextSequence and current snapshot.simTimeMs', () => {
  const snapshot = createCleanSnapshot({
    simTimeMs: 9750,
    scheduler: {
      entries: [
        { taskId: 'tsk_prior', sequence: 6, enqueuedAtSimMs: 4000 },
      ],
      nextSequence: 7,
    },
  });
  const task = makeUnassignedQueuedTask({
    id: 'tsk_seq_7',
    sequenceNumber: 7,
    simTimeMs: 9750,
  });

  const result = enqueueTask(snapshot, task);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.entry.sequence, 7);
  assert.equal(result.entry.enqueuedAtSimMs, 9750);
  assert.strictEqual(result.snapshot.scheduler?.entries[1], result.entry);
});

test('6. nextSequence increments by exactly one on both enqueue operations', () => {
  const task1 = makeUnassignedQueuedTask({ id: 'tsk_inc_1', sequenceNumber: 1 });
  const task2 = makeUnassignedQueuedTask({ id: 'tsk_inc_2', sequenceNumber: 2 });
  const snapshot = createCleanSnapshot({
    tasks: { [task2.id]: task2 },
    scheduler: { entries: [], nextSequence: 10 },
  });

  const res1 = enqueueTask(snapshot, task1);
  assert.equal(res1.ok, true);
  assert.equal(res1.snapshot.scheduler?.nextSequence, 11);

  const res2 = enqueueExistingTaskById(res1.snapshot, task2.id);
  assert.equal(res2.ok, true);
  assert.equal(res2.snapshot.scheduler?.nextSequence, 12);
});

test('7. Pinned task (assignedWorkerId !== null) is rejected with PINNED_TASK_NOT_ALLOWED', () => {
  const pinnedTask = createTaskEntity({
    id: 'tsk_pinned_sonnet',
    sequenceNumber: 10,
    seed: SEED,
    simTimeMs: 2500,
    type: 'DATA_ANALYSIS',
    title: 'Pinned Sonnet Task',
    status: 'QUEUED',
    assignedWorkerId: 'sonnet',
  });

  const baseSnapshot = createCleanSnapshot();
  const resNew = enqueueTask(baseSnapshot, pinnedTask);
  assert.equal(resNew.ok, false);
  if (!resNew.ok) {
    assert.equal(resNew.reason, 'PINNED_TASK_NOT_ALLOWED');
    assert.strictEqual(resNew.snapshot, baseSnapshot);
  }

  const snapshotWithPinned = createCleanSnapshot({
    tasks: { [pinnedTask.id]: pinnedTask },
  });
  const resExisting = enqueueExistingTaskById(snapshotWithPinned, pinnedTask.id);
  assert.equal(resExisting.ok, false);
  if (!resExisting.ok) {
    assert.equal(resExisting.reason, 'PINNED_TASK_NOT_ALLOWED');
    assert.strictEqual(resExisting.snapshot, snapshotWithPinned);
  }
});

test('8. Non-QUEUED task is rejected with TASK_NOT_QUEUED', () => {
  const baseTask = makeUnassignedQueuedTask({
    id: 'tsk_non_queued',
    sequenceNumber: 11,
  });

  const nonQueuedCases: ReadonlyArray<{
    status: TaskStatus;
    lifecycleStatus: TaskLifecycleStatus;
  }> = [
    { status: 'PENDING', lifecycleStatus: 'PENDING' },
    { status: 'ASSIGNED', lifecycleStatus: 'ASSIGNED' },
    { status: 'RUNNING', lifecycleStatus: 'RUNNING' },
    { status: 'ROUTING', lifecycleStatus: 'RUNNING' },
    { status: 'COMPLETED', lifecycleStatus: 'COMPLETED' },
    { status: 'FAILED', lifecycleStatus: 'FAILED' },
    { status: 'CANCELLED', lifecycleStatus: 'CANCELLED' },
    { status: 'QUEUED', lifecycleStatus: 'PENDING' },
    { status: 'PENDING', lifecycleStatus: 'QUEUED' },
  ];

  for (const variant of nonQueuedCases) {
    const candidate: TaskEntity = {
      ...baseTask,
      status: variant.status,
      lifecycleStatus: variant.lifecycleStatus,
    };

    const snapNew = createCleanSnapshot();
    const resNew = enqueueTask(snapNew, candidate);
    assert.equal(resNew.ok, false);
    if (!resNew.ok) {
      assert.equal(resNew.reason, 'TASK_NOT_QUEUED');
      assert.strictEqual(resNew.snapshot, snapNew);
    }

    const snapExisting = createCleanSnapshot({
      tasks: { [candidate.id]: candidate },
    });
    const resExisting = enqueueExistingTaskById(snapExisting, candidate.id);
    assert.equal(resExisting.ok, false);
    if (!resExisting.ok) {
      assert.equal(resExisting.reason, 'TASK_NOT_QUEUED');
      assert.strictEqual(resExisting.snapshot, snapExisting);
    }
  }
});

test('9. Invalid task rejected by validateTaskEntity with INVALID_TASK', () => {
  const validBase = makeUnassignedQueuedTask({
    id: 'tsk_invalid_candidate',
    sequenceNumber: 12,
  });

  const invalidVariants: TaskEntity[] = [
    { ...validBase, maxAttempts: 0 },
    { ...validBase, attemptCount: -1 },
    { ...validBase, attemptCount: 5, maxAttempts: 3 },
    { ...validBase, type: 'NON_EXISTENT_TYPE' as TaskType },
    { ...validBase, priority: 'SUPER_CRITICAL' as TaskPriority },
    { ...validBase, dependencyIds: [validBase.id] },
    { ...validBase, dependencyIds: ['tsk_dep_1', 'tsk_dep_1'] },
    { ...validBase, workerId: 'unknown_ghost_worker' as WorkerId },
    {
      ...validBase,
      input: {
        instruction: '   ',
        parameters: {},
        sourceChannel: 'manual_ui',
        contextTags: [],
      },
    },
    { ...validBase, createdAt: -10 },
    { ...validBase, createdAt: 3000, updatedAt: 2000 },
  ];

  for (const badTask of invalidVariants) {
    const snapNew = createCleanSnapshot();
    const resNew = enqueueTask(snapNew, badTask);
    assert.equal(resNew.ok, false);
    if (!resNew.ok) {
      assert.equal(resNew.reason, 'INVALID_TASK');
      assert.strictEqual(resNew.snapshot, snapNew);
    }

    const snapExisting = createCleanSnapshot({
      tasks: { [badTask.id]: badTask },
    });
    const resExisting = enqueueExistingTaskById(snapExisting, badTask.id);
    assert.equal(resExisting.ok, false);
    if (!resExisting.ok) {
      assert.equal(resExisting.reason, 'INVALID_TASK');
      assert.strictEqual(resExisting.snapshot, snapExisting);
    }
  }
});

test('10. Duplicate ID already in task map is rejected by enqueueTask with TASK_ALREADY_TRACKED', () => {
  const existingTask = makeUnassignedQueuedTask({
    id: 'tsk_dup_in_map',
    sequenceNumber: 13,
  });
  const duplicateNewTask = makeUnassignedQueuedTask({
    id: 'tsk_dup_in_map',
    sequenceNumber: 14,
    title: 'Conflicting Task With Same ID',
  });

  const snapshot = createCleanSnapshot({
    tasks: { [existingTask.id]: existingTask },
  });

  const result = enqueueTask(snapshot, duplicateNewTask);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(result.snapshot, snapshot);
  }
});

test('11. Duplicate scheduler entry is rejected with DUPLICATE_ENTRY', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_dup_sched',
    sequenceNumber: 15,
  });
  const existingEntry: QueuedTaskEntry = {
    taskId: task.id,
    sequence: 1,
    enqueuedAtSimMs: 1000,
  };

  const snapWithoutTaskInMap = createCleanSnapshot({
    scheduler: { entries: [existingEntry], nextSequence: 2 },
  });
  const resNew = enqueueTask(snapWithoutTaskInMap, task);
  assert.equal(resNew.ok, false);
  if (!resNew.ok) {
    assert.equal(resNew.reason, 'DUPLICATE_ENTRY');
    assert.strictEqual(resNew.snapshot, snapWithoutTaskInMap);
  }

  const snapWithTaskInMap = createCleanSnapshot({
    tasks: { [task.id]: task },
    scheduler: { entries: [existingEntry], nextSequence: 2 },
  });
  const resExisting = enqueueExistingTaskById(snapWithTaskInMap, task.id);
  assert.equal(resExisting.ok, false);
  if (!resExisting.ok) {
    assert.equal(resExisting.reason, 'DUPLICATE_ENTRY');
    assert.strictEqual(resExisting.snapshot, snapWithTaskInMap);
  }
});

test('12. ID tracked in activeTaskIds (and legacy currentTaskId fallback) is rejected with TASK_ALREADY_TRACKED', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_active_on_haiku',
    sequenceNumber: 16,
  });
  const baseWorkers = createInitialWorkersRegistry();
  const haikuActive = withTaskActivated(baseWorkers.haiku, task.id);

  const snapshotActive = createCleanSnapshot({
    tasks: { [task.id]: task },
    workers: {
      ...baseWorkers,
      haiku: haikuActive,
    },
  });

  const resExisting = enqueueExistingTaskById(snapshotActive, task.id);
  assert.equal(resExisting.ok, false);
  if (!resExisting.ok) {
    assert.equal(resExisting.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(resExisting.snapshot, snapshotActive);
  }

  // Also check legacy currentTaskId fallback when activeTaskIds is omitted
  const legacyOpus = {
    ...baseWorkers.opus,
    currentTaskId: task.id,
  } as Partial<WorkerEntity>;
  delete legacyOpus.activeTaskIds;

  const snapshotLegacyCurrent = createCleanSnapshot({
    workers: {
      ...baseWorkers,
      opus: legacyOpus as WorkerEntity,
    },
  });

  const resNewLegacy = enqueueTask(snapshotLegacyCurrent, task);
  assert.equal(resNewLegacy.ok, false);
  if (!resNewLegacy.ok) {
    assert.equal(resNewLegacy.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(resNewLegacy.snapshot, snapshotLegacyCurrent);
  }
});

test('13. ID tracked in legacy taskQueueIds is rejected with TASK_ALREADY_TRACKED', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_legacy_queued_sonnet',
    sequenceNumber: 17,
  });
  const baseWorkers = createInitialWorkersRegistry();
  const snapshot = createCleanSnapshot({
    tasks: { [task.id]: task },
    workers: {
      ...baseWorkers,
      sonnet: {
        ...baseWorkers.sonnet,
        taskQueueIds: [task.id],
      },
    },
  });

  const result = enqueueExistingTaskById(snapshot, task.id);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(result.snapshot, snapshot);
  }
});

test('14. ID in completedTaskIds is rejected with TASK_ALREADY_TRACKED', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_completed_archivist',
    sequenceNumber: 18,
  });
  const baseWorkers = createInitialWorkersRegistry();
  const snapshot = createCleanSnapshot({
    tasks: { [task.id]: task },
    workers: {
      ...baseWorkers,
      data_archivist: {
        ...baseWorkers.data_archivist,
        completedTaskIds: ['tsk_old_1', task.id],
      },
    },
  });

  const result = enqueueExistingTaskById(snapshot, task.id);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(result.snapshot, snapshot);
  }
});

test('15. Missing existing task returns INVALID_TASK and never creates a task', () => {
  const snapshot = createCleanSnapshot();

  for (const badId of [
    'tsk_does_not_exist',
    '',
    '   ',
    ' tsk_whitespace ',
    'toString',
  ]) {
    const result = enqueueExistingTaskById(snapshot, badId);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'INVALID_TASK');
      assert.strictEqual(result.snapshot, snapshot);
    }
  }
  assert.deepEqual(snapshot.tasks, {});
});

test('16. Malformed or missing scheduler is normalized safely on successful enqueue and untouched on rejection', () => {
  const validPriorEntry: QueuedTaskEntry = {
    taskId: 'tsk_valid_prior',
    sequence: 4,
    enqueuedAtSimMs: 500,
  };
  const malformedScheduler = {
    entries: [
      null,
      { taskId: '', sequence: 0, enqueuedAtSimMs: -5 },
      validPriorEntry,
      { taskId: 'tsk_valid_prior', sequence: 9, enqueuedAtSimMs: 900 },
    ],
    nextSequence: -42,
  } as unknown as SchedulerSnapshotState;

  const snapshotMalformed = createCleanSnapshot({
    simTimeMs: 3000,
    scheduler: malformedScheduler,
  });

  // Rejection must NOT normalize or replace snapshot / malformed scheduler
  const pinnedTask = createTaskEntity({
    id: 'tsk_pinned_reject',
    sequenceNumber: 19,
    seed: SEED,
    simTimeMs: 3000,
    type: 'DATA_ANALYSIS',
    title: 'Pinned Reject',
    status: 'QUEUED',
    assignedWorkerId: 'sonnet',
  });
  const rejected = enqueueTask(snapshotMalformed, pinnedTask);
  assert.equal(rejected.ok, false);
  assert.strictEqual(rejected.snapshot, snapshotMalformed);
  assert.strictEqual(rejected.snapshot.scheduler, malformedScheduler);

  // Successful enqueue installs normalized scheduler state safely
  const validTask = makeUnassignedQueuedTask({
    id: 'tsk_after_normalize',
    sequenceNumber: 20,
    simTimeMs: 3000,
  });
  const accepted = enqueueTask(snapshotMalformed, validTask);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.deepEqual(accepted.entry, {
      taskId: 'tsk_after_normalize',
      sequence: 5,
      enqueuedAtSimMs: 3000,
    });
    assert.deepEqual(accepted.snapshot.scheduler, {
      entries: [validPriorEntry, accepted.entry],
      nextSequence: 6,
    });
    assert.strictEqual(accepted.snapshot.scheduler?.entries[0], validPriorEntry);
  }

  // Also verify completely omitted snapshot.scheduler (`undefined`)
  const snapshotMissingScheduler = createCleanSnapshot();
  delete snapshotMissingScheduler.scheduler;
  const acceptedFromMissing = enqueueTask(snapshotMissingScheduler, validTask);
  assert.equal(acceptedFromMissing.ok, true);
  if (acceptedFromMissing.ok) {
    assert.deepEqual(acceptedFromMissing.snapshot.scheduler, {
      entries: [
        {
          taskId: validTask.id,
          sequence: 1,
          enqueuedAtSimMs: snapshotMissingScheduler.simTimeMs,
        },
      ],
      nextSequence: 2,
    });
  }
});

test('17. Malformed worker queue and tracking arrays do not throw', () => {
  const baseWorkers = createInitialWorkersRegistry();
  const malformedWorkers = {
    ...baseWorkers,
    haiku: {
      ...baseWorkers.haiku,
      activeTaskIds: null as unknown as string[],
      taskQueueIds: 'not-an-array' as unknown as string[],
      completedTaskIds: 12345 as unknown as string[],
    },
    sonnet: {
      ...baseWorkers.sonnet,
      activeTaskIds: [null, 42, 'tsk_other'] as unknown as string[],
      taskQueueIds: [undefined, {}] as unknown as string[],
      completedTaskIds: [false] as unknown as string[],
    },
    opus: null as unknown as WorkerEntity,
  };

  const taskNew = makeUnassignedQueuedTask({
    id: 'tsk_safe_malformed_workers',
    sequenceNumber: 21,
  });
  const taskExisting = makeUnassignedQueuedTask({
    id: 'tsk_safe_existing_workers',
    sequenceNumber: 22,
  });

  const snapshot = createCleanSnapshot({
    workers: malformedWorkers,
    tasks: { [taskExisting.id]: taskExisting },
  });

  assert.doesNotThrow(() => {
    const res1 = enqueueTask(snapshot, taskNew);
    assert.equal(res1.ok, true);

    const res2 = enqueueExistingTaskById(snapshot, taskExisting.id);
    assert.equal(res2.ok, true);
  });
});

test('18. Duplicate rejection returns the exact original snapshot reference', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_dup_ref_check',
    sequenceNumber: 23,
  });
  const snapshot = createCleanSnapshot({
    tasks: { [task.id]: task },
    scheduler: {
      entries: [{ taskId: task.id, sequence: 1, enqueuedAtSimMs: 1500 }],
      nextSequence: 2,
    },
  });

  const resNew = enqueueTask(snapshot, task);
  assert.equal(resNew.ok, false);
  if (!resNew.ok) {
    assert.equal(resNew.reason, 'DUPLICATE_ENTRY');
    assert.strictEqual(resNew.snapshot, snapshot);
  }

  const resExisting = enqueueExistingTaskById(snapshot, task.id);
  assert.equal(resExisting.ok, false);
  if (!resExisting.ok) {
    assert.equal(resExisting.reason, 'DUPLICATE_ENTRY');
    assert.strictEqual(resExisting.snapshot, snapshot);
  }
});

test('19. Every other rejection reason returns the exact original snapshot reference', () => {
  const baseTask = makeUnassignedQueuedTask({
    id: 'tsk_ref_guard',
    sequenceNumber: 24,
  });

  // INVALID_TASK (null/malformed task & validateTaskEntity failure)
  const snapInvalid = createCleanSnapshot();
  const resNullTask = enqueueTask(
    snapInvalid,
    null as unknown as TaskEntity,
  );
  assert.equal(resNullTask.ok, false);
  assert.strictEqual(resNullTask.snapshot, snapInvalid);

  const resBadEntity = enqueueTask(snapInvalid, {
    ...baseTask,
    maxAttempts: 0,
  });
  assert.equal(resBadEntity.ok, false);
  if (!resBadEntity.ok) {
    assert.equal(resBadEntity.reason, 'INVALID_TASK');
    assert.strictEqual(resBadEntity.snapshot, snapInvalid);
  }

  // PINNED_TASK_NOT_ALLOWED
  const pinned: TaskEntity = {
    ...baseTask,
    workerId: 'sonnet',
    assignedWorkerId: 'sonnet',
  };
  const resPinned = enqueueTask(snapInvalid, pinned);
  assert.equal(resPinned.ok, false);
  if (!resPinned.ok) {
    assert.equal(resPinned.reason, 'PINNED_TASK_NOT_ALLOWED');
    assert.strictEqual(resPinned.snapshot, snapInvalid);
  }

  // TASK_NOT_QUEUED
  const pending: TaskEntity = {
    ...baseTask,
    status: 'PENDING',
    lifecycleStatus: 'PENDING',
    queuedAt: null,
  };
  const resNotQueued = enqueueTask(snapInvalid, pending);
  assert.equal(resNotQueued.ok, false);
  if (!resNotQueued.ok) {
    assert.equal(resNotQueued.reason, 'TASK_NOT_QUEUED');
    assert.strictEqual(resNotQueued.snapshot, snapInvalid);
  }

  // TASK_ALREADY_TRACKED
  const snapTracked = createCleanSnapshot({
    tasks: { [baseTask.id]: baseTask },
  });
  const resTracked = enqueueTask(snapTracked, baseTask);
  assert.equal(resTracked.ok, false);
  if (!resTracked.ok) {
    assert.equal(resTracked.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(resTracked.snapshot, snapTracked);
  }
});

test('20. Deep-frozen snapshot and task inputs are never mutated', () => {
  const existingTask = deepFreeze(
    makeUnassignedQueuedTask({ id: 'tsk_frozen_existing', sequenceNumber: 25 }),
  );
  const newTask = deepFreeze(
    makeUnassignedQueuedTask({ id: 'tsk_frozen_new', sequenceNumber: 26 }),
  );
  const frozenSnapshot = deepFreeze(
    createCleanSnapshot({
      tasks: { [existingTask.id]: existingTask },
    }),
  );

  const res1 = enqueueTask(frozenSnapshot, newTask);
  assert.equal(res1.ok, true);

  const res2 = enqueueExistingTaskById(frozenSnapshot, existingTask.id);
  assert.equal(res2.ok, true);

  // Rejections on frozen inputs also never mutate
  const resReject1 = enqueueTask(frozenSnapshot, existingTask);
  assert.equal(resReject1.ok, false);
  assert.strictEqual(resReject1.snapshot, frozenSnapshot);

  const resReject2 = enqueueExistingTaskById(frozenSnapshot, 'tsk_missing');
  assert.equal(resReject2.ok, false);
  assert.strictEqual(resReject2.snapshot, frozenSnapshot);
});

test('21. No event is emitted on either enqueueTask or enqueueExistingTaskById', () => {
  const existingTask = makeUnassignedQueuedTask({
    id: 'tsk_no_event_existing',
    sequenceNumber: 27,
  });
  const newTask = makeUnassignedQueuedTask({
    id: 'tsk_no_event_new',
    sequenceNumber: 28,
  });
  const snapshot = createCleanSnapshot({
    tasks: { [existingTask.id]: existingTask },
  });
  const initialEventsCount = snapshot.events.length;

  const res1 = enqueueTask(snapshot, newTask);
  assert.equal(res1.ok, true);
  assert.equal(res1.snapshot.events.length, initialEventsCount);
  assert.strictEqual(res1.snapshot.events, snapshot.events);

  const res2 = enqueueExistingTaskById(res1.snapshot, existingTask.id);
  assert.equal(res2.ok, true);
  assert.equal(res2.snapshot.events.length, initialEventsCount);
  assert.strictEqual(res2.snapshot.events, snapshot.events);
});

test('22. Worker, workerOrder, events, and unrelated task references remain unchanged after success', () => {
  const unrelatedTask = makeUnassignedQueuedTask({
    id: 'tsk_unrelated',
    sequenceNumber: 29,
  });
  const newTask = makeUnassignedQueuedTask({
    id: 'tsk_isolated_new',
    sequenceNumber: 30,
  });
  const snapshot = createCleanSnapshot({
    tasks: { [unrelatedTask.id]: unrelatedTask },
  });

  const resNew = enqueueTask(snapshot, newTask);
  assert.equal(resNew.ok, true);
  assert.notStrictEqual(resNew.snapshot, snapshot);
  assert.notStrictEqual(resNew.snapshot.scheduler, snapshot.scheduler);
  assert.notStrictEqual(resNew.snapshot.tasks, snapshot.tasks);
  assert.strictEqual(resNew.snapshot.workers, snapshot.workers);
  assert.strictEqual(resNew.snapshot.workerOrder, snapshot.workerOrder);
  assert.strictEqual(resNew.snapshot.events, snapshot.events);
  assert.strictEqual(resNew.snapshot.tasks[unrelatedTask.id], unrelatedTask);
  assert.strictEqual(resNew.snapshot.tasks[newTask.id], newTask);

  const resExisting = enqueueExistingTaskById(resNew.snapshot, unrelatedTask.id);
  assert.equal(resExisting.ok, true);
  assert.notStrictEqual(resExisting.snapshot, resNew.snapshot);
  assert.notStrictEqual(
    resExisting.snapshot.scheduler,
    resNew.snapshot.scheduler,
  );
  assert.strictEqual(resExisting.snapshot.tasks, resNew.snapshot.tasks);
  assert.strictEqual(resExisting.snapshot.workers, snapshot.workers);
  assert.strictEqual(resExisting.snapshot.workerOrder, snapshot.workerOrder);
  assert.strictEqual(resExisting.snapshot.events, snapshot.events);
});

test('23. Two consecutive successful enqueues produce FIFO sequences 1 and 2', () => {
  const snapshot0 = createCleanSnapshot({ simTimeMs: 1000 });
  const task1 = makeUnassignedQueuedTask({
    id: 'tsk_fifo_1',
    sequenceNumber: 31,
    simTimeMs: 1000,
    priority: 'LOW',
  });
  const task2 = makeUnassignedQueuedTask({
    id: 'tsk_fifo_2',
    sequenceNumber: 32,
    simTimeMs: 1500,
    priority: 'CRITICAL',
  });

  const res1 = enqueueTask(snapshot0, task1);
  assert.equal(res1.ok, true);
  if (!res1.ok) return;

  const snapshot1At1500: SimulationSnapshot = {
    ...res1.snapshot,
    simTimeMs: 1500,
  };
  const res2 = enqueueTask(snapshot1At1500, task2);
  assert.equal(res2.ok, true);
  if (!res2.ok) return;

  assert.equal(res1.entry.sequence, 1);
  assert.equal(res2.entry.sequence, 2);
  assert.deepEqual(res2.snapshot.scheduler, {
    entries: [
      { taskId: 'tsk_fifo_1', sequence: 1, enqueuedAtSimMs: 1000 },
      { taskId: 'tsk_fifo_2', sequence: 2, enqueuedAtSimMs: 1500 },
    ],
    nextSequence: 3,
  });
});

test('24. Enqueue while globally paused is allowed and remains queued without dispatching', () => {
  const pausedSnapshot = createCleanSnapshot({
    isGlobalPaused: true,
    simTimeMs: 4000,
  });
  const task = makeUnassignedQueuedTask({
    id: 'tsk_while_paused',
    sequenceNumber: 33,
    simTimeMs: 4000,
  });

  const result = enqueueTask(pausedSnapshot, task);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.snapshot.isGlobalPaused, true);
  assert.equal(result.snapshot.tasks[task.id].status, 'QUEUED');
  assert.equal(result.snapshot.tasks[task.id].lifecycleStatus, 'QUEUED');
  assert.equal(result.snapshot.tasks[task.id].assignedWorkerId, null);
  assert.equal(result.snapshot.scheduler?.entries.length, 1);
  assert.equal(result.snapshot.scheduler?.entries[0].taskId, task.id);
  assert.strictEqual(result.snapshot.workers, pausedSnapshot.workers);
});

test('25. Existing queue entries remain preserved in order and reference', () => {
  const existingEntry1: QueuedTaskEntry = {
    taskId: 'tsk_prev_1',
    sequence: 1,
    enqueuedAtSimMs: 500,
  };
  const existingEntry2: QueuedTaskEntry = {
    taskId: 'tsk_prev_2',
    sequence: 2,
    enqueuedAtSimMs: 1000,
  };
  const snapshot = createCleanSnapshot({
    simTimeMs: 2500,
    scheduler: {
      entries: [existingEntry1, existingEntry2],
      nextSequence: 3,
    },
  });

  const newTask = makeUnassignedQueuedTask({
    id: 'tsk_third_in_line',
    sequenceNumber: 34,
    simTimeMs: 2500,
  });

  const result = enqueueTask(snapshot, newTask);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.snapshot.scheduler?.entries.length, 3);
  assert.strictEqual(result.snapshot.scheduler?.entries[0], existingEntry1);
  assert.strictEqual(result.snapshot.scheduler?.entries[1], existingEntry2);
  assert.strictEqual(result.snapshot.scheduler?.entries[2], result.entry);
  assert.equal(result.snapshot.scheduler?.nextSequence, 4);
});

test('26. Duplicate ID in scheduler and task map (and multi-rule conflicts) follows documented rejection precedence', () => {
  const conflictId = 'tsk_multi_conflict';
  const baseTask = makeUnassignedQueuedTask({
    id: conflictId,
    sequenceNumber: 35,
  });
  const baseWorkers = createInitialWorkersRegistry();

  // Snapshot where conflictId is ALREADY in scheduler.entries AND snapshot.tasks AND worker tracking
  const heavilyTrackedSnapshot = createCleanSnapshot({
    tasks: { [conflictId]: baseTask },
    scheduler: {
      entries: [{ taskId: conflictId, sequence: 1, enqueuedAtSimMs: 1000 }],
      nextSequence: 2,
    },
    workers: {
      ...baseWorkers,
      haiku: {
        ...baseWorkers.haiku,
        completedTaskIds: [conflictId],
      },
    },
  });

  // Precedence 1 > 2/3/4/5/6: Missing/empty ID beats PINNED_TASK_NOT_ALLOWED & others
  const missingIdAndPinned: TaskEntity = {
    ...baseTask,
    id: '   ',
    assignedWorkerId: 'sonnet',
    status: 'PENDING',
    lifecycleStatus: 'PENDING',
  };
  const res1 = enqueueTask(heavilyTrackedSnapshot, missingIdAndPinned);
  assert.equal(res1.ok, false);
  if (!res1.ok) assert.equal(res1.reason, 'INVALID_TASK');

  // Precedence 2 > 3/4/5/6: assignedWorkerId !== null beats TASK_NOT_QUEUED, DUPLICATE_ENTRY, TASK_ALREADY_TRACKED
  const pinnedAndNotQueuedAndDup: TaskEntity = {
    ...baseTask,
    assignedWorkerId: 'sonnet',
    status: 'PENDING',
    lifecycleStatus: 'PENDING',
    maxAttempts: 0,
  };
  const res2 = enqueueTask(heavilyTrackedSnapshot, pinnedAndNotQueuedAndDup);
  assert.equal(res2.ok, false);
  if (!res2.ok) assert.equal(res2.reason, 'PINNED_TASK_NOT_ALLOWED');

  // Precedence 3 > 4/5/6: non-QUEUED beats DUPLICATE_ENTRY, TASK_ALREADY_TRACKED, INVALID_TASK
  const notQueuedAndDupAndInvalid: TaskEntity = {
    ...baseTask,
    assignedWorkerId: null,
    status: 'RUNNING',
    lifecycleStatus: 'RUNNING',
    maxAttempts: 0,
  };
  const res3 = enqueueTask(heavilyTrackedSnapshot, notQueuedAndDupAndInvalid);
  assert.equal(res3.ok, false);
  if (!res3.ok) assert.equal(res3.reason, 'TASK_NOT_QUEUED');

  // Precedence 4 > 5/6: DUPLICATE_ENTRY in scheduler beats TASK_ALREADY_TRACKED in task map & validateTaskEntity failure
  const dupInSchedulerAndTaskMap: TaskEntity = {
    ...baseTask,
    assignedWorkerId: null,
    status: 'QUEUED',
    lifecycleStatus: 'QUEUED',
    maxAttempts: 0,
  };
  const res4 = enqueueTask(heavilyTrackedSnapshot, dupInSchedulerAndTaskMap);
  assert.equal(res4.ok, false);
  if (!res4.ok) assert.equal(res4.reason, 'DUPLICATE_ENTRY');

  // Precedence 5 > 6: TASK_ALREADY_TRACKED in task map beats validateTaskEntity failure when not in scheduler
  const snapshotOnlyTaskMap = createCleanSnapshot({
    tasks: { [conflictId]: baseTask },
  });
  const res5 = enqueueTask(snapshotOnlyTaskMap, dupInSchedulerAndTaskMap);
  assert.equal(res5.ok, false);
  if (!res5.ok) assert.equal(res5.reason, 'TASK_ALREADY_TRACKED');
});

test('27. New task cannot be enqueued if its ID appears in any worker legacy queue or completed list', () => {
  const legacyQueuedTask = makeUnassignedQueuedTask({
    id: 'tsk_new_in_legacy_queue',
    sequenceNumber: 36,
  });
  const completedListTask = makeUnassignedQueuedTask({
    id: 'tsk_new_in_completed_list',
    sequenceNumber: 37,
  });

  const baseWorkers = createInitialWorkersRegistry();
  const snapshot = createCleanSnapshot({
    workers: {
      ...baseWorkers,
      market_monitor: {
        ...baseWorkers.market_monitor,
        taskQueueIds: [legacyQueuedTask.id],
      },
      decision_engineer: {
        ...baseWorkers.decision_engineer,
        completedTaskIds: [completedListTask.id],
      },
    },
  });

  const resLegacy = enqueueTask(snapshot, legacyQueuedTask);
  assert.equal(resLegacy.ok, false);
  if (!resLegacy.ok) {
    assert.equal(resLegacy.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(resLegacy.snapshot, snapshot);
  }

  const resCompleted = enqueueTask(snapshot, completedListTask);
  assert.equal(resCompleted.ok, false);
  if (!resCompleted.ok) {
    assert.equal(resCompleted.reason, 'TASK_ALREADY_TRACKED');
    assert.strictEqual(resCompleted.snapshot, snapshot);
  }
});

test('28. Existing task cannot be enqueued twice via enqueueExistingTaskById', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_enqueue_once_only',
    sequenceNumber: 38,
  });
  const snapshot0 = createCleanSnapshot({
    tasks: { [task.id]: task },
  });

  const firstAttempt = enqueueExistingTaskById(snapshot0, task.id);
  assert.equal(firstAttempt.ok, true);
  if (!firstAttempt.ok) return;

  const secondAttempt = enqueueExistingTaskById(firstAttempt.snapshot, task.id);
  assert.equal(secondAttempt.ok, false);
  if (!secondAttempt.ok) {
    assert.equal(secondAttempt.reason, 'DUPLICATE_ENTRY');
    assert.strictEqual(secondAttempt.snapshot, firstAttempt.snapshot);
  }
  assert.equal(firstAttempt.snapshot.scheduler?.entries.length, 1);
  assert.equal(firstAttempt.snapshot.scheduler?.nextSequence, 2);
});

// ============================================================================
// Commit 5 — Deterministic Global Dispatch Pass (`dispatchPass`) Tests
// ============================================================================

function enqueueMany(
  initialSnapshot: SimulationSnapshot,
  tasks: readonly TaskEntity[],
): SimulationSnapshot {
  let current = initialSnapshot;
  for (const task of tasks) {
    const res = enqueueTask(current, task);
    assert.equal(res.ok, true, `Expected enqueueTask to succeed for ${task.id}`);
    current = res.snapshot;
  }
  return current;
}

function buildSharedTwoSlotRegistry(): Readonly<
  Record<PermanentWorkerId, WorkerCapabilityProfile>
> {
  const baseProfiles = getAllWorkerCapabilityProfiles();
  const haikuProfile = baseProfiles.find((p) => p.workerId === 'haiku')!;
  const summarizationCap = haikuProfile.capabilities.find(
    (c) => c.capabilityId === 'summarization',
  )!;
  const map = {} as Record<PermanentWorkerId, WorkerCapabilityProfile>;
  for (const profile of baseProfiles) {
    if (profile.workerId === 'supervisor') {
      map.supervisor = {
        ...profile,
        maxConcurrency: 2,
        capabilities: [...profile.capabilities, summarizationCap],
        supportedTaskTypes: [...profile.supportedTaskTypes, 'SUMMARIZATION'],
      };
    } else {
      map[profile.workerId] = profile;
    }
  }
  return map;
}

test('DP-1. Global pause returns exact snapshot reference with empty results and skipped GLOBALLY_PAUSED', () => {
  const queuedTask = makeUnassignedQueuedTask({
    id: 'tsk_dp_paused_1',
    sequenceNumber: 101,
    type: 'DATA_ANALYSIS',
  });
  let snapshot = createCleanSnapshot({ isGlobalPaused: true });
  const enq = enqueueTask(snapshot, queuedTask);
  assert.equal(enq.ok, true);
  snapshot = enq.snapshot;

  const result = dispatchPass(snapshot);

  assert.strictEqual(result.snapshot, snapshot);
  assert.equal(result.skipped, 'GLOBALLY_PAUSED');
  assert.deepEqual(result.dispatched, []);
  assert.deepEqual(result.blocked, []);
  assert.deepEqual(result.dropped, []);
});

test('DP-2. Global pause does not normalize a malformed scheduler', () => {
  const malformedScheduler = {
    entries: 'corrupt-entries',
    nextSequence: -999,
  } as unknown as SchedulerSnapshotState;

  const snapshot = createCleanSnapshot({
    isGlobalPaused: true,
    scheduler: malformedScheduler,
  });

  const result = dispatchPass(snapshot);

  assert.strictEqual(result.snapshot, snapshot);
  assert.strictEqual(result.snapshot.scheduler, malformedScheduler);
  assert.equal(result.skipped, 'GLOBALLY_PAUSED');
});

test('DP-3. Queue entries are processed strictly by priority (CRITICAL > HIGH > NORMAL > LOW)', () => {
  // sonnet supports DATA_ANALYSIS with maxConcurrency = 1; queue 4 tasks in reverse priority order
  const lowTask = makeUnassignedQueuedTask({
    id: 'tsk_prio_low',
    sequenceNumber: 102,
    type: 'DATA_ANALYSIS',
    priority: 'LOW',
  });
  const normalTask = makeUnassignedQueuedTask({
    id: 'tsk_prio_normal',
    sequenceNumber: 103,
    type: 'DATA_ANALYSIS',
    priority: 'NORMAL',
  });
  const highTask = makeUnassignedQueuedTask({
    id: 'tsk_prio_high',
    sequenceNumber: 104,
    type: 'DATA_ANALYSIS',
    priority: 'HIGH',
  });
  const criticalTask = makeUnassignedQueuedTask({
    id: 'tsk_prio_critical',
    sequenceNumber: 105,
    type: 'DATA_ANALYSIS',
    priority: 'CRITICAL',
  });

  const snapshot = enqueueMany(createCleanSnapshot(), [
    lowTask,
    normalTask,
    highTask,
    criticalTask,
  ]);

  const result = dispatchPass(snapshot);

  assert.equal(result.dispatched.length, 1);
  assert.equal(result.dispatched[0].taskId, 'tsk_prio_critical');
  assert.equal(result.dispatched[0].priority, 'CRITICAL');
  assert.equal(result.dispatched[0].workerId, 'sonnet');

  // Remaining 3 were evaluated in HIGH -> NORMAL -> LOW order and blocked by sonnet AT_CAPACITY
  assert.deepEqual(
    result.blocked.map((b) => b.taskId),
    ['tsk_prio_high', 'tsk_prio_normal', 'tsk_prio_low'],
  );
});

test('DP-4. FIFO ordering by sequence within equal priority (and originalIndex tie-break)', () => {
  // haiku supports SUMMARIZATION with maxConcurrency = 2
  const firstSeq = makeUnassignedQueuedTask({
    id: 'tsk_fifo_seq_2',
    sequenceNumber: 106,
    type: 'SUMMARIZATION',
    priority: 'HIGH',
  });
  const secondSeq = makeUnassignedQueuedTask({
    id: 'tsk_fifo_seq_5',
    sequenceNumber: 107,
    type: 'SUMMARIZATION',
    priority: 'HIGH',
  });
  const thirdSeq = makeUnassignedQueuedTask({
    id: 'tsk_fifo_seq_9',
    sequenceNumber: 108,
    type: 'SUMMARIZATION',
    priority: 'HIGH',
  });

  // Intentionally place entries out of sequence order and with misleading enqueuedAtSimMs
  const snapshot = createCleanSnapshot({
    tasks: {
      [firstSeq.id]: firstSeq,
      [secondSeq.id]: secondSeq,
      [thirdSeq.id]: thirdSeq,
    },
    scheduler: {
      entries: [
        { taskId: thirdSeq.id, sequence: 9, enqueuedAtSimMs: 100 },
        { taskId: firstSeq.id, sequence: 2, enqueuedAtSimMs: 9000 },
        { taskId: secondSeq.id, sequence: 5, enqueuedAtSimMs: 5000 },
      ],
      nextSequence: 10,
    },
  });

  const result = dispatchPass(snapshot);

  assert.deepEqual(
    result.dispatched.map((d) => d.taskId),
    ['tsk_fifo_seq_2', 'tsk_fifo_seq_5'],
  );
  assert.deepEqual(
    result.blocked.map((b) => b.taskId),
    ['tsk_fifo_seq_9'],
  );

  // Also verify duplicate sequence tie-breaks by originalIndex ascending
  const dupA = makeUnassignedQueuedTask({
    id: 'tsk_dup_idx_0',
    sequenceNumber: 109,
    type: 'DATA_ANALYSIS',
    priority: 'NORMAL',
  });
  const dupB = makeUnassignedQueuedTask({
    id: 'tsk_dup_idx_1',
    sequenceNumber: 110,
    type: 'DATA_ANALYSIS',
    priority: 'NORMAL',
  });
  const snapDupSeq = createCleanSnapshot({
    tasks: { [dupA.id]: dupA, [dupB.id]: dupB },
    scheduler: {
      entries: [
        { taskId: dupA.id, sequence: 4, enqueuedAtSimMs: 1000 },
        { taskId: dupB.id, sequence: 4, enqueuedAtSimMs: 500 },
      ],
      nextSequence: 5,
    },
  });
  const resDupSeq = dispatchPass(snapDupSeq);
  assert.equal(resDupSeq.dispatched.length, 1);
  assert.equal(resDupSeq.dispatched[0].taskId, 'tsk_dup_idx_0');
});

test('DP-5. Missing task entity is recorded in dropped with MISSING_TASK_ENTITY and creates no replacement task', () => {
  const snapshot = createCleanSnapshot({
    scheduler: {
      entries: [
        { taskId: 'tsk_ghost_404', sequence: 3, enqueuedAtSimMs: 1500 },
      ],
      nextSequence: 4,
    },
  });

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.deepEqual(result.blocked, []);
  assert.deepEqual(result.dropped, [
    {
      taskId: 'tsk_ghost_404',
      sequence: 3,
      reason: 'MISSING_TASK_ENTITY',
    },
  ]);
  assert.deepEqual(result.snapshot.tasks, {});
  assert.strictEqual(result.snapshot.events, snapshot.events);
});

test('DP-6. Missing task entry is removed from final global queue while preserving nextSequence', () => {
  const blockedTask = makeUnassignedQueuedTask({
    id: 'tsk_blocked_survivor',
    sequenceNumber: 111,
    type: 'DATA_ANALYSIS',
  });
  const baseWorkers = createInitialWorkersRegistry();
  const survivorEntry: QueuedTaskEntry = {
    taskId: blockedTask.id,
    sequence: 2,
    enqueuedAtSimMs: 1500,
  };

  const snapshot = createCleanSnapshot({
    tasks: { [blockedTask.id]: blockedTask },
    workers: {
      ...baseWorkers,
      sonnet: { ...baseWorkers.sonnet, status: 'PAUSED' },
    },
    scheduler: {
      entries: [
        { taskId: 'tsk_missing_1', sequence: 1, enqueuedAtSimMs: 1000 },
        survivorEntry,
      ],
      nextSequence: 7,
    },
  });

  const result = dispatchPass(snapshot);

  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].taskId, 'tsk_missing_1');
  assert.deepEqual(result.snapshot.scheduler, {
    entries: [survivorEntry],
    nextSequence: 7,
  });
  assert.strictEqual(result.snapshot.scheduler?.entries[0], survivorEntry);
});

test('DP-7. Non-QUEUED task in queue is not dispatched, gets TASK_NOT_DISPATCHABLE with detail, and stays unmodified', () => {
  const baseTask = makeUnassignedQueuedTask({
    id: 'tsk_already_running',
    sequenceNumber: 112,
    type: 'DATA_ANALYSIS',
  });
  const nonQueuedTask: TaskEntity = {
    ...baseTask,
    status: 'PENDING',
    lifecycleStatus: 'PENDING',
    queuedAt: null,
  };

  const snapshot = createCleanSnapshot({
    tasks: { [nonQueuedTask.id]: nonQueuedTask },
    scheduler: {
      entries: [{ taskId: nonQueuedTask.id, sequence: 1, enqueuedAtSimMs: 1000 }],
      nextSequence: 2,
    },
  });

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.deepEqual(result.dropped, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].taskId, nonQueuedTask.id);
  assert.equal(result.blocked[0].reason, 'TASK_NOT_DISPATCHABLE');
  assert.ok(
    typeof result.blocked[0].detail === 'string' &&
      result.blocked[0].detail.length > 0,
  );
  assert.strictEqual(result.snapshot.tasks[nonQueuedTask.id], nonQueuedTask);
});

test('DP-8. Pinned task in queue is not dispatched, gets TASK_NOT_DISPATCHABLE with detail, and stays unmodified', () => {
  const pinnedTask = createTaskEntity({
    id: 'tsk_pinned_in_global_queue',
    sequenceNumber: 113,
    seed: SEED,
    simTimeMs: 2500,
    type: 'DATA_ANALYSIS',
    title: 'Pinned Task',
    status: 'QUEUED',
    assignedWorkerId: 'sonnet',
  });

  const snapshot = createCleanSnapshot({
    tasks: { [pinnedTask.id]: pinnedTask },
    scheduler: {
      entries: [{ taskId: pinnedTask.id, sequence: 1, enqueuedAtSimMs: 2500 }],
      nextSequence: 2,
    },
  });

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.deepEqual(result.dropped, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].taskId, pinnedTask.id);
  assert.equal(result.blocked[0].reason, 'TASK_NOT_DISPATCHABLE');
  assert.ok(
    typeof result.blocked[0].detail === 'string' &&
      result.blocked[0].detail.includes('sonnet'),
  );
  assert.strictEqual(result.snapshot.tasks[pinnedTask.id], pinnedTask);
});

test('DP-9. Task without any capable worker receives NO_CAPABLE_WORKER', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_no_capable',
    sequenceNumber: 114,
    type: 'DATA_ARCHIVING',
  });
  const snapshot = enqueueMany(createCleanSnapshot(), [task]);

  // Disable data_archivist capability in custom registry
  const disabledRegistry = createCustomCapabilityRegistry({
    disabledCapabilityIds: ['data_archiving'],
  });

  const result = dispatchPass(snapshot, {
    capabilityRegistry: disabledRegistry,
  });

  assert.deepEqual(result.dispatched, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].reason, 'NO_CAPABLE_WORKER');

  // Also verify NO_CAPABLE_WORKER when the sole capable worker is absent from workerOrder
  const snapshotWithoutArchivistOrder = {
    ...snapshot,
    workerOrder: INITIAL_WORKER_ORDER.filter((id) => id !== 'data_archivist'),
  };
  const resultMissingFromOrder = dispatchPass(snapshotWithoutArchivistOrder);
  assert.equal(resultMissingFromOrder.blocked.length, 1);
  assert.equal(resultMissingFromOrder.blocked[0].reason, 'NO_CAPABLE_WORKER');
});

test('DP-10. All capable workers at capacity produces ALL_CAPABLE_WORKERS_AT_CAPACITY', () => {
  const activeTask = createTaskEntity({
    id: 'tsk_sonnet_busy_1',
    sequenceNumber: 115,
    seed: SEED,
    simTimeMs: 1000,
    type: 'DATA_ANALYSIS',
    title: 'Active Sonnet Task',
    status: 'ANALYZING',
    assignedWorkerId: 'sonnet',
  });
  const waitingGlobalTask = makeUnassignedQueuedTask({
    id: 'tsk_waiting_capacity',
    sequenceNumber: 116,
    type: 'DATA_ANALYSIS',
  });

  const baseWorkers = createInitialWorkersRegistry();
  const busySonnet: WorkerEntity = {
    ...withTaskActivated(baseWorkers.sonnet, activeTask.id),
    status: 'BUSY',
  };

  let snapshot = createCleanSnapshot({
    tasks: { [activeTask.id]: activeTask },
    workers: { ...baseWorkers, sonnet: busySonnet },
  });
  snapshot = enqueueMany(snapshot, [waitingGlobalTask]);

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].reason, 'ALL_CAPABLE_WORKERS_AT_CAPACITY');
});

test('DP-11. All capable workers in PAUSED, COMPLETED, or ERROR produces ALL_CAPABLE_WORKERS_BLOCKED_STATE', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_blocked_state',
    sequenceNumber: 117,
    type: 'DECISION_EVALUATION',
  });
  const baseWorkers = createInitialWorkersRegistry();

  // DECISION_EVALUATION is supported by opus and decision_engineer; set one PAUSED and one ERROR
  let snapshot = createCleanSnapshot({
    workers: {
      ...baseWorkers,
      opus: { ...baseWorkers.opus, status: 'PAUSED' },
      decision_engineer: { ...baseWorkers.decision_engineer, status: 'ERROR' },
    },
  });
  snapshot = enqueueMany(snapshot, [task]);

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].reason, 'ALL_CAPABLE_WORKERS_BLOCKED_STATE');
});

test('DP-12. All capable workers with pending legacy taskQueueIds produces ALL_CAPABLE_WORKERS_RESERVED_BY_LEGACY_QUEUE', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_legacy_reserved',
    sequenceNumber: 118,
    type: 'SUMMARIZATION',
  });
  const baseWorkers = createInitialWorkersRegistry();

  let snapshot = createCleanSnapshot({
    workers: {
      ...baseWorkers,
      haiku: {
        ...baseWorkers.haiku,
        status: 'IDLE',
        taskQueueIds: ['tsk_legacy_haiku_waiting'],
      },
    },
  });
  snapshot = enqueueMany(snapshot, [task]);

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(
    result.blocked[0].reason,
    'ALL_CAPABLE_WORKERS_RESERVED_BY_LEGACY_QUEUE',
  );
});

test('DP-13. Mixed exclusions across capable workers produces CAPABLE_WORKERS_UNAVAILABLE_MIXED', () => {
  const activeTask = createTaskEntity({
    id: 'tsk_de_active',
    sequenceNumber: 119,
    seed: SEED,
    simTimeMs: 1000,
    type: 'DECISION_EVALUATION',
    title: 'Decision Engineer Active',
    status: 'ANALYZING',
    assignedWorkerId: 'decision_engineer',
  });
  const globalTask = makeUnassignedQueuedTask({
    id: 'tsk_mixed_exclusion',
    sequenceNumber: 120,
    type: 'DECISION_EVALUATION',
  });

  const baseWorkers = createInitialWorkersRegistry();
  // opus -> PAUSED (BLOCKED_STATE); decision_engineer -> AT_CAPACITY
  let snapshot = createCleanSnapshot({
    tasks: { [activeTask.id]: activeTask },
    workers: {
      ...baseWorkers,
      opus: { ...baseWorkers.opus, status: 'PAUSED' },
      decision_engineer: {
        ...withTaskActivated(baseWorkers.decision_engineer, activeTask.id),
        status: 'BUSY',
      },
    },
  });
  snapshot = enqueueMany(snapshot, [globalTask]);

  const result = dispatchPass(snapshot);

  assert.deepEqual(result.dispatched, []);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].reason, 'CAPABLE_WORKERS_UNAVAILABLE_MIXED');
  assert.ok(typeof result.blocked[0].detail === 'string');
});

test('DP-14. Non-capable workers do not influence exclusion classification', () => {
  // Task requires DATA_ARCHIVING (supported ONLY by data_archivist)
  // data_archivist is AT_CAPACITY, while non-capable workers are PAUSED, ERROR, and LEGACY_QUEUE_RESERVED
  const activeArchiveTask = createTaskEntity({
    id: 'tsk_archivist_busy',
    sequenceNumber: 121,
    seed: SEED,
    simTimeMs: 1000,
    type: 'DATA_ARCHIVING',
    title: 'Active Archive Task',
    status: 'ARCHIVING',
    assignedWorkerId: 'data_archivist',
  });
  const globalArchiveTask = makeUnassignedQueuedTask({
    id: 'tsk_archivist_waiting',
    sequenceNumber: 122,
    type: 'DATA_ARCHIVING',
  });

  const baseWorkers = createInitialWorkersRegistry();
  let snapshot = createCleanSnapshot({
    tasks: { [activeArchiveTask.id]: activeArchiveTask },
    workers: {
      ...baseWorkers,
      supervisor: { ...baseWorkers.supervisor, status: 'PAUSED' },
      haiku: { ...baseWorkers.haiku, taskQueueIds: ['tsk_legacy_1'] },
      opus: { ...baseWorkers.opus, status: 'ERROR' },
      data_archivist: {
        ...withTaskActivated(
          baseWorkers.data_archivist,
          activeArchiveTask.id,
        ),
        status: 'BUSY',
      },
    },
  });
  snapshot = enqueueMany(snapshot, [globalArchiveTask]);

  const result = dispatchPass(snapshot);

  assert.equal(result.blocked.length, 1);
  assert.equal(
    result.blocked[0].reason,
    'ALL_CAPABLE_WORKERS_AT_CAPACITY',
    'Non-capable PAUSED/ERROR/LEGACY workers must not turn AT_CAPACITY into MIXED',
  );
});

test('DP-15. Worker with lowest load ratio is selected even if more expensive and later in workerOrder', () => {
  const sharedRegistry = buildSharedTwoSlotRegistry();
  // haiku (maxConcurrency=2, cost=0.001) has 1 active task -> load 1/2 = 0.5
  // supervisor (maxConcurrency=2, cost=0.003) has 0 active tasks -> load 0/2 = 0.0
  const haikuActiveTask = createTaskEntity({
    id: 'tsk_haiku_busy_slot_1',
    sequenceNumber: 123,
    seed: SEED,
    simTimeMs: 1000,
    type: 'SUMMARIZATION',
    title: 'Haiku Slot 1',
    status: 'EXTRACTING',
    assignedWorkerId: 'haiku',
  });
  const globalTask = makeUnassignedQueuedTask({
    id: 'tsk_pick_lowest_load',
    sequenceNumber: 124,
    type: 'SUMMARIZATION',
  });

  const baseWorkers = createInitialWorkersRegistry();
  let snapshot = createCleanSnapshot({
    workerOrder: [
      'haiku',
      'supervisor',
      'sonnet',
      'opus',
      'decision_engineer',
      'market_monitor',
      'data_archivist',
    ],
    tasks: { [haikuActiveTask.id]: haikuActiveTask },
    workers: {
      ...baseWorkers,
      haiku: {
        ...withTaskActivated(baseWorkers.haiku, haikuActiveTask.id),
        status: 'BUSY',
      },
    },
  });
  snapshot = enqueueMany(snapshot, [globalTask]);

  const result = dispatchPass(snapshot, {
    capabilityRegistry: sharedRegistry,
  });

  assert.equal(result.dispatched.length, 1);
  assert.equal(result.dispatched[0].workerId, 'supervisor');
  assert.equal(result.dispatched[0].loadRatioBeforeDispatch, 0);
});

test('DP-16. Equal load ratio ties break by lowest simulated cost rate', () => {
  // DECISION_EVALUATION is supported by opus (0.015) and decision_engineer (0.002)
  const task = makeUnassignedQueuedTask({
    id: 'tsk_tie_cost',
    sequenceNumber: 125,
    type: 'DECISION_EVALUATION',
  });
  // Place opus BEFORE decision_engineer in workerOrder; cheaper decision_engineer must still win
  const snapshot = enqueueMany(
    createCleanSnapshot({
      workerOrder: [...INITIAL_WORKER_ORDER],
    }),
    [task],
  );

  const resDefaultCosts = dispatchPass(snapshot);
  assert.equal(resDefaultCosts.dispatched.length, 1);
  assert.equal(resDefaultCosts.dispatched[0].workerId, 'decision_engineer');
  assert.equal(
    resDefaultCosts.dispatched[0].costRateUsd,
    COST_PER_1K_TOKENS_SIMULATED.decision_engineer,
  );

  // Flip custom costRates so opus is cheaper -> opus must win
  const resFlippedCosts = dispatchPass(snapshot, {
    costRates: { opus: 0.0005, decision_engineer: 0.02 },
  });
  assert.equal(resFlippedCosts.dispatched.length, 1);
  assert.equal(resFlippedCosts.dispatched[0].workerId, 'opus');
  assert.equal(resFlippedCosts.dispatched[0].costRateUsd, 0.0005);
});

test('DP-17. Equal load ratio and equal cost rate ties break by workerOrder', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_tie_order',
    sequenceNumber: 126,
    type: 'DECISION_EVALUATION',
  });
  const equalCosts = { opus: 0.002, decision_engineer: 0.002 };

  const snapOpusFirst = enqueueMany(
    createCleanSnapshot({
      workerOrder: [
        'opus',
        'decision_engineer',
        'supervisor',
        'haiku',
        'sonnet',
        'market_monitor',
        'data_archivist',
      ],
    }),
    [task],
  );
  const resOpusFirst = dispatchPass(snapOpusFirst, { costRates: equalCosts });
  assert.equal(resOpusFirst.dispatched[0].workerId, 'opus');

  const snapDeFirst = enqueueMany(
    createCleanSnapshot({
      workerOrder: [
        'decision_engineer',
        'opus',
        'supervisor',
        'haiku',
        'sonnet',
        'market_monitor',
        'data_archivist',
      ],
    }),
    [task],
  );
  const resDeFirst = dispatchPass(snapDeFirst, { costRates: equalCosts });
  assert.equal(resDeFirst.dispatched[0].workerId, 'decision_engineer');
});

test('DP-18. Equal load ratio, equal cost rate, and absent selectionWorkerOrder ties break by string comparison', () => {
  const task = makeUnassignedQueuedTask({
    id: 'tsk_tie_string',
    sequenceNumber: 127,
    type: 'DECISION_EVALUATION',
  });

  // Put 'opus' first in snapshot.workerOrder so candidate discovery lists 'opus' before 'decision_engineer',
  // then pass empty selectionWorkerOrder [] so tie-break #4 ('decision_engineer' < 'opus') decides
  const snapshot = enqueueMany(
    createCleanSnapshot({
      workerOrder: ['opus', 'decision_engineer'],
    }),
    [task],
  );

  const result = dispatchPass(snapshot, {
    costRates: { opus: 0.002, decision_engineer: 0.002 },
    selectionWorkerOrder: [],
  });

  assert.equal(result.dispatched.length, 1);
  assert.equal(result.dispatched[0].workerId, 'decision_engineer');
});

test('DP-19. Multi-dispatch never exceeds worker maxConcurrency', () => {
  // haiku has maxConcurrency = 2; enqueue 4 SUMMARIZATION tasks
  const tasks = [1, 2, 3, 4].map((n) =>
    makeUnassignedQueuedTask({
      id: `tsk_haiku_cap_${n}`,
      sequenceNumber: 130 + n,
      type: 'SUMMARIZATION',
    }),
  );
  const snapshot = enqueueMany(createCleanSnapshot(), tasks);

  const result = dispatchPass(snapshot);

  assert.equal(result.dispatched.length, 2);
  assert.deepEqual(
    result.dispatched.map((d) => d.taskId),
    ['tsk_haiku_cap_1', 'tsk_haiku_cap_2'],
  );
  assert.equal(result.dispatched[0].loadRatioBeforeDispatch, 0);
  assert.equal(result.dispatched[1].loadRatioBeforeDispatch, 0.5);

  assert.equal(result.blocked.length, 2);
  assert.deepEqual(
    result.blocked.map((b) => ({ id: b.taskId, reason: b.reason })),
    [
      { id: 'tsk_haiku_cap_3', reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY' },
      { id: 'tsk_haiku_cap_4', reason: 'ALL_CAPABLE_WORKERS_AT_CAPACITY' },
    ],
  );

  assertWorkerConcurrencyInvariant(result.snapshot.workers.haiku, 2);
});

test('DP-20. Multi-dispatch recomputes load and balances dispatches across workers after each step', () => {
  const sharedRegistry = buildSharedTwoSlotRegistry();
  // haiku (max=2, cost=0.001) and supervisor (max=2, cost=0.003) both support SUMMARIZATION
  const tasks = [1, 2, 3, 4, 5].map((n) =>
    makeUnassignedQueuedTask({
      id: `tsk_balance_${n}`,
      sequenceNumber: 140 + n,
      type: 'SUMMARIZATION',
    }),
  );
  const snapshot = enqueueMany(createCleanSnapshot(), tasks);

  const result = dispatchPass(snapshot, {
    capabilityRegistry: sharedRegistry,
  });

  // Expected sequence:
  // 1 -> haiku (0/2 == 0/2, cheaper 0.001 < 0.003)
  // 2 -> supervisor (0/2 < 1/2)
  // 3 -> haiku (1/2 == 1/2, cheaper 0.001 < 0.003)
  // 4 -> supervisor (1/2 < 2/2)
  // 5 -> blocked (both at 2/2)
  assert.deepEqual(
    result.dispatched.map((d) => ({
      taskId: d.taskId,
      workerId: d.workerId,
      loadBefore: d.loadRatioBeforeDispatch,
    })),
    [
      { taskId: 'tsk_balance_1', workerId: 'haiku', loadBefore: 0 },
      { taskId: 'tsk_balance_2', workerId: 'supervisor', loadBefore: 0 },
      { taskId: 'tsk_balance_3', workerId: 'haiku', loadBefore: 0.5 },
      { taskId: 'tsk_balance_4', workerId: 'supervisor', loadBefore: 0.5 },
    ],
  );
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].taskId, 'tsk_balance_5');
  assert.equal(result.blocked[0].reason, 'ALL_CAPABLE_WORKERS_AT_CAPACITY');
});

test('DP-21. activeTaskIds, currentTaskId, and worker status remain consistent for IDLE and already-BUSY workers', () => {
  // Case A: IDLE haiku receives 2 tasks -> status transitions to TASK_RECEIVED, currentTaskId === first task
  const t1 = makeUnassignedQueuedTask({
    id: 'tsk_cons_1',
    sequenceNumber: 151,
    type: 'SUMMARIZATION',
  });
  const t2 = makeUnassignedQueuedTask({
    id: 'tsk_cons_2',
    sequenceNumber: 152,
    type: 'SUMMARIZATION',
  });
  const snapIdle = enqueueMany(createCleanSnapshot(), [t1, t2]);
  const resIdle = dispatchPass(snapIdle);

  const haikuAfterIdle = resIdle.snapshot.workers.haiku;
  assert.equal(haikuAfterIdle.status, 'TASK_RECEIVED');
  assert.deepEqual(haikuAfterIdle.activeTaskIds, ['tsk_cons_1', 'tsk_cons_2']);
  assert.equal(haikuAfterIdle.currentTaskId, 'tsk_cons_1');
  assertWorkerConcurrencyInvariant(haikuAfterIdle, 2);

  // Case B: Already-BUSY haiku with 1 active task receives a 2nd concurrent task -> stays BUSY & keeps primary currentTaskId
  const existingRunning = createTaskEntity({
    id: 'tsk_haiku_primary',
    sequenceNumber: 153,
    seed: SEED,
    simTimeMs: 1000,
    type: 'SUMMARIZATION',
    title: 'Primary Running Task',
    status: 'EXTRACTING',
    assignedWorkerId: 'haiku',
  });
  const secondaryQueued = makeUnassignedQueuedTask({
    id: 'tsk_haiku_secondary',
    sequenceNumber: 154,
    type: 'SUMMARIZATION',
  });
  const baseWorkers = createInitialWorkersRegistry();
  let snapBusy = createCleanSnapshot({
    tasks: { [existingRunning.id]: existingRunning },
    workers: {
      ...baseWorkers,
      haiku: {
        ...withTaskActivated(baseWorkers.haiku, existingRunning.id),
        status: 'BUSY',
        animationState: 'typing',
      },
    },
  });
  snapBusy = enqueueMany(snapBusy, [secondaryQueued]);

  const resBusy = dispatchPass(snapBusy);
  const haikuAfterBusy = resBusy.snapshot.workers.haiku;
  assert.equal(haikuAfterBusy.status, 'BUSY');
  assert.deepEqual(haikuAfterBusy.activeTaskIds, [
    'tsk_haiku_primary',
    'tsk_haiku_secondary',
  ]);
  assert.equal(haikuAfterBusy.currentTaskId, 'tsk_haiku_primary');
  assertWorkerConcurrencyInvariant(haikuAfterBusy, 2);
});

test('DP-22. Dispatched task transitions cleanly through QUEUED -> ASSIGNED -> RUNNING with accurate metadata', () => {
  const queuedTask = makeUnassignedQueuedTask({
    id: 'tsk_lifecycle_check',
    sequenceNumber: 155,
    simTimeMs: 1000,
    type: 'DATA_ARCHIVING',
    priority: 'HIGH',
  });
  let snapshot = createCleanSnapshot({ simTimeMs: 1000 });
  snapshot = enqueueMany(snapshot, [queuedTask]);
  const snapshotAtDispatch: SimulationSnapshot = {
    ...snapshot,
    simTimeMs: 4500,
  };

  const result = dispatchPass(snapshotAtDispatch);

  assert.equal(result.dispatched.length, 1);
  const activated = result.snapshot.tasks[queuedTask.id];
  assert.equal(activated.lifecycleStatus, 'RUNNING');
  assert.equal(activated.status, 'VALIDATING'); // initial stage of ARCHIVAL pipeline
  assert.equal(activated.assignedWorkerId, 'data_archivist');
  assert.equal(activated.workerId, 'data_archivist');
  assert.equal(activated.attemptCount, 1);
  assert.equal(activated.createdAt, 1000);
  assert.equal(activated.queuedAt, 1000);
  assert.equal(activated.startedAt, 4500);
  assert.equal(activated.startedAtSimMs, 4500);
  assert.equal(activated.updatedAt, 4500);
  assert.equal(
    activated.costPerThousandTokensUsd,
    COST_PER_1K_TOKENS_SIMULATED.data_archivist,
  );
});

test('DP-23. Blocked task remains in global queue and dispatches on subsequent pass once worker frees up', () => {
  const t1 = makeUnassignedQueuedTask({
    id: 'tsk_sonnet_first',
    sequenceNumber: 156,
    type: 'DATA_ANALYSIS',
  });
  const t2 = makeUnassignedQueuedTask({
    id: 'tsk_sonnet_second',
    sequenceNumber: 157,
    type: 'DATA_ANALYSIS',
  });

  const snapshot = enqueueMany(createCleanSnapshot(), [t1, t2]);
  const pass1 = dispatchPass(snapshot);

  assert.equal(pass1.dispatched.length, 1);
  assert.equal(pass1.dispatched[0].taskId, 'tsk_sonnet_first');
  assert.equal(pass1.blocked.length, 1);
  assert.equal(pass1.blocked[0].taskId, 'tsk_sonnet_second');
  assert.deepEqual(
    pass1.snapshot.scheduler?.entries.map((e) => e.taskId),
    ['tsk_sonnet_second'],
  );

  // Free sonnet on a later snapshot and verify t2 now dispatches cleanly
  const freedSnapshot: SimulationSnapshot = {
    ...pass1.snapshot,
    simTimeMs: 6000,
    workers: {
      ...pass1.snapshot.workers,
      sonnet: {
        ...pass1.snapshot.workers.sonnet,
        status: 'IDLE',
        transitionSimMs: 0,
        activeTaskIds: [],
        currentTaskId: null,
      },
    },
  };
  const pass2 = dispatchPass(freedSnapshot);
  assert.equal(pass2.dispatched.length, 1);
  assert.equal(pass2.dispatched[0].taskId, 'tsk_sonnet_second');
  assert.deepEqual(pass2.snapshot.scheduler?.entries, []);
});

test('DP-24. Blocked task does not modify task entity reference or properties', () => {
  const blockedTask = makeUnassignedQueuedTask({
    id: 'tsk_untouched_when_blocked',
    sequenceNumber: 158,
    type: 'DATA_ANALYSIS',
  });
  const baseWorkers = createInitialWorkersRegistry();
  let snapshot = createCleanSnapshot({
    workers: {
      ...baseWorkers,
      sonnet: { ...baseWorkers.sonnet, status: 'PAUSED' },
    },
  });
  snapshot = enqueueMany(snapshot, [blockedTask]);

  const result = dispatchPass(snapshot);

  assert.equal(result.blocked.length, 1);
  assert.strictEqual(result.snapshot.tasks[blockedTask.id], blockedTask);
  assert.equal(result.snapshot.tasks[blockedTask.id].status, 'QUEUED');
  assert.equal(result.snapshot.tasks[blockedTask.id].assignedWorkerId, null);
});

test('DP-25. Event IDs are strictly unique across multiple dispatches in the same pass and zero events emit on block/drop', () => {
  const tasks = [
    makeUnassignedQueuedTask({
      id: 'tsk_evt_1',
      sequenceNumber: 161,
      type: 'SUMMARIZATION',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_evt_2',
      sequenceNumber: 162,
      type: 'SUMMARIZATION',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_evt_3',
      sequenceNumber: 163,
      type: 'DATA_ANALYSIS',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_evt_blocked',
      sequenceNumber: 164,
      type: 'DATA_ANALYSIS',
    }),
  ];

  let snapshot = enqueueMany(createCleanSnapshot(), tasks);
  // Also inject a missing-task entry so dropped > 0 in the same pass
  snapshot = {
    ...snapshot,
    scheduler: {
      entries: [
        ...(snapshot.scheduler?.entries ?? []),
        { taskId: 'tsk_evt_ghost', sequence: 99, enqueuedAtSimMs: 2500 },
      ],
      nextSequence: 100,
    },
  };

  const initialEventCount = snapshot.events.length;
  const result = dispatchPass(snapshot);

  assert.equal(result.dispatched.length, 3);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.dropped.length, 1);
  // Exactly 3 new TASK_STARTED events added (none for blocked or dropped)
  assert.equal(result.snapshot.events.length, initialEventCount + 3);

  const allIds = result.snapshot.events.map((e) => e.id);
  const uniqueIds = new Set(allIds);
  assert.equal(uniqueIds.size, allIds.length);

  for (let i = 0; i < 3; i++) {
    assert.equal(result.snapshot.events[i].type, 'TASK_STARTED');
    assert.equal(result.snapshot.events[i].isSimulated, true);
  }
});

test('DP-26. Event cap 80 is strictly respected with unique monotonic event IDs at capacity', () => {
  const prefilledEvents: ActivityEvent[] = [];
  for (let i = 80; i >= 1; i--) {
    prefilledEvents.push({
      id: `evt_2000_${100 + i}`,
      simTimestampMs: 2000,
      workerId: null,
      workerName: 'System',
      department: 'Command',
      taskId: null,
      type: 'SIMULATION_CONTROL',
      message: `[SIMULATED] Historical event #${i}`,
      accentColor: '#22d3ee',
      isSimulated: true,
    });
  }
  assert.equal(prefilledEvents.length, 80);
  assert.equal(prefilledEvents[0].id, 'evt_2000_180');

  const tasks = [
    makeUnassignedQueuedTask({
      id: 'tsk_cap80_1',
      sequenceNumber: 171,
      type: 'SUMMARIZATION',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_cap80_2',
      sequenceNumber: 172,
      type: 'DATA_ANALYSIS',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_cap80_3',
      sequenceNumber: 173,
      type: 'DATA_ARCHIVING',
    }),
  ];

  const snapshot = enqueueMany(
    createCleanSnapshot({ events: prefilledEvents, simTimeMs: 3000 }),
    tasks,
  );
  const result = dispatchPass(snapshot);

  assert.equal(result.dispatched.length, 3);
  assert.equal(result.snapshot.events.length, 80);
  assert.deepEqual(
    result.snapshot.events.slice(0, 3).map((e) => e.id),
    ['evt_3000_183', 'evt_3000_182', 'evt_3000_181'],
  );
  assert.equal(
    new Set(result.snapshot.events.map((e) => e.id)).size,
    80,
  );
});

test('DP-27. Deep-frozen input snapshot is never mutated across dispatch, block, drop, and pause passes', () => {
  const dispatchableTask = makeUnassignedQueuedTask({
    id: 'tsk_freeze_disp',
    sequenceNumber: 175,
    type: 'DATA_ANALYSIS',
  });
  const blockedTask = makeUnassignedQueuedTask({
    id: 'tsk_freeze_blk',
    sequenceNumber: 176,
    type: 'DATA_ANALYSIS',
  });

  let snapshot = enqueueMany(createCleanSnapshot(), [
    dispatchableTask,
    blockedTask,
  ]);
  snapshot = {
    ...snapshot,
    scheduler: {
      entries: [
        ...(snapshot.scheduler?.entries ?? []),
        { taskId: 'tsk_freeze_missing', sequence: 50, enqueuedAtSimMs: 2500 },
      ],
      nextSequence: 51,
    },
  };

  const frozenSnapshot = deepFreeze(snapshot);
  const resActive = dispatchPass(frozenSnapshot);
  assert.equal(resActive.dispatched.length, 1);
  assert.equal(resActive.blocked.length, 1);
  assert.equal(resActive.dropped.length, 1);

  const frozenPaused = deepFreeze({
    ...createCleanSnapshot(),
    isGlobalPaused: true,
  });
  const resPaused = dispatchPass(frozenPaused);
  assert.strictEqual(resPaused.snapshot, frozenPaused);
});

test('DP-28. Unchanged workers, unchanged tasks, and workerOrder preserve exact object references', () => {
  const unrelatedStoredTask = makeUnassignedQueuedTask({
    id: 'tsk_unrelated_stored',
    sequenceNumber: 177,
    type: 'COMPLEX_REASONING',
  });
  const dispatchedTask = makeUnassignedQueuedTask({
    id: 'tsk_only_sonnet',
    sequenceNumber: 178,
    type: 'DATA_ANALYSIS',
  });

  let snapshot = createCleanSnapshot({
    tasks: { [unrelatedStoredTask.id]: unrelatedStoredTask },
  });
  snapshot = enqueueMany(snapshot, [dispatchedTask]);

  const result = dispatchPass(snapshot);

  assert.equal(result.dispatched.length, 1);
  assert.equal(result.dispatched[0].workerId, 'sonnet');
  assert.strictEqual(result.snapshot.workerOrder, snapshot.workerOrder);
  assert.strictEqual(
    result.snapshot.tasks[unrelatedStoredTask.id],
    unrelatedStoredTask,
  );
  assert.notStrictEqual(
    result.snapshot.workers.sonnet,
    snapshot.workers.sonnet,
  );

  for (const wid of INITIAL_WORKER_ORDER) {
    if (wid !== 'sonnet') {
      assert.strictEqual(
        result.snapshot.workers[wid],
        snapshot.workers[wid],
        `Unchanged worker "${wid}" reference must be preserved`,
      );
    }
  }
});

test('DP-29. Final scheduler preserves unprocessed/blocked entry references and relative order', () => {
  // sonnet is PAUSED so DATA_ANALYSIS tasks stay blocked; haiku is IDLE so SUMMARIZATION dispatches
  const blockedLowFirst = makeUnassignedQueuedTask({
    id: 'tsk_keep_order_low_1',
    sequenceNumber: 181,
    type: 'DATA_ANALYSIS',
    priority: 'LOW',
  });
  const dispatchedHighMiddle = makeUnassignedQueuedTask({
    id: 'tsk_dispatch_middle',
    sequenceNumber: 182,
    type: 'SUMMARIZATION',
    priority: 'HIGH',
  });
  const blockedCriticalLast = makeUnassignedQueuedTask({
    id: 'tsk_keep_order_crit_3',
    sequenceNumber: 183,
    type: 'DATA_ANALYSIS',
    priority: 'CRITICAL',
  });

  const baseWorkers = createInitialWorkersRegistry();
  let snapshot = createCleanSnapshot({
    workers: {
      ...baseWorkers,
      sonnet: { ...baseWorkers.sonnet, status: 'PAUSED' },
    },
  });
  snapshot = enqueueMany(snapshot, [
    blockedLowFirst,
    dispatchedHighMiddle,
    blockedCriticalLast,
  ]);

  const entryBefore0 = snapshot.scheduler!.entries[0];
  const entryBefore2 = snapshot.scheduler!.entries[2];

  const result = dispatchPass(snapshot);

  assert.equal(result.dispatched.length, 1);
  assert.equal(result.dispatched[0].taskId, 'tsk_dispatch_middle');
  assert.equal(result.blocked.length, 2);

  // Surviving entries preserve exact references and original queue order (no accidental reordering)
  assert.equal(result.snapshot.scheduler?.entries.length, 2);
  assert.strictEqual(result.snapshot.scheduler?.entries[0], entryBefore0);
  assert.strictEqual(result.snapshot.scheduler?.entries[1], entryBefore2);
  assert.equal(result.snapshot.scheduler?.nextSequence, 4);
});

test('DP-30. dispatchPass is strictly deterministic across repeated calls on identical inputs', () => {
  const tasks = [
    makeUnassignedQueuedTask({
      id: 'tsk_det_1',
      sequenceNumber: 191,
      type: 'DECISION_EVALUATION',
      priority: 'HIGH',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_det_2',
      sequenceNumber: 192,
      type: 'DECISION_EVALUATION',
      priority: 'CRITICAL',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_det_3',
      sequenceNumber: 193,
      type: 'DECISION_EVALUATION',
      priority: 'NORMAL',
    }),
    makeUnassignedQueuedTask({
      id: 'tsk_det_4',
      sequenceNumber: 194,
      type: 'SUMMARIZATION',
      priority: 'LOW',
    }),
  ];

  const snapshot = deepFreeze(enqueueMany(createCleanSnapshot(), tasks));

  const run1 = dispatchPass(snapshot);
  const run2 = dispatchPass(snapshot);
  const run3 = dispatchPass(snapshot);

  assert.deepEqual(run1, run2);
  assert.deepEqual(run2, run3);
});

test('DP-31. Empty normalized scheduler preserves exact snapshot reference; missing scheduler normalizes cleanly', () => {
  const cleanEmpty = createCleanSnapshot();
  const resClean = dispatchPass(cleanEmpty);
  assert.strictEqual(resClean.snapshot, cleanEmpty);
  assert.deepEqual(resClean.dispatched, []);
  assert.deepEqual(resClean.blocked, []);
  assert.deepEqual(resClean.dropped, []);
  assert.equal(resClean.skipped, undefined);

  const missingScheduler = createCleanSnapshot();
  delete missingScheduler.scheduler;
  const resNormalized = dispatchPass(missingScheduler);
  assert.notStrictEqual(resNormalized.snapshot, missingScheduler);
  assert.deepEqual(resNormalized.snapshot.scheduler, {
    entries: [],
    nextSequence: 1,
  });
  assert.strictEqual(resNormalized.snapshot.tasks, missingScheduler.tasks);
  assert.strictEqual(resNormalized.snapshot.workers, missingScheduler.workers);
  assert.strictEqual(resNormalized.snapshot.events, missingScheduler.events);
});

test('DP-32. Eligible non-IDLE worker statuses (WAITING, TASK_RECEIVED, WALKING, BUSY) all accept global dispatch when capacity remains', () => {
  const eligibleStatuses = [
    'WAITING',
    'TASK_RECEIVED',
    'WALKING',
    'BUSY',
  ] as const;

  for (const status of eligibleStatuses) {
    const task = makeUnassignedQueuedTask({
      id: `tsk_status_${status.toLowerCase()}`,
      sequenceNumber: 201,
      type: 'SUMMARIZATION',
    });
    const baseWorkers = createInitialWorkersRegistry();
    let snapshot = createCleanSnapshot({
      workers: {
        ...baseWorkers,
        haiku: {
          ...baseWorkers.haiku,
          status,
          transitionSimMs: 250,
        },
      },
    });
    snapshot = enqueueMany(snapshot, [task]);

    const result = dispatchPass(snapshot);
    assert.equal(
      result.dispatched.length,
      1,
      `Expected worker in ${status} state with remaining capacity to accept dispatch`,
    );
    assert.equal(result.dispatched[0].workerId, 'haiku');
  }
});
