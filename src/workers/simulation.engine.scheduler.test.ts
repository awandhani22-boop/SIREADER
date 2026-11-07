import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchPass } from '../scheduler/task.dispatcher';
import { createTaskEntity } from '../tasks/task.factory';
import { TASK_TYPES } from '../tasks/task.types';
import { validateTaskEntity } from '../tasks/task.validation';
import {
  DEFAULT_SIMULATION_SEED,
  DEMO_MAX_QUEUE_CAP,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from './simulation.engine';
import {
  createCustomCapabilityRegistry,
  getWorkersSupportingTaskType,
  mapTaskTypeToCategory,
} from './worker.capabilities';
import { getActiveTaskIds } from './worker.concurrency';
import {
  type GlobalTaskInput,
  WorkerMockService,
} from './worker.mock-service';
import {
  COST_PER_1K_TOKENS_SIMULATED,
  GLOBAL_DEMO_TASK_TEMPLATES,
  type GlobalDemoTaskTemplate,
} from './worker.registry';
import type {
  SimulationSnapshot,
  TaskEntity,
  TaskPriority,
  TaskType,
} from './worker.types';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

test('RT-1. createGlobalTaskEntity creates deterministic unassigned QUEUED tasks with tsk_pool_<seq>_<simTimeMs> IDs', () => {
  const baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  const taskA1 = WorkerMockService.createGlobalTaskEntity(baseline, {
    type: 'DATA_ANALYSIS',
    title: 'Synthesize Macro Liquidity',
    priority: 'HIGH',
    durationSimMs: 6000,
    targetTokens: 480,
  });
  const taskA2 = WorkerMockService.createGlobalTaskEntity(baseline, {
    type: 'DATA_ANALYSIS',
    title: 'Synthesize Macro Liquidity',
    priority: 'HIGH',
    durationSimMs: 6000,
    targetTokens: 480,
  });

  assert.equal(taskA1.id, 'tsk_pool_101_0');
  assert.deepEqual(taskA1, taskA2);
  assert.equal(taskA1.assignedWorkerId, null);
  assert.equal(taskA1.status, 'QUEUED');
  assert.equal(taskA1.lifecycleStatus, 'QUEUED');
  assert.equal(taskA1.category, 'REASONING');
  assert.equal(taskA1.type, 'DATA_ANALYSIS');
  assert.equal(taskA1.priority, 'HIGH');
  assert.equal(validateTaskEntity(taskA1).valid, true);

  // Fractional simTimeMs floors deterministically in pool task ID while sequence advances with task count
  const fractionalSnapshot: SimulationSnapshot = {
    ...baseline,
    simTimeMs: 2500.75,
    tasks: {
      [taskA1.id]: taskA1,
    },
  };
  const taskB = WorkerMockService.createGlobalTaskEntity(fractionalSnapshot, {
    type: 'QUICK_RESEARCH',
    priority: 'CRITICAL',
  });
  assert.equal(taskB.id, 'tsk_pool_102_2500');
  assert.equal(taskB.assignedWorkerId, null);
  assert.equal(taskB.category, 'CLASSIFICATION');
  assert.equal(validateTaskEntity(taskB, { existingTaskIds: [taskA1.id] }).valid, true);
});

test('RT-2. enqueueGlobalTask inserts task into snapshot.tasks and scheduler queue and emits exactly one TASK_QUEUED event', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  assert.equal(snapshot.events.length, 0);
  assert.equal(snapshot.scheduler?.entries.length, 0);

  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'DATA_ANALYSIS',
    title: 'Global Analysis #1',
    priority: 'HIGH',
  });

  assert.equal(Object.keys(snapshot.tasks).length, 1);
  assert.equal(snapshot.scheduler?.entries.length, 1);
  assert.equal(snapshot.scheduler?.nextSequence, 2);

  const firstEntry = snapshot.scheduler!.entries[0]!;
  assert.equal(firstEntry.taskId, 'tsk_pool_101_0');
  assert.equal(firstEntry.sequence, 1);
  assert.equal(firstEntry.enqueuedAtSimMs, 0);

  const storedTask = snapshot.tasks['tsk_pool_101_0']!;
  assert.equal(storedTask.assignedWorkerId, null);
  assert.equal(storedTask.status, 'QUEUED');
  assert.equal(storedTask.lifecycleStatus, 'QUEUED');

  // Exactly one TASK_QUEUED event emitted; zero workers started yet
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0]!.type, 'TASK_QUEUED');
  assert.equal(snapshot.events[0]!.workerId, null);
  assert.equal(snapshot.events[0]!.workerName, 'Task Dispatcher');
  assert.equal(snapshot.events[0]!.taskId, 'tsk_pool_101_0');
  assert.equal(snapshot.workers.sonnet.status, 'IDLE');
  assert.equal(snapshot.workers.sonnet.currentTaskId, null);

  // Enqueue a pre-built global TaskEntity directly as well
  const prebuilt = WorkerMockService.createGlobalTaskEntity(snapshot, {
    type: 'QUICK_RESEARCH',
    title: 'Global Research #2',
    priority: 'CRITICAL',
  });
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, prebuilt);

  assert.equal(Object.keys(snapshot.tasks).length, 2);
  assert.equal(snapshot.scheduler?.entries.length, 2);
  assert.equal(snapshot.scheduler?.nextSequence, 3);
  assert.equal(snapshot.events.length, 2);
  assert.equal(snapshot.events[0]!.type, 'TASK_QUEUED');
  assert.equal(snapshot.events[0]!.taskId, prebuilt.id);
  assert.notEqual(snapshot.events[0]!.id, snapshot.events[1]!.id);
});

