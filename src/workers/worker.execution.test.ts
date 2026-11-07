import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from './simulation.engine';
import { withTaskActivated } from './worker.concurrency';
import {
  deriveAnimationForWorker,
  resolveTaskStageStatus,
  WorkerMockService,
} from './worker.mock-service';
import type { SimulationSnapshot, TaskEntity } from './worker.types';
import { activateQueuedTaskForExecution } from '../tasks/task.transitions';

/**
 * Helper to create and activate two concurrent tasks on `haiku` (`maxConcurrency = 2`)
 * and place `haiku` into `BUSY` status at desk.
 */
function createTwoActiveTasksOnHaiku(options?: {
  firstDurationSimMs?: number;
  secondDurationSimMs?: number;
  firstTargetTokens?: number;
  secondTargetTokens?: number;
}): {
  snapshot: SimulationSnapshot;
  task1Id: string;
  task2Id: string;
} {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  const task1Queued = WorkerMockService.createTaskEntity(
    snapshot,
    {
      workerId: 'haiku',
      title: 'Concurrent Primary Task Alpha',
      durationSimMs: options?.firstDurationSimMs ?? 4000,
      targetTokens: options?.firstTargetTokens ?? 1000,
    },
    0,
  );
  snapshot = {
    ...snapshot,
    tasks: {
      ...snapshot.tasks,
      [task1Queued.id]: task1Queued,
    },
  };

  const task2Queued = WorkerMockService.createTaskEntity(
    snapshot,
    {
      workerId: 'haiku',
      title: 'Concurrent Secondary Task Beta',
      durationSimMs: options?.secondDurationSimMs ?? 4000,
      targetTokens: options?.secondTargetTokens ?? 2000,
    },
    1,
  );
  snapshot = {
    ...snapshot,
    tasks: {
      ...snapshot.tasks,
      [task2Queued.id]: task2Queued,
    },
  };

  const act1 = activateQueuedTaskForExecution(
    task1Queued,
    resolveTaskStageStatus(task1Queued, 0),
    {
      simTimeMs: snapshot.simTimeMs,
      assignedWorkerId: 'haiku',
    },
  );
  assert.equal(act1.ok, true);

  const act2 = activateQueuedTaskForExecution(
    task2Queued,
    resolveTaskStageStatus(task2Queued, 0),
    {
      simTimeMs: snapshot.simTimeMs,
      assignedWorkerId: 'haiku',
    },
  );
  assert.equal(act2.ok, true);

  const t1: TaskEntity = act1.runningTask;
  const t2: TaskEntity = act2.runningTask;

  const haikuWithBoth = withTaskActivated(
    withTaskActivated(snapshot.workers.haiku, t1.id),
    t2.id,
  );

  snapshot = {
    ...snapshot,
    tasks: {
      ...snapshot.tasks,
      [t1.id]: t1,
      [t2.id]: t2,
    },
    workers: {
      ...snapshot.workers,
      haiku: {
        ...haikuWithBoth,
        status: 'BUSY',
        transitionSimMs: 0,
        position3D: [...haikuWithBoth.homePosition3D],
        animationState: deriveAnimationForWorker('BUSY', t1.status),
      },
    },
  };

  return {
    snapshot,
    task1Id: t1.id,
    task2Id: t2.id,
  };
}

test('1. Single active task progresses exactly as before', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'opus',
    title: 'Single Active Baseline Task',
    durationSimMs: 4000,
    targetTokens: 1200,
  });

  const taskId = snapshot.workers.opus.currentTaskId!;
  assert.ok(taskId);
  assert.deepEqual(snapshot.workers.opus.activeTaskIds, [taskId]);

  // Advance through TASK_RECEIVED (1000ms) + WALKING (1500ms) = 5 ticks (2500ms)
  for (let i = 0; i < 5; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }
  assert.equal(snapshot.workers.opus.status, 'BUSY');
  assert.equal(snapshot.tasks[taskId].elapsedSimMs, 0);

  // Step once in BUSY (500ms out of 4000ms = 12.5%)
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  const taskAfter1BusyTick = snapshot.tasks[taskId];
  assert.equal(taskAfter1BusyTick.elapsedSimMs, 500);
  assert.equal(taskAfter1BusyTick.progress, 12.5);
  assert.equal(taskAfter1BusyTick.simulatedTokens, 150);
  assert.equal(snapshot.workers.opus.metrics.simulatedTokens, 150);
});

