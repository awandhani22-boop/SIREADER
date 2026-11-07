import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialSchedulerState,
  normalizeSchedulerState,
  normalizeSimulationSnapshot,
  normalizeWorkerEntity,
} from './scheduler.state';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from '../workers/simulation.engine';
import { withTaskActivated } from '../workers/worker.concurrency';
import { WorkerMockService } from '../workers/worker.mock-service';
import { useOfficeStore } from '../workers/worker.state';
import type {
  SimulationSnapshot,
  TaskEntity,
  WorkerEntity,
} from '../workers/worker.types';

test('1. Empty scheduler initialization returns canonical empty state with nextSequence = 1', () => {
  const initial = createInitialSchedulerState();
  assert.deepEqual(initial.entries, []);
  assert.equal(initial.nextSequence, 1);

  const baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  assert.ok(baseline.scheduler);
  assert.deepEqual(baseline.scheduler.entries, []);
  assert.equal(baseline.scheduler.nextSequence, 1);
});

test('2. Missing scheduler normalization populates canonical scheduler state on legacy snapshots', () => {
  const normalizedUndefined = normalizeSchedulerState(undefined);
  assert.deepEqual(normalizedUndefined, { entries: [], nextSequence: 1 });

  const baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  const legacySnapshotWithoutScheduler: SimulationSnapshot = {
    ...baseline,
  };
  delete legacySnapshotWithoutScheduler.scheduler;

  const normalizedSnapshot = normalizeSimulationSnapshot(
    legacySnapshotWithoutScheduler,
  );
  assert.ok(normalizedSnapshot.scheduler);
  assert.deepEqual(normalizedSnapshot.scheduler, {
    entries: [],
    nextSequence: 1,
  });
  // Unchanged valid workers map reference must be preserved when only scheduler was missing
  assert.strictEqual(
    normalizedSnapshot.workers,
    legacySnapshotWithoutScheduler.workers,
  );
});

test('3. Legacy snapshot missing activeTaskIds derives fallback from valid running currentTaskId', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'haiku' }, 0);
  const activeTaskId = snapshot.workers.haiku.currentTaskId!;
  assert.ok(activeTaskId);

  // Simulate a pre-Phase-2.2 serialized worker that had currentTaskId but no activeTaskIds property
  const legacyHaiku = {
    ...snapshot.workers.haiku,
    currentTaskId: activeTaskId,
  } as Partial<WorkerEntity>;
  delete legacyHaiku.activeTaskIds;

  const normalizedHaiku = normalizeWorkerEntity(
    legacyHaiku as WorkerEntity,
    snapshot.tasks,
  );
  assert.deepEqual(normalizedHaiku.activeTaskIds, [activeTaskId]);
  assert.equal(normalizedHaiku.currentTaskId, activeTaskId);
});

test('4. Existing activeTaskIds with mismatching currentTaskId: activeTaskIds wins and never prepends mismatching currentTaskId', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(
    snapshot,
    { workerId: 'haiku', title: 'Task Alpha' },
    0,
  );
  const taskAlphaId = snapshot.workers.haiku.currentTaskId!;

  // Create a second running task entity for Haiku
  const taskBetaQueued = WorkerMockService.createTaskEntity(
    snapshot,
    { workerId: 'haiku', title: 'Task Beta' },
    1,
  );
  const taskBetaRunning: TaskEntity = {
    ...taskBetaQueued,
    status: 'EXTRACTING',
    lifecycleStatus: 'RUNNING',
    assignedWorkerId: 'haiku',
    startedAt: snapshot.simTimeMs,
    startedAtSimMs: snapshot.simTimeMs,
    attemptCount: 1,
  };
  const tasksMap: Record<string, TaskEntity> = {
    ...snapshot.tasks,
    [taskBetaRunning.id]: taskBetaRunning,
  };

  // Case A: activeTaskIds has [taskBetaRunning.id], but currentTaskId points to taskAlphaId
  const workerWithMismatch: WorkerEntity = {
    ...snapshot.workers.haiku,
    activeTaskIds: [taskBetaRunning.id],
    currentTaskId: taskAlphaId,
  };
  const normalizedA = normalizeWorkerEntity(workerWithMismatch, tasksMap);
  assert.deepEqual(
    normalizedA.activeTaskIds,
    [taskBetaRunning.id],
    'Mismatching currentTaskId must never be prepended to an existing activeTaskIds array',
  );
  assert.equal(
    normalizedA.currentTaskId,
    taskBetaRunning.id,
    'currentTaskId must be synchronized to activeTaskIds[0]',
  );

  // Case B: activeTaskIds is explicitly empty [], while currentTaskId has a stale task ID
  const workerWithEmptyActiveAndStaleCurrent: WorkerEntity = {
    ...snapshot.workers.haiku,
    status: 'IDLE',
    activeTaskIds: [],
    currentTaskId: taskAlphaId,
  };
  const normalizedB = normalizeWorkerEntity(
    workerWithEmptyActiveAndStaleCurrent,
    tasksMap,
  );
  assert.deepEqual(normalizedB.activeTaskIds, []);
  assert.equal(normalizedB.currentTaskId, null);
});