test('RT-3. Failed enqueueGlobalTask returns exact original snapshot reference and emits zero events', () => {
  let base = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  base = WorkerMockService.enqueueGlobalTask(base, {
    id: 'tsk_pool_existing_0',
    type: 'DATA_ANALYSIS',
    title: 'Already Queued Task',
    priority: 'NORMAL',
  });
  base = WorkerMockService.assignTask(base, { workerId: 'haiku' }, 0);
  const activeHaikuTaskId = base.workers.haiku.currentTaskId!;
  assert.ok(activeHaikuTaskId);

  const pinnedEntity = WorkerMockService.createTaskEntity(
    base,
    { workerId: 'opus', title: 'Pinned Task' },
    0,
  );
  const runningEntity = createTaskEntity({
    id: 'tsk_pool_running_0',
    simTimeMs: base.simTimeMs,
    title: 'Running Task',
    type: 'DATA_ANALYSIS',
    status: 'ANALYZING',
    lifecycleStatus: 'RUNNING',
    assignedWorkerId: null,
    startedAt: base.simTimeMs,
  });

  deepFreeze(base);
  const eventsBefore = base.events.length;

  const invalidCases: Array<GlobalTaskInput | TaskEntity> = [
    pinnedEntity,
    runningEntity,
    { id: 'tsk_pool_existing_0', type: 'DATA_ANALYSIS', title: 'Duplicate Queued ID' },
    { id: activeHaikuTaskId, type: 'QUICK_RESEARCH', title: 'Active Worker Task ID' },
    { id: '   ', type: 'DATA_ANALYSIS', title: 'Blank ID' },
    { sequenceNumber: 0, type: 'DATA_ANALYSIS', title: 'Zero Sequence' },
    { sequenceNumber: -4, type: 'DATA_ANALYSIS', title: 'Negative Sequence' },
    { durationSimMs: 0, type: 'DATA_ANALYSIS', title: 'Zero Duration' },
    { targetTokens: -10, type: 'DATA_ANALYSIS', title: 'Negative Tokens' },
    { maxAttempts: 0, type: 'DATA_ANALYSIS', title: 'Zero Max Attempts' },
    { priority: 'URGENT_INVALID' as TaskPriority, type: 'DATA_ANALYSIS', title: 'Bad Priority' },
    { type: 'NON_EXISTENT_TYPE' as TaskType, title: 'Bad Task Type' },
    { dependencyIds: ['dep_1', 'dep_1'], type: 'DATA_ANALYSIS', title: 'Duplicate Deps' },
    { id: 'tsk_self_dep', dependencyIds: ['tsk_self_dep'], type: 'DATA_ANALYSIS', title: 'Self Dep' },
  ];

  for (const invalidCase of invalidCases) {
    const result = WorkerMockService.enqueueGlobalTask(base, invalidCase);
    assert.equal(result, base);
    assert.equal(result.events.length, eventsBefore);
  }
});

test('RT-4. Enqueue without capable worker succeeds with TASK_QUEUED and dispatchPass classifies NO_CAPABLE_WORKER until worker is available', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  // Remove opus (sole COMPLEX_REASONING worker) from workerOrder so no active runtime worker is capable
  snapshot = {
    ...snapshot,
    workerOrder: snapshot.workerOrder.filter((id) => id !== 'opus'),
  };

  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'COMPLEX_REASONING',
    title: 'Unservable Deep Escalation',
    priority: 'CRITICAL',
  });

  assert.equal(snapshot.scheduler?.entries.length, 1);
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0]!.type, 'TASK_QUEUED');

  // Direct dispatchPass inspection confirms NO_CAPABLE_WORKER classification
  const passCheck = dispatchPass(snapshot);
  assert.equal(passCheck.dispatched.length, 0);
  assert.equal(passCheck.blocked.length, 1);
  assert.equal(passCheck.blocked[0]!.reason, 'NO_CAPABLE_WORKER');

  // Also verify custom registry with opus disabled via service wrapper
  const disabledOpusRegistry = createCustomCapabilityRegistry({
    disabledWorkerIds: ['opus'],
  });
  const fullOrderSnapshot: SimulationSnapshot = {
    ...snapshot,
    workerOrder: [...SimulationEngine.createBaselineSnapshot().workerOrder],
  };
  const wrappedDisabled = WorkerMockService.dispatchGlobalQueue(fullOrderSnapshot, {
    capabilityRegistry: disabledOpusRegistry,
  });
  assert.equal(wrappedDisabled.scheduler?.entries.length, 1);
  assert.equal(wrappedDisabled.events.length, 1);

  // Stepping simulation tick leaves the task safely queued without emitting TASK_STARTED
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.scheduler?.entries.length, 1);
  assert.equal(snapshot.tasks['tsk_pool_101_0']!.status, 'QUEUED');
  assert.equal(snapshot.events.some((e) => e.type === 'TASK_STARTED'), false);

  // Restore opus to workerOrder -> next tick dispatches the waiting task to opus
  snapshot = {
    ...snapshot,
    workerOrder: [...snapshot.workerOrder, 'opus'],
  };
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.scheduler?.entries.length, 0);
  assert.equal(snapshot.workers.opus.currentTaskId, 'tsk_pool_101_0');
  assert.equal(snapshot.tasks['tsk_pool_101_0']!.assignedWorkerId, 'opus');
  assert.equal(snapshot.tasks['tsk_pool_101_0']!.lifecycleStatus, 'RUNNING');
});