test('2. Two active tasks on haiku both advance elapsedSimMs, progress, simulatedTokens, and simulatedCostUsd in the same BUSY tick', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku({
    firstDurationSimMs: 4000,
    secondDurationSimMs: 5000,
    firstTargetTokens: 1000,
    secondTargetTokens: 2000,
  });

  const next = SimulationEngine.stepSimulationTick(initial, FIXED_TICK_SIM_MS);
  const t1 = next.tasks[task1Id];
  const t2 = next.tasks[task2Id];
  const haiku = next.workers.haiku;

  // Task 1: 500 / 4000 = 12.5%, tokens = round(0.125 * 1000) = 125
  assert.equal(t1.elapsedSimMs, 500);
  assert.equal(t1.progress, 12.5);
  assert.equal(t1.simulatedTokens, 125);
  assert.ok(t1.simulatedCostUsd > 0);

  // Task 2: 500 / 5000 = 10%, tokens = round(0.10 * 2000) = 200
  assert.equal(t2.elapsedSimMs, 500);
  assert.equal(t2.progress, 10);
  assert.equal(t2.simulatedTokens, 200);
  assert.ok(t2.simulatedCostUsd > 0);

  // Worker metrics accumulate both deltas in the same tick (125 + 200 = 325)
  assert.equal(haiku.metrics.simulatedTokens, 325);
  assert.equal(
    haiku.metrics.simulatedCostUsd,
    Number((t1.simulatedCostUsd + t2.simulatedCostUsd).toFixed(6)),
  );
  assert.equal(haiku.status, 'BUSY');
  assert.deepEqual(haiku.activeTaskIds, [task1Id, task2Id]);
  assert.equal(haiku.currentTaskId, task1Id);
});

test('3. Completing the primary task while a secondary task remains keeps the worker BUSY and promotes the remaining task to currentTaskId', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  const afterCompletePrimary = WorkerMockService.completeTask(
    initial,
    'haiku',
    task1Id,
  );
  const haiku = afterCompletePrimary.workers.haiku;

  assert.equal(afterCompletePrimary.tasks[task1Id].status, 'COMPLETED');
  assert.equal(afterCompletePrimary.tasks[task1Id].progress, 100);
  assert.equal(haiku.status, 'BUSY');
  assert.deepEqual(haiku.activeTaskIds, [task2Id]);
  assert.equal(haiku.currentTaskId, task2Id);
  assert.equal(haiku.metrics.completedTasksCount, 1);
  assert.deepEqual(haiku.completedTaskIds, [task1Id]);
});

test('4. Completing a secondary task while the primary task remains keeps the primary task as currentTaskId and keeps the worker BUSY', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  const afterCompleteSecondary = WorkerMockService.completeTask(
    initial,
    'haiku',
    task2Id,
  );
  const haiku = afterCompleteSecondary.workers.haiku;

  assert.equal(afterCompleteSecondary.tasks[task2Id].status, 'COMPLETED');
  assert.equal(afterCompleteSecondary.tasks[task2Id].progress, 100);
  assert.equal(haiku.status, 'BUSY');
  assert.deepEqual(haiku.activeTaskIds, [task1Id]);
  assert.equal(haiku.currentTaskId, task1Id);
  assert.equal(haiku.metrics.completedTasksCount, 1);
  assert.deepEqual(haiku.completedTaskIds, [task2Id]);
});

test('5. Completing the final active task transitions the worker to COMPLETED, clears activeTaskIds, and sets currentTaskId = null', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  const afterFirst = WorkerMockService.completeTask(initial, 'haiku', task1Id);
  const afterSecond = WorkerMockService.completeTask(afterFirst, 'haiku', task2Id);
  const haiku = afterSecond.workers.haiku;

  assert.equal(haiku.status, 'COMPLETED');
  assert.equal(haiku.transitionSimMs, 0);
  assert.deepEqual(haiku.activeTaskIds, []);
  assert.equal(haiku.currentTaskId, null);
  assert.equal(haiku.metrics.completedTasksCount, 2);
  assert.deepEqual(haiku.completedTaskIds, [task2Id, task1Id]);
});

test('6. Failing the primary task while a secondary task remains keeps the worker BUSY and promotes the remaining task to currentTaskId', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  const afterFailPrimary = WorkerMockService.failTask(initial, 'haiku', task1Id, {
    code: 'EXECUTION_TIMEOUT_SIMULATED',
  });
  const haiku = afterFailPrimary.workers.haiku;

  assert.equal(afterFailPrimary.tasks[task1Id].status, 'FAILED');
  assert.equal(afterFailPrimary.tasks[task1Id].error?.code, 'EXECUTION_TIMEOUT_SIMULATED');
  assert.equal(haiku.status, 'BUSY');
  assert.deepEqual(haiku.activeTaskIds, [task2Id]);
  assert.equal(haiku.currentTaskId, task2Id);
  assert.equal(haiku.metrics.errorCount, 1);
});

