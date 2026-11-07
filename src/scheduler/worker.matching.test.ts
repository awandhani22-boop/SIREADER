import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialSchedulerState } from './scheduler.state';
import {
  buildWorkerDispatchStates,
  findCapableWorkerIds,
} from './worker.matching';
import { createTaskEntity } from '../tasks/task.factory';
import {
  PERMANENT_WORKER_IDS,
  TASK_TYPES,
  type PermanentWorkerId,
  type TaskType,
  type WorkerCapabilityProfile,
} from '../tasks/task.types';
import {
  createCustomCapabilityRegistry,
  getAllWorkerCapabilityProfiles,
  mapTaskTypeToCategory,
  supportsTaskType,
} from '../workers/worker.capabilities';
import { withTaskActivated } from '../workers/worker.concurrency';
import {
  createInitialWorkersRegistry,
  INITIAL_WORKER_ORDER,
} from '../workers/worker.registry';
import type {
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
  WorkerId,
  WorkerStatus,
} from '../workers/worker.types';

function createCleanSnapshot(): SimulationSnapshot {
  return {
    seed: 20261106,
    prngState: 20261106,
    simTimeMs: 1000,
    tickCount: 2,
    isGlobalPaused: false,
    simSpeedMultiplier: 1,
    workers: createInitialWorkersRegistry(),
    workerOrder: [...INITIAL_WORKER_ORDER],
    tasks: {},
    events: [],
    scheduler: createInitialSchedulerState(),
  };
}

function makeTaskOfType(taskType: TaskType, sequenceNumber = 1): TaskEntity {
  return createTaskEntity({
    id: `tsk_${taskType.toLowerCase()}_${sequenceNumber}`,
    sequenceNumber,
    seed: 20261106,
    simTimeMs: 1000,
    type: taskType,
    category: mapTaskTypeToCategory(taskType),
    title: `Task ${taskType}`,
    description: `Deterministic capability match test for ${taskType}`,
    priority: 'NORMAL',
    status: 'QUEUED',
  });
}

test('1. All seven permanent workers produce the expected baseline dispatch states', () => {
  const snapshot = createCleanSnapshot();
  const states = buildWorkerDispatchStates(snapshot);

  assert.deepEqual(Object.keys(states), INITIAL_WORKER_ORDER);

  const expectedMaxConcurrency: Record<PermanentWorkerId, number> = {
    supervisor: 2,
    haiku: 2,
    sonnet: 1,
    opus: 1,
    decision_engineer: 1,
    market_monitor: 1,
    data_archivist: 1,
  };

  for (const workerId of PERMANENT_WORKER_IDS) {
    assert.deepEqual(states[workerId], {
      workerId,
      activeCount: 0,
      maxConcurrency: expectedMaxConcurrency[workerId],
      exclusion: null,
    });
  }
});

test('2. activeCount comes canonically from getActiveTaskIds() and never directly from currentTaskId', () => {
  const snapshot = createCleanSnapshot();
  const haikuTwoActive = withTaskActivated(
    withTaskActivated(snapshot.workers.haiku, 'tsk_h_1'),
    'tsk_h_2',
  );

  // Explicit empty activeTaskIds with stale currentTaskId: getActiveTaskIds returns [] (authoritative)
  const sonnetExplicitEmptyWithStaleCurrent: WorkerEntity = {
    ...snapshot.workers.sonnet,
    activeTaskIds: [],
    currentTaskId: 'tsk_stale_ignored',
  };

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      haiku: {
        ...haikuTwoActive,
        status: 'BUSY',
      },
      sonnet: sonnetExplicitEmptyWithStaleCurrent,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.haiku.activeCount, 2);
  assert.equal(states.haiku.exclusion, 'AT_CAPACITY');
  assert.equal(states.sonnet.activeCount, 0);
  assert.equal(states.sonnet.exclusion, null);
});