test('RT-5. stepSimulationTick runs dispatch pass AFTER stepping active tasks and synchronizes unified clock anchor', () => {
  // Scenario A: sonnet finishes COMPLETED -> IDLE in Step 2 and receives waiting global task in Step 3 of the SAME tick
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(
    snapshot,
    { workerId: 'sonnet', durationSimMs: 500, title: 'Short Legacy Task' },
    0,
  );
  // Advance until sonnet enters BUSY (2 ticks TASK_RECEIVED + 3 ticks WALKING = 5 ticks) and completes on tick 6
  for (let i = 0; i < 6; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }
  assert.equal(snapshot.workers.sonnet.status, 'COMPLETED');
  assert.equal(snapshot.workers.sonnet.transitionSimMs, 0);

  // Advance 1 tick into COMPLETED celebration (500ms / 1000ms)
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.workers.sonnet.status, 'COMPLETED');
  assert.equal(snapshot.workers.sonnet.transitionSimMs, 500);

  // Enqueue a global DATA_ANALYSIS task while sonnet is still in COMPLETED (blocked state)
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'DATA_ANALYSIS',
    title: 'Queued For Post-Celebration Dispatch',
    priority: 'HIGH',
  });
  const globalTaskId = snapshot.scheduler!.entries[0]!.taskId;

  // On the very next 500ms tick:
  // Step 1 advances simTimeMs to 4000ms
  // Step 2 finishes sonnet's COMPLETED celebration (500 + 500 >= 1000 -> IDLE)
  // Step 3 dispatches globalTaskId to sonnet in the SAME tick!
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.simTimeMs, 4000);
  assert.equal(snapshot.scheduler?.entries.length, 0);
  assert.equal(snapshot.workers.sonnet.status, 'TASK_RECEIVED');
  assert.equal(snapshot.workers.sonnet.currentTaskId, globalTaskId);
  assert.equal(snapshot.tasks[globalTaskId]!.startedAt, 4000);
  assert.equal(SimulationEngine.getUnifiedSimTimeMs(snapshot), 4000);

  // Scenario B: haiku at 2/2 capacity completes 1 active task in Step 2 and immediately accepts 3rd task in Step 3
  let multiSnap = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  multiSnap = WorkerMockService.enqueueGlobalTask(multiSnap, {
    type: 'QUICK_RESEARCH',
    title: 'Haiku Short Slot 1',
    priority: 'CRITICAL',
    durationSimMs: 500,
  });
  multiSnap = WorkerMockService.enqueueGlobalTask(multiSnap, {
    type: 'SUMMARIZATION',
    title: 'Haiku Long Slot 2',
    priority: 'HIGH',
    durationSimMs: 4000,
  });
  multiSnap = WorkerMockService.enqueueGlobalTask(multiSnap, {
    type: 'INFORMATION_EXTRACTION',
    title: 'Haiku Waiting Task 3',
    priority: 'NORMAL',
    durationSimMs: 2000,
  });

  const [entry1, entry2, entry3] = multiSnap.scheduler!.entries;
  assert.ok(entry1 && entry2 && entry3);

  // Tick 1 dispatches first 2 tasks to haiku; 3rd waits
  multiSnap = SimulationEngine.stepSimulationTick(multiSnap, FIXED_TICK_SIM_MS);
  assert.deepEqual(getActiveTaskIds(multiSnap.workers.haiku), [
    entry1.taskId,
    entry2.taskId,
  ]);
  assert.equal(multiSnap.scheduler?.entries.length, 1);
  assert.equal(multiSnap.scheduler?.entries[0]!.taskId, entry3.taskId);

  // Ticks 2..6: haiku transitions TASK_RECEIVED (1000ms) -> WALKING (1500ms) -> BUSY at tick 6 (3000ms)
  for (let i = 0; i < 5; i++) {
    multiSnap = SimulationEngine.stepSimulationTick(multiSnap, FIXED_TICK_SIM_MS);
  }
  assert.equal(multiSnap.workers.haiku.status, 'BUSY');

  // Tick 7 (3500ms): entry1 (duration 500ms) completes in Step 2 while entry2 advances to 500/4000ms,
  // and Step 3 immediately dispatches entry3 into haiku's freed 2nd slot!
  multiSnap = SimulationEngine.stepSimulationTick(multiSnap, FIXED_TICK_SIM_MS);
  assert.equal(multiSnap.tasks[entry1.taskId]!.status, 'COMPLETED');
  assert.equal(multiSnap.workers.haiku.status, 'BUSY');
  assert.deepEqual(getActiveTaskIds(multiSnap.workers.haiku), [
    entry2.taskId,
    entry3.taskId,
  ]);
  assert.equal(multiSnap.scheduler?.entries.length, 0);
});