test('7. Failing a secondary task while the primary task remains keeps the primary task as currentTaskId and keeps the worker BUSY', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  const afterFailSecondary = WorkerMockService.failTask(
    initial,
    'haiku',
    task2Id,
    { code: 'EXECUTION_FAILURE_SIMULATED' },
  );
  const haiku = afterFailSecondary.workers.haiku;

  assert.equal(afterFailSecondary.tasks[task2Id].status, 'FAILED');
  assert.equal(afterFailSecondary.tasks[task2Id].error?.code, 'EXECUTION_FAILURE_SIMULATED');
  assert.equal(haiku.status, 'BUSY');
  assert.deepEqual(haiku.activeTaskIds, [task1Id]);
  assert.equal(haiku.currentTaskId, task1Id);
  assert.equal(haiku.metrics.errorCount, 1);
});

test('8. Failing the final active task transitions the worker to IDLE, clears activeTaskIds, and sets currentTaskId = null', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  const afterFirst = WorkerMockService.failTask(initial, 'haiku', task1Id);
  const afterSecond = WorkerMockService.failTask(afterFirst, 'haiku', task2Id);
  const haiku = afterSecond.workers.haiku;

  assert.equal(haiku.status, 'IDLE');
  assert.equal(haiku.transitionSimMs, 0);
  assert.deepEqual(haiku.activeTaskIds, []);
  assert.equal(haiku.currentTaskId, null);
  assert.equal(haiku.metrics.errorCount, 2);
});

test('9. Calling completeTask or failTask with an inactive or unknown taskId returns the original snapshot reference unchanged', () => {
  const { snapshot: initial } = createTwoActiveTasksOnHaiku();

  const queuedExtra = WorkerMockService.createTaskEntity(
    initial,
    {
      workerId: 'haiku',
      title: 'Inactive Queued Task',
    },
    0,
  );
  const withQueuedTask: SimulationSnapshot = {
    ...initial,
    tasks: {
      ...initial.tasks,
      [queuedExtra.id]: queuedExtra,
    },
    workers: {
      ...initial.workers,
      haiku: {
        ...initial.workers.haiku,
        taskQueueIds: [queuedExtra.id],
      },
    },
  };

  // Unknown task ID
  assert.strictEqual(
    WorkerMockService.completeTask(withQueuedTask, 'haiku', 'tsk_does_not_exist'),
    withQueuedTask,
  );
  assert.strictEqual(
    WorkerMockService.failTask(withQueuedTask, 'haiku', 'tsk_does_not_exist'),
    withQueuedTask,
  );

  // Known task ID that is QUEUED (not active)
  assert.strictEqual(
    WorkerMockService.completeTask(withQueuedTask, 'haiku', queuedExtra.id),
    withQueuedTask,
  );
  assert.strictEqual(
    WorkerMockService.failTask(withQueuedTask, 'haiku', queuedExtra.id),
    withQueuedTask,
  );
});

test('10. completeCurrentTask and failCurrentTask remain compatible with existing callers', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku();

  // completeCurrentTask completes currentTaskId (task1Id) and promotes task2Id
  const afterCompleteCurrent = WorkerMockService.completeCurrentTask(
    initial,
    'haiku',
  );
  assert.equal(afterCompleteCurrent.tasks[task1Id].status, 'COMPLETED');
  assert.equal(afterCompleteCurrent.workers.haiku.status, 'BUSY');
  assert.equal(afterCompleteCurrent.workers.haiku.currentTaskId, task2Id);
  assert.deepEqual(afterCompleteCurrent.workers.haiku.activeTaskIds, [task2Id]);

  // failCurrentTask fails the new currentTaskId (task2Id) and transitions worker to IDLE
  const afterFailCurrent = WorkerMockService.failCurrentTask(
    afterCompleteCurrent,
    'haiku',
    { code: 'EXECUTION_TIMEOUT_SIMULATED' },
  );
  assert.equal(afterFailCurrent.tasks[task2Id].status, 'FAILED');
  assert.equal(afterFailCurrent.workers.haiku.status, 'IDLE');
  assert.equal(afterFailCurrent.workers.haiku.currentTaskId, null);
  assert.deepEqual(afterFailCurrent.workers.haiku.activeTaskIds, []);
});