test('3. Worker with legacy currentTaskId fallback (missing activeTaskIds property) is handled through getActiveTaskIds()', () => {
  const snapshot = createCleanSnapshot();
  const legacySupervisor = {
    ...snapshot.workers.supervisor,
    status: 'BUSY' as const,
    currentTaskId: 'tsk_legacy_sup_1',
  } as Partial<WorkerEntity>;
  delete legacySupervisor.activeTaskIds;

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      supervisor: legacySupervisor as WorkerEntity,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.supervisor.activeCount, 1);
  assert.equal(states.supervisor.maxConcurrency, 2);
  assert.equal(states.supervisor.exclusion, null);
});

test('4. All five eligible statuses (IDLE, WAITING, TASK_RECEIVED, WALKING, BUSY) produce no exclusion when capacity is available', () => {
  const eligibleStatuses: readonly WorkerStatus[] = [
    'IDLE',
    'WAITING',
    'TASK_RECEIVED',
    'WALKING',
    'BUSY',
  ];

  for (const status of eligibleStatuses) {
    const snapshot = createCleanSnapshot();
    // haiku has maxConcurrency = 2; with 1 active task it still has available capacity
    const haikuActive = withTaskActivated(snapshot.workers.haiku, 'tsk_h_1');
    const modified: SimulationSnapshot = {
      ...snapshot,
      workers: {
        ...snapshot.workers,
        haiku: {
          ...haikuActive,
          status,
          taskQueueIds: [],
        },
      },
    };

    const states = buildWorkerDispatchStates(modified);
    assert.equal(
      states.haiku.exclusion,
      null,
      `Expected status "${status}" with remaining capacity to have exclusion === null`,
    );
  }
});

test('5. PAUSED, COMPLETED, and ERROR produce BLOCKED_STATE', () => {
  const blockedStatuses: readonly WorkerStatus[] = [
    'PAUSED',
    'COMPLETED',
    'ERROR',
  ];

  for (const status of blockedStatuses) {
    const snapshot = createCleanSnapshot();
    const modified: SimulationSnapshot = {
      ...snapshot,
      workers: {
        ...snapshot.workers,
        opus: {
          ...snapshot.workers.opus,
          status,
          activeTaskIds: [],
          currentTaskId: null,
          taskQueueIds: [],
        },
      },
    };

    const states = buildWorkerDispatchStates(modified);
    assert.equal(
      states.opus.exclusion,
      'BLOCKED_STATE',
      `Expected status "${status}" to produce BLOCKED_STATE`,
    );
  }
});

test('6. Exclusion evaluation order strictly enforces BLOCKED_STATE > LEGACY_QUEUE_RESERVED > AT_CAPACITY > null', () => {
  const snapshot = createCleanSnapshot();

  // PAUSED + legacy queue + at capacity -> BLOCKED_STATE wins over LEGACY_QUEUE_RESERVED and AT_CAPACITY
  const pausedWithQueueAndFull: WorkerEntity = {
    ...withTaskActivated(snapshot.workers.sonnet, 'tsk_s_1'),
    status: 'PAUSED',
    taskQueueIds: ['tsk_queued_legacy'],
  };

  // IDLE + legacy queue + at capacity -> LEGACY_QUEUE_RESERVED wins over AT_CAPACITY
  const idleWithQueueAndFull: WorkerEntity = {
    ...withTaskActivated(snapshot.workers.opus, 'tsk_o_1'),
    status: 'IDLE',
    taskQueueIds: ['tsk_queued_legacy'],
  };

  // IDLE + no legacy queue + at capacity -> AT_CAPACITY
  const idleNoQueueAndFull: WorkerEntity = {
    ...withTaskActivated(snapshot.workers.decision_engineer, 'tsk_de_1'),
    status: 'IDLE',
    taskQueueIds: [],
  };

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      sonnet: pausedWithQueueAndFull,
      opus: idleWithQueueAndFull,
      decision_engineer: idleNoQueueAndFull,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.sonnet.exclusion, 'BLOCKED_STATE');
  assert.equal(states.opus.exclusion, 'LEGACY_QUEUE_RESERVED');
  assert.equal(states.decision_engineer.exclusion, 'AT_CAPACITY');
  assert.equal(states.haiku.exclusion, null);
});

