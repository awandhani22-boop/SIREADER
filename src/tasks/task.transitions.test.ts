import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskEntity } from './task.factory';
import {
  activateQueuedTaskForExecution,
  ALLOWED_TASK_TRANSITIONS,
  canTransitionTaskStatus,
  isTerminalTaskStatus,
  TERMINAL_TASK_STATUSES,
  toTaskLifecycleStatus,
  transitionTaskStatus,
  updateTaskExecutionStage,
  validateTaskStatusTransition,
} from './task.transitions';
import { TASK_LIFECYCLE_STATUSES, TaskLifecycleStatus } from './task.types';
import { validateTaskEntity } from './task.validation';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  SimulationEngine,
} from '../workers/simulation.engine';
import { WorkerMockService } from '../workers/worker.mock-service';

/**
 * Automated Unit & Integration Tests for SIREADER Phase 2.1 + Audit Remediation
 * Covers:
 * - Section 15.C (5 state machine transition rules)
 * - Audit Finding 2 (10 runtime transition & stage progression integration checks)
 */

const EXPECTED_VALID_PAIRS: ReadonlyArray<readonly [TaskLifecycleStatus, TaskLifecycleStatus]> = [
  ['PENDING', 'QUEUED'],
  ['PENDING', 'CANCELLED'],
  ['QUEUED', 'ASSIGNED'],
  ['QUEUED', 'CANCELLED'],
  ['QUEUED', 'BLOCKED'],
  ['ASSIGNED', 'RUNNING'],
  ['ASSIGNED', 'QUEUED'],
  ['ASSIGNED', 'CANCELLED'],
  ['RUNNING', 'COMPLETED'],
  ['RUNNING', 'FAILED'],
  ['RUNNING', 'CANCELLED'],
  ['RUNNING', 'RETRY_WAIT'],
  ['FAILED', 'RETRY_WAIT'],
  ['RETRY_WAIT', 'QUEUED'],
  ['RETRY_WAIT', 'CANCELLED'],
  ['BLOCKED', 'QUEUED'],
  ['BLOCKED', 'CANCELLED'],
];

test('C.1 All official valid lifecycle transitions in Phase 2.1 are accepted and maintain valid TaskEntity timestamps', () => {
  for (const [fromStatus, toStatus] of EXPECTED_VALID_PAIRS) {
    assert.equal(
      canTransitionTaskStatus(fromStatus, toStatus),
      true,
      `Expected ${fromStatus} -> ${toStatus} to be allowed`,
    );
    const outcome = validateTaskStatusTransition(
      fromStatus,
      toStatus,
      'tsk_test_1',
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.error, null);
  }

  // Verify end-to-end lifecycle walk on a TaskEntity:
  // PENDING -> QUEUED -> ASSIGNED -> RUNNING -> FAILED -> RETRY_WAIT -> QUEUED -> ASSIGNED -> RUNNING -> COMPLETED
  const initialTask = createTaskEntity({
    id: 'tsk_lifecycle_walk',
    simTimeMs: 1000,
    type: 'DATA_ANALYSIS',
    title: 'Lifecycle State Machine Walk',
    status: 'PENDING',
  });

  const step1 = transitionTaskStatus(initialTask, 'QUEUED', { simTimeMs: 1500 });
  assert.equal(step1.ok, true);
  assert.equal(step1.task.status, 'QUEUED');
  assert.equal(step1.task.queuedAt, 1500);
  assert.equal(validateTaskEntity(step1.task).valid, true);

  const step2 = transitionTaskStatus(step1.task, 'ASSIGNED', {
    simTimeMs: 2000,
    assignedWorkerId: 'sonnet',
  });
  assert.equal(step2.ok, true);
  assert.equal(step2.task.status, 'ASSIGNED');
  assert.equal(step2.task.assignedWorkerId, 'sonnet');
  assert.equal(step2.task.workerId, 'sonnet');
  assert.equal(validateTaskEntity(step2.task).valid, true);

  const step3 = transitionTaskStatus(step2.task, 'RUNNING', { simTimeMs: 2500 });
  assert.equal(step3.ok, true);
  assert.equal(step3.task.status, 'RUNNING');
  assert.equal(step3.task.startedAt, 2500);
  assert.equal(step3.task.attemptCount, 1);
  assert.equal(validateTaskEntity(step3.task).valid, true);

  const step4 = transitionTaskStatus(step3.task, 'FAILED', { simTimeMs: 3000 });
  assert.equal(step4.ok, true);
  assert.equal(step4.task.status, 'FAILED');
  assert.ok(step4.task.error);
  assert.equal(validateTaskEntity(step4.task).valid, true);

  const step5 = transitionTaskStatus(step4.task, 'RETRY_WAIT', {
    simTimeMs: 3500,
  });
  assert.equal(step5.ok, true);
  assert.equal(step5.task.status, 'RETRY_WAIT');
  assert.equal(validateTaskEntity(step5.task).valid, true);

  const step6 = transitionTaskStatus(step5.task, 'QUEUED', { simTimeMs: 4000 });
  assert.equal(step6.ok, true);
  assert.equal(step6.task.status, 'QUEUED');

  const step7 = transitionTaskStatus(step6.task, 'ASSIGNED', {
    simTimeMs: 4500,
    assignedWorkerId: 'sonnet',
  });
  assert.equal(step7.ok, true);

  const step8 = transitionTaskStatus(step7.task, 'RUNNING', { simTimeMs: 5000 });
  assert.equal(step8.ok, true);
  assert.equal(step8.task.attemptCount, 2);

  const step9 = transitionTaskStatus(step8.task, 'COMPLETED', {
    simTimeMs: 6500,
  });
  assert.equal(step9.ok, true);
  assert.equal(step9.task.status, 'COMPLETED');
  assert.equal(step9.task.completedAt, 6500);
  assert.equal(step9.task.progress, 100);
  assert.ok(step9.task.result);
  assert.equal(validateTaskEntity(step9.task).valid, true);
});

