import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskEntity } from '../tasks/task.factory';
import type {
  TaskLifecycleStatus,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../tasks/task.types';
import { mapTaskTypeToCategory } from '../workers/worker.capabilities';
import { withTaskActivated } from '../workers/worker.concurrency';
import {
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
import { enqueueExistingTaskById, enqueueTask } from './task.dispatcher';

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