test('7. Pending legacy queue produces LEGACY_QUEUE_RESERVED and malformed non-array taskQueueIds does not throw', () => {
  const snapshot = createCleanSnapshot();
  const malformedWorker = {
    ...snapshot.workers.market_monitor,
    taskQueueIds: null as unknown as string[],
  };

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      haiku: {
        ...snapshot.workers.haiku,
        status: 'IDLE',
        taskQueueIds: ['tsk_legacy_1'],
      },
      market_monitor: malformedWorker,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.haiku.exclusion, 'LEGACY_QUEUE_RESERVED');
  assert.equal(states.market_monitor.exclusion, null);
});

test('8. Legacy queue reservation takes precedence over AT_CAPACITY on BUSY full worker', () => {
  const snapshot = createCleanSnapshot();
  const haikuFullWithQueue: WorkerEntity = {
    ...withTaskActivated(
      withTaskActivated(snapshot.workers.haiku, 'tsk_h_1'),
      'tsk_h_2',
    ),
    status: 'BUSY',
    taskQueueIds: ['tsk_h_legacy_3'],
  };

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      haiku: haikuFullWithQueue,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.haiku.activeCount, 2);
  assert.equal(states.haiku.maxConcurrency, 2);
  assert.equal(states.haiku.exclusion, 'LEGACY_QUEUE_RESERVED');
});

test('9. Full capacity with empty legacy queue produces AT_CAPACITY', () => {
  const snapshot = createCleanSnapshot();
  const sonnetFull: WorkerEntity = {
    ...withTaskActivated(snapshot.workers.sonnet, 'tsk_s_1'),
    status: 'BUSY',
    taskQueueIds: [],
  };

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      sonnet: sonnetFull,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.sonnet.activeCount, 1);
  assert.equal(states.sonnet.maxConcurrency, 1);
  assert.equal(states.sonnet.exclusion, 'AT_CAPACITY');
});

test('10. BUSY worker with available capacity and empty legacy queue remains eligible (exclusion === null)', () => {
  const snapshot = createCleanSnapshot();
  const haikuBusyOneTask: WorkerEntity = {
    ...withTaskActivated(snapshot.workers.haiku, 'tsk_h_1'),
    status: 'BUSY',
    taskQueueIds: [],
  };

  const modified: SimulationSnapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      haiku: haikuBusyOneTask,
    },
  };

  const states = buildWorkerDispatchStates(modified);
  assert.equal(states.haiku.activeCount, 1);
  assert.equal(states.haiku.maxConcurrency, 2);
  assert.equal(states.haiku.exclusion, null);
});

test('11. Invalid, zero, negative, fractional, NaN, Infinite, or missing maxConcurrency falls back to 1', () => {
  const snapshot = createCleanSnapshot();
  const baseRegistry = createCustomCapabilityRegistry({});

  const invalidValues: unknown[] = [
    0,
    -1,
    -100,
    1.5,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    undefined,
    null,
    '2',
  ];

  for (const invalidMax of invalidValues) {
    const customRegistry = {
      ...baseRegistry,
      haiku: {
        ...baseRegistry.haiku,
        maxConcurrency: invalidMax as number,
      },
    } as Readonly<Record<PermanentWorkerId, WorkerCapabilityProfile>>;

    const states = buildWorkerDispatchStates(snapshot, customRegistry);
    assert.equal(
      states.haiku.maxConcurrency,
      1,
      `Expected maxConcurrency=${String(invalidMax)} to fall back to 1`,
    );
  }

  // Missing profile entry altogether also falls back to 1
  const missingProfileRegistry = {
    ...baseRegistry,
  } as Record<string, WorkerCapabilityProfile>;
  delete missingProfileRegistry.supervisor;

  const statesWithMissingProfile = buildWorkerDispatchStates(
    snapshot,
    missingProfileRegistry as Readonly<
      Record<PermanentWorkerId, WorkerCapabilityProfile>
    >,
  );
  assert.equal(statesWithMissingProfile.supervisor.maxConcurrency, 1);
});