test('11. Worker metrics accumulate across both active tasks without overwriting the earlier task delta in the same tick', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku({
    firstDurationSimMs: 2000,
    secondDurationSimMs: 2000,
    firstTargetTokens: 800,
    secondTargetTokens: 1200,
  });

  // 1 tick = 500ms = 25% of 2000ms for both tasks
  // Task 1 delta = 200 tokens; Task 2 delta = 300 tokens; Total worker delta = 500 tokens
  const afterTick1 = SimulationEngine.stepSimulationTick(
    initial,
    FIXED_TICK_SIM_MS,
  );
  assert.equal(afterTick1.tasks[task1Id].simulatedTokens, 200);
  assert.equal(afterTick1.tasks[task2Id].simulatedTokens, 300);
  assert.equal(afterTick1.workers.haiku.metrics.simulatedTokens, 500);

  const expectedCost = Number(
    (
      afterTick1.tasks[task1Id].simulatedCostUsd +
      afterTick1.tasks[task2Id].simulatedCostUsd
    ).toFixed(6),
  );
  assert.equal(afterTick1.workers.haiku.metrics.simulatedCostUsd, expectedCost);
});

test('12. Same-tick dual completion: two active tasks reaching 100% on the same tick both complete in activation order', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku({
    firstDurationSimMs: 500,
    secondDurationSimMs: 500,
    firstTargetTokens: 400,
    secondTargetTokens: 600,
  });

  const afterTick = SimulationEngine.stepSimulationTick(
    initial,
    FIXED_TICK_SIM_MS,
  );
  const haiku = afterTick.workers.haiku;

  // Both tasks are COMPLETED
  assert.equal(afterTick.tasks[task1Id].status, 'COMPLETED');
  assert.equal(afterTick.tasks[task2Id].status, 'COMPLETED');

  // Worker ends the tick in COMPLETED with activeTaskIds: [] and currentTaskId: null
  assert.equal(haiku.status, 'COMPLETED');
  assert.deepEqual(haiku.activeTaskIds, []);
  assert.equal(haiku.currentTaskId, null);

  // completedTasksCount increments by 2 and tokens/costs include both tasks (400 + 600 = 1000)
  assert.equal(haiku.metrics.completedTasksCount, 2);
  assert.equal(haiku.metrics.simulatedTokens, 1000);
  assert.equal(
    haiku.metrics.simulatedCostUsd,
    Number(
      (
        afterTick.tasks[task1Id].simulatedCostUsd +
        afterTick.tasks[task2Id].simulatedCostUsd
      ).toFixed(6),
    ),
  );

  // Both TASK_COMPLETED events are emitted in activation order (prepend log -> latest first: task2Id at [0], task1Id at [1])
  const completedEvents = afterTick.events.filter(
    (e) => e.type === 'TASK_COMPLETED' && e.workerId === 'haiku',
  );
  assert.equal(completedEvents.length, 2);
  assert.equal(completedEvents[1].taskId, task1Id);
  assert.equal(completedEvents[0].taskId, task2Id);
  assert.notEqual(
    completedEvents[0].id,
    completedEvents[1].id,
    'Same-tick TASK_COMPLETED events must have distinct event IDs',
  );

  const allEventIds = afterTick.events.map((e) => e.id);
  const uniqueEventIds = new Set(allEventIds);
  assert.equal(
    uniqueEventIds.size,
    allEventIds.length,
    'Event log must not contain duplicate event IDs after same-tick dual completion',
  );
  assert.deepEqual(haiku.completedTaskIds, [task2Id, task1Id]);
});