test('RT-6. Dispatched task emits exactly ONE TASK_STARTED event without service/engine duplication', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'COMPLEX_REASONING',
    title: 'Opus Global Task',
    priority: 'CRITICAL',
  });
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'DATA_ANALYSIS',
    title: 'Sonnet Global Task',
    priority: 'HIGH',
  });

  assert.equal(snapshot.events.length, 2);
  assert.equal(
    snapshot.events.filter((e) => e.type === 'TASK_QUEUED').length,
    2,
  );
  assert.equal(
    snapshot.events.filter((e) => e.type === 'TASK_STARTED').length,
    0,
  );

  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);

  const startedEvents = snapshot.events.filter((e) => e.type === 'TASK_STARTED');
  assert.equal(startedEvents.length, 2);
  assert.equal(snapshot.events.length, 4);

  const opusTaskEvents = startedEvents.filter((e) => e.workerId === 'opus');
  const sonnetTaskEvents = startedEvents.filter((e) => e.workerId === 'sonnet');
  assert.equal(opusTaskEvents.length, 1);
  assert.equal(sonnetTaskEvents.length, 1);
  assert.notEqual(opusTaskEvents[0]!.id, sonnetTaskEvents[0]!.id);
});

test('RT-7. Priority ordering, selected worker cost rate, and concurrent execution complete cleanly end-to-end', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  // Shared capability DECISION_EVALUATION is supported by opus (0.015) and decision_engineer (0.002)
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'DECISION_EVALUATION',
    title: 'Shared Evaluation Normal',
    priority: 'NORMAL',
    durationSimMs: 1500,
    targetTokens: 500,
  });
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'DECISION_EVALUATION',
    title: 'Shared Evaluation Critical',
    priority: 'CRITICAL',
    durationSimMs: 1500,
    targetTokens: 500,
  });

  const normalId = snapshot.scheduler!.entries[0]!.taskId;
  const criticalId = snapshot.scheduler!.entries[1]!.taskId;

  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);

  // CRITICAL dispatched first to cheaper specialist decision_engineer (0.002); NORMAL dispatched second to opus (0.015)
  assert.equal(snapshot.workers.decision_engineer.currentTaskId, criticalId);
  assert.equal(
    snapshot.tasks[criticalId]!.costPerThousandTokensUsd,
    COST_PER_1K_TOKENS_SIMULATED.decision_engineer,
  );
  assert.equal(snapshot.workers.opus.currentTaskId, normalId);
  assert.equal(
    snapshot.tasks[normalId]!.costPerThousandTokensUsd,
    COST_PER_1K_TOKENS_SIMULATED.opus,
  );

  // Advance until both tasks finish execution and celebration (10 ticks = 5000ms)
  for (let i = 0; i < 10; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }
  assert.equal(snapshot.tasks[criticalId]!.status, 'COMPLETED');
  assert.equal(snapshot.tasks[normalId]!.status, 'COMPLETED');
  assert.equal(snapshot.workers.decision_engineer.metrics.completedTasksCount, 1);
  assert.equal(snapshot.workers.opus.metrics.completedTasksCount, 1);
});

test('RT-8. Global pause halts dispatch and setGlobalPaused(false) waits until the next simulation tick', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  assert.equal(snapshot.isGlobalPaused, true);
  assert.equal(snapshot.events.length, 1); // SIMULATION_CONTROL PAUSED

  // Enqueuing while globally paused is allowed and records TASK_QUEUED
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'DATA_ANALYSIS',
    title: 'Queued During Global Pause',
    priority: 'CRITICAL',
  });
  const taskId = snapshot.scheduler!.entries[0]!.taskId;
  assert.equal(snapshot.scheduler?.entries.length, 1);
  assert.equal(snapshot.events.length, 2);
  assert.equal(snapshot.events[0]!.type, 'TASK_QUEUED');

  // Neither stepSimulationTick nor dispatchGlobalQueue dispatches while globally paused
  const afterPausedTick = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(afterPausedTick, snapshot);
  const afterPausedWrapper = WorkerMockService.dispatchGlobalQueue(snapshot);
  assert.equal(afterPausedWrapper, snapshot);

  // Global unpause does NOT run dispatch immediately; task waits in queue for next tick
  snapshot = SimulationEngine.setGlobalPaused(snapshot, false);
  assert.equal(snapshot.isGlobalPaused, false);
  assert.equal(snapshot.scheduler?.entries.length, 1);
  assert.equal(snapshot.tasks[taskId]!.status, 'QUEUED');
  assert.equal(snapshot.workers.sonnet.status, 'IDLE');
  assert.equal(snapshot.workers.sonnet.currentTaskId, null);
  assert.equal(snapshot.events.length, 3); // +1 SIMULATION_CONTROL RESUMED only
  assert.equal(snapshot.events[0]!.type, 'SIMULATION_CONTROL');

  // Next simulation tick dispatches the waiting task
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.scheduler?.entries.length, 0);
  assert.equal(snapshot.workers.sonnet.currentTaskId, taskId);
  assert.equal(snapshot.tasks[taskId]!.lifecycleStatus, 'RUNNING');
  assert.equal(snapshot.events[0]!.type, 'TASK_STARTED');
});