test('12. Ghost and prototype worker IDs do not throw and are ignored in both buildWorkerDispatchStates and findCapableWorkerIds', () => {
  const snapshot = createCleanSnapshot();
  const ghostWorkerEntity: WorkerEntity = {
    ...snapshot.workers.haiku,
    id: 'ghost_worker',
  };

  const snapshotWithGhosts: SimulationSnapshot = {
    ...snapshot,
    workerOrder: [
      'ghost_worker',
      '',
      'toString',
      '__proto__',
      'haiku',
      'unknown_bot',
    ],
    workers: {
      ...snapshot.workers,
      ghost_worker: ghostWorkerEntity,
    },
  };

  const states = buildWorkerDispatchStates(snapshotWithGhosts);
  assert.deepEqual(Object.keys(states), ['haiku']);

  const task = makeTaskOfType('QUICK_RESEARCH');
  const capable = findCapableWorkerIds(task, snapshotWithGhosts.workerOrder);
  assert.deepEqual(capable, ['haiku']);
});

test('13. Duplicate worker IDs in workerOrder are processed once in first-occurrence order', () => {
  const snapshot = createCleanSnapshot();
  const duplicatedOrder: WorkerId[] = [
    'decision_engineer',
    'opus',
    'decision_engineer',
    'haiku',
    'opus',
    'haiku',
  ];

  const states = buildWorkerDispatchStates({
    ...snapshot,
    workerOrder: duplicatedOrder,
  });
  assert.deepEqual(Object.keys(states), [
    'decision_engineer',
    'opus',
    'haiku',
  ]);

  const sharedTask = makeTaskOfType('DECISION_EVALUATION');
  const capable = findCapableWorkerIds(sharedTask, duplicatedOrder);
  assert.deepEqual(capable, ['decision_engineer', 'opus']);
});

test('14. Permanent worker absent from snapshot.workerOrder does not appear in dispatch states', () => {
  const snapshot = createCleanSnapshot();
  const subsetOrder: WorkerId[] = ['supervisor', 'sonnet', 'opus'];

  const states = buildWorkerDispatchStates({
    ...snapshot,
    workerOrder: subsetOrder,
  });

  assert.deepEqual(Object.keys(states), ['supervisor', 'sonnet', 'opus']);
  assert.equal('haiku' in states, false);
  assert.equal('decision_engineer' in states, false);
});

test('15. Permanent worker ID in workerOrder but missing from snapshot.workers does not appear in dispatch states', () => {
  const snapshot = createCleanSnapshot();
  const workersWithoutOpus: Partial<Record<WorkerId, WorkerEntity>> = {
    ...snapshot.workers,
  };
  delete workersWithoutOpus.opus;

  const states = buildWorkerDispatchStates({
    ...snapshot,
    workers: workersWithoutOpus as Record<WorkerId, WorkerEntity>,
  });

  assert.equal('opus' in states, false);
  assert.deepEqual(Object.keys(states), [
    'supervisor',
    'haiku',
    'sonnet',
    'decision_engineer',
    'market_monitor',
    'data_archivist',
  ]);

  // Intersecting capability matches with dispatch states excludes missing entity opus
  const sharedTask = makeTaskOfType('DECISION_EVALUATION');
  const capableIds = findCapableWorkerIds(sharedTask, snapshot.workerOrder);
  assert.deepEqual(capableIds, ['opus', 'decision_engineer']);
  const dispatchableCapableIds = capableIds.filter((id) => id in states);
  assert.deepEqual(dispatchableCapableIds, ['decision_engineer']);
});

test('16. Custom disabled worker does not match any of its task types', () => {
  const customRegistry = createCustomCapabilityRegistry({
    disabledWorkerIds: ['sonnet', 'opus'],
  });

  const dataAnalysisTask = makeTaskOfType('DATA_ANALYSIS');
  assert.deepEqual(
    findCapableWorkerIds(dataAnalysisTask, INITIAL_WORKER_ORDER, customRegistry),
    [],
  );

  // Shared capability falls back solely to enabled decision_engineer when opus is disabled
  const decisionEvalTask = makeTaskOfType('DECISION_EVALUATION');
  assert.deepEqual(
    findCapableWorkerIds(decisionEvalTask, INITIAL_WORKER_ORDER, customRegistry),
    ['decision_engineer'],
  );
});