test('C.2 All invalid transitions across the 9x9 lifecycle state matrix are rejected', () => {
  const validKeySet = new Set(
    EXPECTED_VALID_PAIRS.map(([from, to]) => `${from}->${to}`),
  );

  for (const fromStatus of TASK_LIFECYCLE_STATUSES) {
    for (const toStatus of TASK_LIFECYCLE_STATUSES) {
      const pairKey = `${fromStatus}->${toStatus}`;
      if (!validKeySet.has(pairKey)) {
        assert.equal(
          canTransitionTaskStatus(fromStatus, toStatus),
          false,
          `Expected invalid transition ${pairKey} to be rejected`,
        );
        const validation = validateTaskStatusTransition(
          fromStatus,
          toStatus,
          'tsk_matrix_check',
        );
        assert.equal(validation.ok, false);
        assert.ok(validation.error);
      }
    }
  }
});

test('C.3 Terminal states (COMPLETED and CANCELLED) cannot transition to any state', () => {
  for (const terminal of TERMINAL_TASK_STATUSES) {
    assert.equal(isTerminalTaskStatus(terminal), true);
    assert.deepEqual(ALLOWED_TASK_TRANSITIONS[terminal], []);

    for (const target of TASK_LIFECYCLE_STATUSES) {
      assert.equal(canTransitionTaskStatus(terminal, target), false);
      const outcome = validateTaskStatusTransition(
        terminal,
        target,
        'tsk_terminal_check',
      );
      assert.equal(outcome.ok, false);
      assert.ok(outcome.error);
      assert.equal(outcome.error.code, 'TERMINAL_STATUS_IMMUTABLE');
    }
  }
});

test('C.4 Transition validation returns structured TaskTransitionError and supports Phase 1.1 stage mapping', () => {
  assert.equal(toTaskLifecycleStatus('ROUTING'), 'RUNNING');
  assert.equal(toTaskLifecycleStatus('EXTRACTING'), 'RUNNING');
  assert.equal(toTaskLifecycleStatus('ANALYZING'), 'RUNNING');
  assert.equal(toTaskLifecycleStatus('VALIDATING'), 'RUNNING');
  assert.equal(toTaskLifecycleStatus('ARCHIVING'), 'RUNNING');

  const invalidOutcome = validateTaskStatusTransition(
    'PENDING',
    'COMPLETED',
    'tsk_err_struct',
  );
  assert.equal(invalidOutcome.ok, false);
  assert.ok(invalidOutcome.error);
  assert.equal(invalidOutcome.error.code, 'INVALID_STATUS_TRANSITION');
  assert.equal(invalidOutcome.error.taskId, 'tsk_err_struct');
  assert.equal(invalidOutcome.error.fromStatus, 'PENDING');
  assert.equal(invalidOutcome.error.fromLifecycleStatus, 'PENDING');
  assert.equal(invalidOutcome.error.toStatus, 'COMPLETED');
  assert.equal(invalidOutcome.error.toLifecycleStatus, 'COMPLETED');
  assert.deepEqual(invalidOutcome.error.allowedTargets, ['QUEUED', 'CANCELLED']);
  assert.ok(invalidOutcome.error.message.includes('PENDING'));
});