test('RT-9. resumeWorker dispatches immediately when not globally paused, blocks when globally paused, and honors legacy queue reservation', () => {
  // Case A: Paused IDLE worker + unpaused clock -> resumeWorker immediately dispatches waiting global task
  let snapA = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapA = SimulationEngine.pauseWorker(snapA, 'sonnet');
  snapA = WorkerMockService.enqueueGlobalTask(snapA, {
    type: 'DATA_ANALYSIS',
    title: 'Waiting For Sonnet Resume',
    priority: 'HIGH',
  });
  const taskAId = snapA.scheduler!.entries[0]!.taskId;

  snapA = SimulationEngine.stepSimulationTick(snapA, FIXED_TICK_SIM_MS);
  assert.equal(snapA.scheduler?.entries.length, 1);
  assert.equal(snapA.workers.sonnet.status, 'PAUSED');

  snapA = SimulationEngine.resumeWorker(snapA, 'sonnet');
  assert.equal(snapA.scheduler?.entries.length, 0);
  assert.equal(snapA.workers.sonnet.status, 'TASK_RECEIVED');
  assert.equal(snapA.workers.sonnet.currentTaskId, taskAId);
  assert.equal(snapA.events[0]!.type, 'TASK_STARTED');
  assert.equal(snapA.events[1]!.type, 'WORKER_RESUMED');
  assert.notEqual(snapA.events[0]!.id, snapA.events[1]!.id);

  // Case B: Paused BUSY 2-slot worker (haiku at 1/2) -> resumeWorker keeps primary task progress and fills 2nd slot immediately
  let snapB = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapB = WorkerMockService.assignTask(
    snapB,
    { workerId: 'haiku', durationSimMs: 6000, title: 'Haiku Primary' },
    0,
  );
  for (let i = 0; i < 6; i++) {
    snapB = SimulationEngine.stepSimulationTick(snapB, FIXED_TICK_SIM_MS);
  }
  assert.equal(snapB.workers.haiku.status, 'BUSY');
  const primaryId = snapB.workers.haiku.currentTaskId!;
  const frozenElapsed = snapB.tasks[primaryId]!.elapsedSimMs;

  snapB = SimulationEngine.pauseWorker(snapB, 'haiku');
  snapB = WorkerMockService.enqueueGlobalTask(snapB, {
    type: 'QUICK_RESEARCH',
    title: 'Haiku Second Slot On Resume',
    priority: 'CRITICAL',
  });
  const secondId = snapB.scheduler!.entries[0]!.taskId;

  snapB = SimulationEngine.resumeWorker(snapB, 'haiku');
  assert.equal(snapB.workers.haiku.status, 'BUSY');
  assert.deepEqual(getActiveTaskIds(snapB.workers.haiku), [primaryId, secondId]);
  assert.equal(snapB.tasks[primaryId]!.elapsedSimMs, frozenElapsed);
  assert.equal(snapB.scheduler?.entries.length, 0);

  // Case C: Global pause active -> resumeWorker restores worker status WITHOUT dispatching global queue
  let snapC = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapC = SimulationEngine.pauseWorker(snapC, 'sonnet');
  snapC = SimulationEngine.setGlobalPaused(snapC, true);
  snapC = WorkerMockService.enqueueGlobalTask(snapC, {
    type: 'DATA_ANALYSIS',
    title: 'Blocked By Global Pause On Worker Resume',
    priority: 'CRITICAL',
  });

  snapC = SimulationEngine.resumeWorker(snapC, 'sonnet');
  assert.equal(snapC.workers.sonnet.status, 'IDLE');
  assert.equal(snapC.workers.sonnet.currentTaskId, null);
  assert.equal(snapC.scheduler?.entries.length, 1);
  assert.equal(snapC.events[0]!.type, 'WORKER_RESUMED');

  // Case D: Paused worker with pending legacy queue promotes legacy task on resume without global theft
  let snapD = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapD = SimulationEngine.pauseWorker(snapD, 'sonnet');
  snapD = WorkerMockService.assignTask(
    snapD,
    { workerId: 'sonnet', title: 'Pinned Legacy Queued' },
    0,
  );
  const legacyId = snapD.workers.sonnet.taskQueueIds[0]!;
  snapD = WorkerMockService.enqueueGlobalTask(snapD, {
    type: 'DATA_ANALYSIS',
    title: 'Global Task Behind Legacy Queue',
    priority: 'CRITICAL',
  });

  snapD = SimulationEngine.resumeWorker(snapD, 'sonnet');
  assert.equal(snapD.workers.sonnet.currentTaskId, legacyId);
  assert.equal(snapD.scheduler?.entries.length, 1);
});