test('13. Reverse completion order: secondary task (activeTaskIds[1]) has shorter remaining duration and completes on an earlier tick than primary task (activeTaskIds[0])', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku({
    firstDurationSimMs: 1500, // Primary needs 3 ticks (1500ms)
    secondDurationSimMs: 500, // Secondary needs 1 tick (500ms)
    firstTargetTokens: 900,
    secondTargetTokens: 500,
  });

  // Tick 1 (500ms): primary progresses to 33.33%, secondary completes at 100%
  const afterTick1 = SimulationEngine.stepSimulationTick(
    initial,
    FIXED_TICK_SIM_MS,
  );
  const haikuAfterTick1 = afterTick1.workers.haiku;

  assert.equal(afterTick1.tasks[task2Id].status, 'COMPLETED');
  assert.equal(afterTick1.tasks[task2Id].progress, 100);
  assert.notEqual(afterTick1.tasks[task1Id].status, 'COMPLETED');
  assert.equal(afterTick1.tasks[task1Id].elapsedSimMs, 500);
  assert.equal(afterTick1.tasks[task1Id].progress, 33.33);

  // Primary task remains currentTaskId and worker stays BUSY
  assert.equal(haikuAfterTick1.status, 'BUSY');
  assert.equal(haikuAfterTick1.currentTaskId, task1Id);
  assert.deepEqual(haikuAfterTick1.activeTaskIds, [task1Id]);
  assert.equal(haikuAfterTick1.metrics.completedTasksCount, 1);

  // Tick 2 (1000ms): primary progresses to 66.67%
  const afterTick2 = SimulationEngine.stepSimulationTick(
    afterTick1,
    FIXED_TICK_SIM_MS,
  );
  assert.equal(afterTick2.workers.haiku.status, 'BUSY');
  assert.equal(afterTick2.workers.haiku.currentTaskId, task1Id);
  assert.equal(afterTick2.tasks[task1Id].elapsedSimMs, 1000);
  assert.equal(afterTick2.tasks[task1Id].progress, 66.67);

  // Tick 3 (1500ms): primary completes -> worker transitions to COMPLETED
  const afterTick3 = SimulationEngine.stepSimulationTick(
    afterTick2,
    FIXED_TICK_SIM_MS,
  );
  const haikuAfterTick3 = afterTick3.workers.haiku;
  assert.equal(afterTick3.tasks[task1Id].status, 'COMPLETED');
  assert.equal(haikuAfterTick3.status, 'COMPLETED');
  assert.deepEqual(haikuAfterTick3.activeTaskIds, []);
  assert.equal(haikuAfterTick3.currentTaskId, null);
  assert.equal(haikuAfterTick3.metrics.completedTasksCount, 2);
  assert.equal(haikuAfterTick3.metrics.simulatedTokens, 1400);
});

test('14. Multi-task worker pause & resume: pausing a worker freezes elapsedSimMs and progress for both active tasks, and resuming continues both tasks', () => {
  const { snapshot: initial, task1Id, task2Id } = createTwoActiveTasksOnHaiku({
    firstDurationSimMs: 4000,
    secondDurationSimMs: 5000,
    firstTargetTokens: 1000,
    secondTargetTokens: 2000,
  });

  // Advance 1 tick while BUSY so both tasks have non-zero progress
  let snapshot = SimulationEngine.stepSimulationTick(initial, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.tasks[task1Id].elapsedSimMs, 500);
  assert.equal(snapshot.tasks[task1Id].progress, 12.5);
  assert.equal(snapshot.tasks[task2Id].elapsedSimMs, 500);
  assert.equal(snapshot.tasks[task2Id].progress, 10);

  // Pause haiku
  snapshot = SimulationEngine.pauseWorker(snapshot, 'haiku');
  assert.equal(snapshot.workers.haiku.status, 'PAUSED');
  assert.equal(snapshot.workers.haiku.statusBeforePause, 'BUSY');
  assert.deepEqual(snapshot.workers.haiku.activeTaskIds, [task1Id, task2Id]);
  assert.equal(snapshot.workers.haiku.currentTaskId, task1Id);

  // Advance 4 simulation ticks while haiku is PAUSED
  for (let i = 0; i < 4; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }

  // Both active tasks on haiku must remain completely frozen
  assert.equal(snapshot.workers.haiku.status, 'PAUSED');
  assert.equal(snapshot.tasks[task1Id].elapsedSimMs, 500);
  assert.equal(snapshot.tasks[task1Id].progress, 12.5);
  assert.equal(snapshot.tasks[task2Id].elapsedSimMs, 500);
  assert.equal(snapshot.tasks[task2Id].progress, 10);

  // Resume haiku and step 1 tick -> both tasks must resume and advance by +500ms
  snapshot = SimulationEngine.resumeWorker(snapshot, 'haiku');
  assert.equal(snapshot.workers.haiku.status, 'BUSY');
  assert.deepEqual(snapshot.workers.haiku.activeTaskIds, [task1Id, task2Id]);
  assert.equal(snapshot.workers.haiku.currentTaskId, task1Id);

  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.tasks[task1Id].elapsedSimMs, 1000);
  assert.equal(snapshot.tasks[task1Id].progress, 25);
  assert.equal(snapshot.tasks[task2Id].elapsedSimMs, 1000);
  assert.equal(snapshot.tasks[task2Id].progress, 20);
});