test('C.5 Failed transition does not mutate initial TaskEntity state', () => {
  const originalTask = createTaskEntity({
    id: 'tsk_immutable_check',
    simTimeMs: 1000,
    type: 'QUICK_RESEARCH',
    title: 'Immutability Verification Task',
    status: 'PENDING',
    dependencyIds: ['tsk_dep_1'],
  });

  const snapshotBefore = JSON.stringify(originalTask);

  const failedAttempt = transitionTaskStatus(originalTask, 'RUNNING', {
    simTimeMs: 2500,
    assignedWorkerId: 'haiku',
  });

  assert.equal(failedAttempt.ok, false);
  assert.ok(failedAttempt.error);
  assert.equal(failedAttempt.error.code, 'INVALID_STATUS_TRANSITION');
  assert.equal(failedAttempt.task, originalTask);
  assert.equal(JSON.stringify(originalTask), snapshotBefore);
  assert.equal(originalTask.status, 'PENDING');
  assert.equal(originalTask.updatedAt, 1000);
  assert.equal(originalTask.startedAt, null);
});

test('Audit Finding 2 (Part A): activateQueuedTaskForExecution and updateTaskExecutionStage enforce QUEUED -> ASSIGNED -> RUNNING and intra-RUNNING stage safety', () => {
  const queuedTask = createTaskEntity({
    id: 'tsk_runtime_activate',
    simTimeMs: 1000,
    type: 'DATA_ANALYSIS',
    assignedWorkerId: 'sonnet',
    title: 'Sonnet Runtime Activation Test',
    status: 'QUEUED',
  });

  // 1. Direct QUEUED -> RUNNING via transitionTaskStatus is rejected (cannot skip ASSIGNED)
  const directSkip = transitionTaskStatus(queuedTask, 'RUNNING', {
    simTimeMs: 1500,
    assignedWorkerId: 'sonnet',
  });
  assert.equal(directSkip.ok, false);
  assert.equal(directSkip.error?.code, 'INVALID_STATUS_TRANSITION');

  // 2. Canonical activation transitions QUEUED -> ASSIGNED -> RUNNING (via EXTRACTING stage)
  const activation = activateQueuedTaskForExecution(queuedTask, 'EXTRACTING', {
    simTimeMs: 1500,
    assignedWorkerId: 'sonnet',
  });
  assert.equal(activation.ok, true);
  assert.deepEqual(activation.transitionHistory, ['QUEUED', 'ASSIGNED', 'RUNNING']);
  assert.equal(activation.assignedTask.status, 'ASSIGNED');
  assert.equal(activation.assignedTask.lifecycleStatus, 'ASSIGNED');
  assert.equal(activation.runningTask.status, 'EXTRACTING');
  assert.equal(activation.runningTask.lifecycleStatus, 'RUNNING');
  assert.equal(activation.runningTask.createdAt, 1000);
  assert.equal(activation.runningTask.queuedAt, 1000);
  assert.equal(activation.runningTask.startedAt, 1500);
  assert.equal(activation.runningTask.updatedAt, 1500);
  assert.equal(activation.runningTask.attemptCount, 1);
  assert.equal(validateTaskEntity(activation.runningTask).valid, true);

  // 3. Intra-RUNNING stage progression via updateTaskExecutionStage keeps lifecycleStatus === 'RUNNING'
  const stageStep = updateTaskExecutionStage(activation.runningTask, 'ANALYZING', {
    simTimeMs: 2500,
    elapsedSimMs: 1000,
    progress: 40,
    simulatedTokens: 400,
    simulatedCostUsd: 0.0012,
  });
  assert.equal(stageStep.ok, true);
  assert.equal(stageStep.task.status, 'ANALYZING');
  assert.equal(stageStep.task.lifecycleStatus, 'RUNNING');
  assert.equal(stageStep.task.updatedAt, 2500);
  assert.equal(stageStep.task.progress, 40);
  assert.equal(validateTaskEntity(stageStep.task).valid, true);

  // 4. updateTaskExecutionStage rejects non-RUNNING tasks or non-stage targets without mutating input
  const beforeQueuedJson = JSON.stringify(queuedTask);
  const invalidStageOnQueued = updateTaskExecutionStage(queuedTask, 'ANALYZING', {
    simTimeMs: 2000,
  });
  assert.equal(invalidStageOnQueued.ok, false);
  assert.equal(invalidStageOnQueued.error?.code, 'INVALID_EXECUTION_STAGE_UPDATE');
  assert.equal(JSON.stringify(queuedTask), beforeQueuedJson);

  const invalidNonStageTarget = updateTaskExecutionStage(
    stageStep.task,
    'COMPLETED',
    { simTimeMs: 3000 },
  );
  assert.equal(invalidNonStageTarget.ok, false);
  assert.equal(invalidNonStageTarget.error?.code, 'INVALID_EXECUTION_STAGE_UPDATE');
});