test('RT-10. ActivityEvent IDs remain strictly unique at and beyond the 80-event log cap across mixed runtime events', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  const allObservedEventIds = new Set<string>();

  const recordAndVerifyEvents = (snap: SimulationSnapshot, prevTopId: string | null) => {
    const windowIds = new Set<string>();
    for (const evt of snap.events) {
      assert.equal(
        windowIds.has(evt.id),
        false,
        `Duplicate event ID "${evt.id}" inside 80-event window`,
      );
      windowIds.add(evt.id);
    }

    // Collect newly prepended events since prevTopId
    const newEvents = [];
    for (const evt of snap.events) {
      if (evt.id === prevTopId) break;
      newEvents.push(evt);
    }
    for (const evt of newEvents.reverse()) {
      assert.equal(
        allObservedEventIds.has(evt.id),
        false,
        `Historical duplicate event ID "${evt.id}" detected after cap`,
      );
      allObservedEventIds.add(evt.id);
    }
  };

  // Emit >100 events to thoroughly saturate MAX_EVENT_LOG_LENGTH = 80
  for (let cycle = 0; cycle < 55; cycle++) {
    let topBefore = snapshot.events[0]?.id ?? null;
    snapshot = WorkerMockService.enqueueGlobalTask(
      snapshot,
      {
        type: cycle % 2 === 0 ? 'QUICK_RESEARCH' : 'INSTRUCTION_INTAKE',
        title: `Cap Saturation Task #${cycle + 1}`,
        priority: cycle % 3 === 0 ? 'CRITICAL' : 'HIGH',
        durationSimMs: 1000,
      },
      cycle,
    );
    recordAndVerifyEvents(snapshot, topBefore);

    topBefore = snapshot.events[0]?.id ?? null;
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    recordAndVerifyEvents(snapshot, topBefore);
  }

  assert.equal(snapshot.events.length, 80);

  // At full 80-event saturation, trigger pause + multiple enqueues + worker resume + dual dispatch in same timestamp
  let prevTop = snapshot.events[0]!.id;
  snapshot = SimulationEngine.pauseWorker(snapshot, 'haiku');
  recordAndVerifyEvents(snapshot, prevTop);

  prevTop = snapshot.events[0]!.id;
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'QUICK_RESEARCH',
    title: 'Burst Cap Task A',
    priority: 'CRITICAL',
  });
  recordAndVerifyEvents(snapshot, prevTop);

  prevTop = snapshot.events[0]!.id;
  snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
    type: 'SUMMARIZATION',
    title: 'Burst Cap Task B',
    priority: 'HIGH',
  });
  recordAndVerifyEvents(snapshot, prevTop);

  prevTop = snapshot.events[0]!.id;
  snapshot = SimulationEngine.resumeWorker(snapshot, 'haiku');
  assert.equal(snapshot.events.length, 80);
  recordAndVerifyEvents(snapshot, prevTop);

  assert.ok(allObservedEventIds.size > 95);
});

test('RT-11. Seeded replay determinism, 1x/2x/4x speed equivalence, and resetToBaseline cleanup', () => {
  const runTrajectory = (seed: number): SimulationSnapshot => {
    let snap = SimulationEngine.createBaselineSnapshot(seed);
    for (let tick = 1; tick <= 80; tick++) {
      if (tick === 1 || tick === 15 || tick === 30) {
        snap = WorkerMockService.enqueueGlobalTask(snap, {
          type: tick === 15 ? 'DECISION_EVALUATION' : 'QUICK_RESEARCH',
          title: `Deterministic Replay Task @${tick}`,
          priority: tick === 30 ? 'CRITICAL' : 'HIGH',
          durationSimMs: 2500,
        });
      }
      snap = SimulationEngine.stepSimulationTick(snap, FIXED_TICK_SIM_MS);
    }
    return snap;
  };

  const run1 = runTrajectory(987654);
  const run2 = runTrajectory(987654);
  assert.deepEqual(run1, run2);

  // 1x vs 2x vs 4x wall-clock advancement over equal 2000ms simulated duration
  const buildSeededQueue = (speed: 1 | 2 | 4): SimulationSnapshot => {
    let snap = SimulationEngine.createBaselineSnapshot(424242);
    snap = { ...snap, simSpeedMultiplier: speed };
    snap = WorkerMockService.enqueueGlobalTask(snap, {
      type: 'DATA_ANALYSIS',
      title: 'Speed Equivalence Analysis',
      priority: 'CRITICAL',
      durationSimMs: 3000,
    });
    snap = WorkerMockService.enqueueGlobalTask(snap, {
      type: 'QUICK_RESEARCH',
      title: 'Speed Equivalence Research',
      priority: 'HIGH',
      durationSimMs: 2000,
    });
    return snap;
  };

  let snap1x = buildSeededQueue(1);
  for (let i = 0; i < 4; i++) {
    snap1x = SimulationEngine.advanceByWallClockDelta(snap1x, 500);
  }

  let snap2x = buildSeededQueue(2);
  for (let i = 0; i < 2; i++) {
    snap2x = SimulationEngine.advanceByWallClockDelta(snap2x, 500);
  }

  let snap4x = buildSeededQueue(4);
  snap4x = SimulationEngine.advanceByWallClockDelta(snap4x, 500);

  assert.equal(snap1x.simTimeMs, 2000);
  assert.equal(snap2x.simTimeMs, 2000);
  assert.equal(snap4x.simTimeMs, 2000);
  assert.deepEqual({ ...snap2x, simSpeedMultiplier: 1 }, snap1x);
  assert.deepEqual({ ...snap4x, simSpeedMultiplier: 1 }, snap1x);

  // resetToBaseline clears scheduler, tasks, events, and worker activeTaskIds
  const reset = SimulationEngine.resetToBaseline(987654);
  assert.deepEqual(reset.scheduler, { entries: [], nextSequence: 1 });
  assert.deepEqual(reset.tasks, {});
  assert.deepEqual(reset.events, []);
  for (const wId of reset.workerOrder) {
    assert.deepEqual(reset.workers[wId]!.activeTaskIds, []);
    assert.equal(reset.workers[wId]!.currentTaskId, null);
  }
});