test('17. Custom disabled capability does not match its disabled task type while other capabilities remain active', () => {
  const customRegistry = createCustomCapabilityRegistry({
    disabledCapabilityIds: ['quick_research'],
    workerCapabilityDisableMap: {
      opus: ['decision_evaluation'],
    },
  });

  // quick_research disabled -> QUICK_RESEARCH no longer supported by haiku
  assert.deepEqual(
    findCapableWorkerIds(
      makeTaskOfType('QUICK_RESEARCH'),
      INITIAL_WORKER_ORDER,
      customRegistry,
    ),
    [],
  );

  // summarization still enabled on haiku -> SUMMARIZATION and CLASSIFICATION still match haiku
  assert.deepEqual(
    findCapableWorkerIds(
      makeTaskOfType('SUMMARIZATION'),
      INITIAL_WORKER_ORDER,
      customRegistry,
    ),
    ['haiku'],
  );
  assert.deepEqual(
    findCapableWorkerIds(
      makeTaskOfType('CLASSIFICATION'),
      INITIAL_WORKER_ORDER,
      customRegistry,
    ),
    ['haiku'],
  );

  // decision_evaluation disabled only on opus -> DECISION_EVALUATION matches only decision_engineer
  assert.deepEqual(
    findCapableWorkerIds(
      makeTaskOfType('DECISION_EVALUATION'),
      INITIAL_WORKER_ORDER,
      customRegistry,
    ),
    ['decision_engineer'],
  );
});

test('18. Canonical capability registry remains completely unchanged after custom-registry tests', () => {
  const profiles = getAllWorkerCapabilityProfiles();
  assert.equal(profiles.length, 7);
  for (const profile of profiles) {
    assert.equal(profile.enabled, true);
    for (const cap of profile.capabilities) {
      assert.equal(cap.enabled, true);
    }
  }

  assert.deepEqual(
    findCapableWorkerIds(makeTaskOfType('QUICK_RESEARCH'), INITIAL_WORKER_ORDER),
    ['haiku'],
  );
  assert.deepEqual(
    findCapableWorkerIds(makeTaskOfType('DATA_ANALYSIS'), INITIAL_WORKER_ORDER),
    ['sonnet'],
  );
});

test('19. Every canonical TaskType across every permanent worker agrees 100% with supportsTaskType()', () => {
  for (let i = 0; i < TASK_TYPES.length; i++) {
    const taskType = TASK_TYPES[i];
    const task = makeTaskOfType(taskType, i + 1);

    const expected = PERMANENT_WORKER_IDS.filter((workerId) =>
      supportsTaskType(workerId, taskType),
    );
    const actual = findCapableWorkerIds(task, PERMANENT_WORKER_IDS);

    assert.deepEqual(
      actual,
      expected,
      `Mismatch between findCapableWorkerIds and supportsTaskType for "${taskType}"`,
    );
    assert.ok(
      actual.length >= 1,
      `Every canonical TaskType ("${taskType}") must have at least one capable permanent worker`,
    );
  }
});

test('20. Shared task types ESCALATION, DECISION_CHECK, and DECISION_EVALUATION return [opus, decision_engineer] against the canonical registry', () => {
  const sharedTaskTypes: readonly TaskType[] = [
    'ESCALATION',
    'DECISION_CHECK',
    'DECISION_EVALUATION',
  ];

  for (const sharedType of sharedTaskTypes) {
    const task = makeTaskOfType(sharedType);
    const matchesCanonicalOrder = findCapableWorkerIds(
      task,
      INITIAL_WORKER_ORDER,
    );
    assert.deepEqual(
      matchesCanonicalOrder,
      ['opus', 'decision_engineer'],
      `Expected ${sharedType} to match ['opus', 'decision_engineer'] in canonical order`,
    );

    const reversedOrder = [...INITIAL_WORKER_ORDER].reverse();
    const matchesReversedOrder = findCapableWorkerIds(task, reversedOrder);
    assert.deepEqual(
      matchesReversedOrder,
      ['decision_engineer', 'opus'],
      `Expected ${sharedType} to respect supplied workerOrder`,
    );
  }
});