test('Audit Finding 2 (Part B): Full SimulationEngine & WorkerMockService runtime integration (promotion timestamps, completion, failure, pause/resume, FIFO)', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(DEFAULT_SIMULATION_SEED);

  // At t = 0, assign Task 1 to haiku (starts immediately via QUEUED -> ASSIGNED -> ROUTING/RUNNING)
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'haiku',
    title: 'Runtime Task 1',
    durationSimMs: 2000,
    targetTokens: 500,
  });
  const task1Id = snapshot.workers.haiku.currentTaskId!;
  const task1Initial = snapshot.tasks[task1Id];
  assert.equal(task1Initial.lifecycleStatus, 'RUNNING');
  assert.equal(task1Initial.createdAt, 0);
  assert.equal(task1Initial.queuedAt, 0);
  assert.equal(task1Initial.startedAt, 0);
  assert.equal(validateTaskEntity(task1Initial).valid, true);

  // Advance 1 tick (t = 500ms) and queue Task 2 & Task 3 on haiku
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.simTimeMs, 500);

  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'haiku',
    title: 'Runtime Task 2 (Queued)',
    durationSimMs: 2000,
  });
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'haiku',
    title: 'Runtime Task 3 (Queued)',
    durationSimMs: 2000,
  });

  const [task2Id, task3Id] = snapshot.workers.haiku.taskQueueIds;
  const task2Queued = snapshot.tasks[task2Id];
  const task3Queued = snapshot.tasks[task3Id];

  // Queued tasks remain valid in QUEUED with createdAt=500, queuedAt=500, startedAt=null
  assert.equal(task2Queued.status, 'QUEUED');
  assert.equal(task2Queued.lifecycleStatus, 'QUEUED');
  assert.equal(task2Queued.createdAt, 500);
  assert.equal(task2Queued.queuedAt, 500);
  assert.equal(task2Queued.startedAt, null);
  assert.equal(validateTaskEntity(task2Queued).valid, true);
  assert.equal(validateTaskEntity(task3Queued).valid, true);

  // Worker Pause & Resume on haiku must not corrupt task lifecycleStatus
  snapshot = SimulationEngine.pauseWorker(snapshot, 'haiku');
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.tasks[task1Id].lifecycleStatus, 'RUNNING');
  assert.equal(snapshot.tasks[task2Id].lifecycleStatus, 'QUEUED');
  snapshot = SimulationEngine.resumeWorker(snapshot, 'haiku');
  assert.equal(snapshot.tasks[task1Id].lifecycleStatus, 'RUNNING');

  // Global Pause must freeze progress and keep all task entities valid
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  const simTimeBeforeGlobalPause = snapshot.simTimeMs;
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  assert.equal(snapshot.simTimeMs, simTimeBeforeGlobalPause);
  snapshot = SimulationEngine.setGlobalPaused(snapshot, false);

  // Step until Task 1 completes and Task 2 is promoted from the FIFO queue
  for (let i = 0; i < 20; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    if (snapshot.workers.haiku.currentTaskId === task2Id) {
      break;
    }
  }

  // Verify Task 1 completed cleanly via state machine
  const task1Completed = snapshot.tasks[task1Id];
  assert.equal(task1Completed.status, 'COMPLETED');
  assert.equal(task1Completed.lifecycleStatus, 'COMPLETED');
  assert.equal(task1Completed.progress, 100);
  assert.ok(task1Completed.completedAt !== null && task1Completed.completedAt > 0);
  assert.ok(task1Completed.result !== null);
  assert.equal(validateTaskEntity(task1Completed).valid, true);

  // Verify Task 2 was promoted in FIFO order and preserved createdAt=500, queuedAt=500 while setting startedAt > 500
  const task2Promoted = snapshot.tasks[task2Id];
  assert.equal(snapshot.workers.haiku.currentTaskId, task2Id);
  assert.deepEqual(snapshot.workers.haiku.taskQueueIds, [task3Id]);
  assert.equal(task2Promoted.lifecycleStatus, 'RUNNING');
  assert.equal(task2Promoted.createdAt, 500);
  assert.equal(task2Promoted.queuedAt, 500);
  assert.ok(task2Promoted.startedAt !== null && task2Promoted.startedAt > 500);
  assert.equal(validateTaskEntity(task2Promoted).valid, true);

  // Test runtime failure via WorkerMockService.failCurrentTask on Task 2
  snapshot = WorkerMockService.failCurrentTask(snapshot, 'haiku', {
    code: 'EXECUTION_TIMEOUT_SIMULATED',
    message: 'Simulated timeout during Task 2',
  });
  const task2Failed = snapshot.tasks[task2Id];
  assert.equal(task2Failed.status, 'FAILED');
  assert.equal(task2Failed.lifecycleStatus, 'FAILED');
  assert.equal(task2Failed.error?.code, 'EXECUTION_TIMEOUT_SIMULATED');
  assert.equal(validateTaskEntity(task2Failed).valid, true);
});