test('RT-12. Global 12-tick demo generator enqueues unpinned task and waiting global tasks claim freed workers before demo filler', () => {
  // 1. With empty global queue, tick 12 enqueues an unpinned global demo task and immediately dispatches it
  let baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  for (let tick = 1; tick <= 12; tick++) {
    baseline = SimulationEngine.stepSimulationTick(baseline, FIXED_TICK_SIM_MS);
  }
  assert.equal(baseline.tickCount, 12);
  assert.equal(Object.keys(baseline.tasks).length, 1);
  assert.equal(baseline.scheduler?.entries.length, 0);

  const [demoTask] = Object.values(baseline.tasks);
  assert.ok(demoTask);
  assert.ok(demoTask.id.startsWith('tsk_pool_'));
  assert.ok(demoTask.assignedWorkerId !== null);
  assert.equal(demoTask.lifecycleStatus, 'RUNNING');

  // 2. If only opus is in workerOrder and a global COMPLEX_REASONING task is queued before tick 12:
  // At tick 12, demo generator enqueues a demo task (queue length reaches 2).
  // Then Step 4 dispatches the higher-priority CRITICAL task to opus, leaving the demo task in the global queue!
  let singleWorkerSnap = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  singleWorkerSnap = {
    ...singleWorkerSnap,
    tickCount: 11,
    simTimeMs: 5500,
    workerOrder: ['opus'],
  };
  singleWorkerSnap = WorkerMockService.enqueueGlobalTask(singleWorkerSnap, {
    type: 'COMPLEX_REASONING',
    title: 'Queued Priority Work Before Tick 12',
    priority: 'CRITICAL',
  });
  const queuedGlobalId = singleWorkerSnap.scheduler!.entries[0]!.taskId;

  singleWorkerSnap = SimulationEngine.stepSimulationTick(
    singleWorkerSnap,
    FIXED_TICK_SIM_MS,
  );
  assert.equal(singleWorkerSnap.tickCount, 12);
  assert.equal(singleWorkerSnap.workers.opus.currentTaskId, queuedGlobalId);
  // Demo task remained safely in queue behind higher-priority task; opus was not stolen by demo generator!
  assert.equal(singleWorkerSnap.scheduler?.entries.length, 1);
});

test('TV-1. Validation of all 14 GLOBAL_DEMO_TASK_TEMPLATES against TaskType, category, capabilities, and unassigned creation', () => {
  assert.equal(GLOBAL_DEMO_TASK_TEMPLATES.length, 14);
  const baseline = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  for (const template of GLOBAL_DEMO_TASK_TEMPLATES) {
    // 1. TaskType must be one of the canonical TASK_TYPES
    assert.equal(
      (TASK_TYPES as readonly string[]).includes(template.type),
      true,
      `Invalid TaskType: ${template.type}`,
    );

    // 2. Category must strictly match mapTaskTypeToCategory(type)
    assert.equal(
      template.category,
      mapTaskTypeToCategory(template.type),
      `Category mismatch for ${template.type}`,
    );

    // 3. At least one worker has an active capability for the template's TaskType
    const supportingWorkers = getWorkersSupportingTaskType(template.type);
    assert.ok(
      supportingWorkers.length >= 1,
      `No supporting workers for ${template.type}`,
    );

    // 4. Factory creates a valid unassigned QUEUED TaskEntity with pool ID
    const entity = WorkerMockService.createGlobalTaskEntity(baseline, template);
    assert.equal(entity.assignedWorkerId, null);
    assert.equal(entity.status, 'QUEUED');
    assert.equal(entity.lifecycleStatus, 'QUEUED');
    assert.equal(entity.type, template.type);
    assert.equal(entity.category, template.category);
    assert.ok(entity.id.startsWith('tsk_pool_'));
    assert.equal(validateTaskEntity(entity).valid, true);

    // 5. enqueueGlobalTask succeeds and adds to scheduler.entries
    const enqueuedSnapshot = WorkerMockService.enqueueGlobalTask(baseline, template);
    assert.equal(enqueuedSnapshot.scheduler?.entries.length, 1);
    assert.equal(enqueuedSnapshot.events[0]?.type, 'TASK_QUEUED');
    assert.equal(enqueuedSnapshot.events[0]?.workerId, null);
  }
});

test('DM-1. Global demo task generation at tick 12 produces unpinned QUEUED task with tsk_pool ID', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  assert.equal(Object.keys(snapshot.tasks).length, 0);

  // Advance 11 ticks (5500ms): zero demo tasks generated before tick 12
  for (let tick = 1; tick <= 11; tick++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    assert.equal(Object.keys(snapshot.tasks).length, 0);
    assert.equal(snapshot.scheduler?.entries.length, 0);
  }

  // Tick 12 (6000ms): demo generator triggers
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.tickCount, 12);
  assert.equal(Object.keys(snapshot.tasks).length, 1);

  const [createdTask] = Object.values(snapshot.tasks);
  assert.ok(createdTask);
  assert.ok(createdTask.id.startsWith('tsk_pool_'));
  assert.equal(createdTask.createdAt, 6000);
  assert.equal(createdTask.status, createdTask.stagePipeline[0]!.status);
  assert.equal(createdTask.lifecycleStatus, 'RUNNING');
});