test('5. Missing active task recovery resets BUSY, TASK_RECEIVED, and WALKING workers to IDLE at homePosition3D', () => {
  const baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  for (const strandedStatus of ['BUSY', 'TASK_RECEIVED', 'WALKING'] as const) {
    const strandedSonnet: WorkerEntity = {
      ...baseline.workers.sonnet,
      status: strandedStatus,
      transitionSimMs: 750,
      animationState: strandedStatus === 'WALKING' ? 'walking' : 'typing',
      position3D: [0, 0, -4.2], // away from home desk seat
      activeTaskIds: ['tsk_missing_from_snapshot'],
      currentTaskId: 'tsk_missing_from_snapshot',
    };

    const recovered = normalizeWorkerEntity(strandedSonnet, baseline.tasks);
    assert.equal(
      recovered.status,
      'IDLE',
      `Stranded ${strandedStatus} worker with missing task must recover to IDLE`,
    );
    assert.equal(recovered.transitionSimMs, 0);
    assert.equal(recovered.animationState, 'seated');
    assert.deepEqual(recovered.position3D, baseline.workers.sonnet.homePosition3D);
    assert.deepEqual(recovered.activeTaskIds, []);
    assert.equal(recovered.currentTaskId, null);
  }
});

test('6. Terminal active task recovery strips COMPLETED, FAILED, and CANCELLED tasks from activeTaskIds and recovers stranded worker', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'opus' }, 0);
  const taskId = snapshot.workers.opus.currentTaskId!;
  const baseTask = snapshot.tasks[taskId];

  for (const terminalStatus of ['COMPLETED', 'FAILED', 'CANCELLED'] as const) {
    const terminalTask: TaskEntity = {
      ...baseTask,
      status: terminalStatus,
      lifecycleStatus: terminalStatus,
    };
    const busyOpusWithTerminalTask: WorkerEntity = {
      ...snapshot.workers.opus,
      status: 'BUSY',
      transitionSimMs: 500,
      animationState: 'typing',
      position3D: [8.2, 0, -4.0],
      activeTaskIds: [taskId],
      currentTaskId: taskId,
    };

    const recovered = normalizeWorkerEntity(busyOpusWithTerminalTask, {
      [taskId]: terminalTask,
    });
    assert.deepEqual(recovered.activeTaskIds, []);
    assert.equal(recovered.currentTaskId, null);
    assert.equal(recovered.status, 'IDLE');
    assert.equal(recovered.transitionSimMs, 0);
    assert.equal(recovered.animationState, 'seated');
    assert.deepEqual(recovered.position3D, snapshot.workers.opus.homePosition3D);
  }
});