test('DM-2. Same-tick enqueue and dispatch: task enters queue in Step 3 and dispatches to idle worker in Step 4 of tick 12', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  // Advance to tick 12
  for (let tick = 1; tick <= 12; tick++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }

  // Because all workers are IDLE at baseline, the enqueued demo task was immediately dispatched on tick 12
  assert.equal(snapshot.scheduler?.entries.length, 0);
  assert.equal(snapshot.events.length, 2);

  // Event sequence on tick 12: TASK_QUEUED followed by TASK_STARTED
  const startedEvent = snapshot.events[0]!;
  const queuedEvent = snapshot.events[1]!;
  assert.equal(startedEvent.type, 'TASK_STARTED');
  assert.equal(queuedEvent.type, 'TASK_QUEUED');
  assert.equal(queuedEvent.workerId, null);
  assert.equal(queuedEvent.workerName, 'Task Dispatcher');
  assert.equal(startedEvent.taskId, queuedEvent.taskId);
  assert.notEqual(startedEvent.id, queuedEvent.id);
  assert.equal(startedEvent.simTimestampMs, 6000);
  assert.equal(queuedEvent.simTimestampMs, 6000);

  const assignedWorker = snapshot.workers[startedEvent.workerId!];
  assert.ok(assignedWorker);
  assert.equal(assignedWorker.status, 'TASK_RECEIVED');
  assert.equal(assignedWorker.currentTaskId, startedEvent.taskId);
});

test('DM-3. Capability-based worker selection: demo tasks match worker capabilities without worker pinning', () => {

  // Test across distinct template types to verify appropriate worker selection
  for (const template of GLOBAL_DEMO_TASK_TEMPLATES) {
    let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
    snapshot = WorkerMockService.enqueueGlobalTask(snapshot, template);
    const taskId = snapshot.scheduler!.entries[0]!.taskId;

    snapshot = WorkerMockService.dispatchGlobalQueue(snapshot);
    const dispatchedTask = snapshot.tasks[taskId]!;
    assert.ok(dispatchedTask.assignedWorkerId);

    const capableWorkers = getWorkersSupportingTaskType(template.type).map((p) => p.workerId);
    assert.ok(
      (capableWorkers as readonly string[]).includes(dispatchedTask.assignedWorkerId!),
      `Worker ${dispatchedTask.assignedWorkerId} is not capable for ${template.type}`,
    );
  }
});

test('DM-4. Queue cap guardrail enforcement (DEMO_MAX_QUEUE_CAP = 3) when all workers are busy', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  // Pause all workers so that NO tasks can ever be dispatched
  for (const workerId of snapshot.workerOrder) {
    snapshot = SimulationEngine.pauseWorker(snapshot, workerId);
  }

  // Pre-seed the global queue to the cap: DEMO_MAX_QUEUE_CAP (3)
  for (let i = 0; i < DEMO_MAX_QUEUE_CAP; i++) {
    snapshot = WorkerMockService.enqueueGlobalTask(snapshot, {
      type: 'QUICK_RESEARCH',
      title: `Pre-fill Task #${i + 1}`,
      priority: 'NORMAL',
    });
  }
  assert.equal(snapshot.scheduler?.entries.length, 3);
  const eventsCountBefore = snapshot.events.length;

  // Run through ticks 1 to 48 (covering tick 12, 24, 36, 48)
  for (let tick = 1; tick <= 48; tick++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    assert.equal(
      snapshot.scheduler?.entries.length,
      3,
      `Queue length exceeded cap at tick ${tick}`,
    );
  }

  // When queue cap prevented enqueue, NO new TASK_QUEUED events were emitted
  assert.equal(snapshot.events.length, eventsCountBefore);
  assert.equal(snapshot.scheduler?.entries.length, DEMO_MAX_QUEUE_CAP);
});

test('DM-5. Seeded replay determinism: identical seeds produce bit-identical demo generation trajectories', () => {
  const runSimulation = (seed: number, ticks: number) => {
    let snap = SimulationEngine.resetToBaseline(seed);
    for (let t = 1; t <= ticks; t++) {
      snap = SimulationEngine.stepSimulationTick(snap, FIXED_TICK_SIM_MS);
    }
    return snap;
  };

  const seed = 889900;
  const runA = runSimulation(seed, 60); // 5 demo cycles (12, 24, 36, 48, 60)
  const runB = runSimulation(seed, 60);

  assert.equal(runA.simTimeMs, runB.simTimeMs);
  assert.equal(runA.prngState, runB.prngState);
  assert.equal(runA.tickCount, runB.tickCount);
  assert.deepEqual(runA.tasks, runB.tasks);
  assert.deepEqual(runA.scheduler, runB.scheduler);
  assert.deepEqual(
    runA.events.map((e) => ({ id: e.id, type: e.type, message: e.message })),
    runB.events.map((e) => ({ id: e.id, type: e.type, message: e.message })),
  );
});

test('DM-6. Legacy assignTask and boot initialization createInitialSnapshot remain fully compatible', () => {
  // Boot snapshot initialization still creates 9 tasks pre-assigned across workers
  const bootSnapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  assert.equal(Object.keys(bootSnapshot.tasks).length, 9);
  assert.equal(bootSnapshot.scheduler?.entries.length, 0);

  // Direct assignTask remains compatible for pinning tasks directly to worker queues
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'haiku' }, 0);
  assert.equal(snapshot.workers.haiku.status, 'TASK_RECEIVED');
  assert.ok(snapshot.workers.haiku.currentTaskId);

  // Queue a second legacy task on the same worker
  snapshot = WorkerMockService.assignTask(snapshot, { workerId: 'haiku' }, 1);
  assert.equal(snapshot.workers.haiku.taskQueueIds.length, 1);
});