test('7. Stale scheduler entry preservation keeps structurally valid entries whose task entity is missing from snapshot.tasks', () => {
  const baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  const snapshotWithOrphanQueuedEntry: SimulationSnapshot = {
    ...baseline,
    scheduler: {
      entries: [
        {
          taskId: 'tsk_orphan_not_in_tasks_map',
          sequence: 3,
          enqueuedAtSimMs: 1500,
        },
      ],
      nextSequence: 4,
    },
  };

  const normalized = normalizeSimulationSnapshot(snapshotWithOrphanQueuedEntry);
  assert.ok(normalized.scheduler);
  assert.equal(normalized.scheduler.entries.length, 1);
  assert.equal(
    normalized.scheduler.entries[0].taskId,
    'tsk_orphan_not_in_tasks_map',
    'Structurally valid scheduler entries with missing TaskEntity must be preserved for dispatcher diagnostics',
  );
  assert.equal(normalized.scheduler.nextSequence, 4);
  assert.strictEqual(
    normalized,
    snapshotWithOrphanQueuedEntry,
    'Already valid snapshot with orphan scheduler entry must preserve snapshot reference',
  );
});

test('8. Valid snapshot and worker identity preservation avoids cloning already normalized references', () => {
  const initialSnapshot = SimulationEngine.createInitialSnapshot(
    DEFAULT_SIMULATION_SEED,
  );
  const normalizedSnapshot = normalizeSimulationSnapshot(initialSnapshot);

  // Entire snapshot and every WorkerEntity reference must be strictly identical
  assert.strictEqual(normalizedSnapshot, initialSnapshot);
  assert.strictEqual(normalizedSnapshot.workers, initialSnapshot.workers);
  assert.strictEqual(normalizedSnapshot.scheduler, initialSnapshot.scheduler);

  for (const workerId of initialSnapshot.workerOrder) {
    const worker = initialSnapshot.workers[workerId];
    const normalizedWorker = normalizeWorkerEntity(worker, initialSnapshot.tasks);
    assert.strictEqual(
      normalizedWorker,
      worker,
      `Valid worker "${workerId}" reference must be strictly preserved`,
    );
  }
});

test('9. Reset clears scheduler entries, resets nextSequence to 1, and clears activeTaskIds across engine and store', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  const haikuWithExtraActive = withTaskActivated(
    snapshot.workers.haiku,
    'tsk_haiku_extra',
  );
  snapshot = {
    ...snapshot,
    workers: {
      ...snapshot.workers,
      haiku: haikuWithExtraActive,
    },
    scheduler: {
      entries: [
        { taskId: 'tsk_queued_1', sequence: 1, enqueuedAtSimMs: 500 },
        { taskId: 'tsk_queued_2', sequence: 2, enqueuedAtSimMs: 1000 },
      ],
      nextSequence: 3,
    },
  };

  const resetSnapshot = SimulationEngine.resetToBaseline(DEFAULT_SIMULATION_SEED);
  assert.deepEqual(resetSnapshot.scheduler, {
    entries: [],
    nextSequence: 1,
  });
  for (const workerId of resetSnapshot.workerOrder) {
    assert.deepEqual(resetSnapshot.workers[workerId].activeTaskIds, []);
    assert.equal(resetSnapshot.workers[workerId].currentTaskId, null);
  }

  // Also verify Zustand store resetSimulationWithSeed
  useOfficeStore.setState({
    scheduler: {
      entries: [{ taskId: 'tsk_store_queued', sequence: 7, enqueuedAtSimMs: 2000 }],
      nextSequence: 8,
    },
  });
  useOfficeStore.getState().resetSimulationWithSeed(DEFAULT_SIMULATION_SEED);

  const storeState = useOfficeStore.getState();
  assert.deepEqual(storeState.scheduler, {
    entries: [],
    nextSequence: 1,
  });
  for (const workerId of storeState.workerOrder) {
    assert.deepEqual(storeState.workers[workerId].activeTaskIds, []);
    assert.equal(storeState.workers[workerId].currentTaskId, null);
  }

  // Advance one tick after reset and verify activeTaskIds and scheduler remain valid
  useOfficeStore.getState().tickSimulation(FIXED_TICK_SIM_MS);
  assert.deepEqual(useOfficeStore.getState().scheduler, {
    entries: [],
    nextSequence: 1,
  });
});
