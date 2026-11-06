import assert from 'node:assert/strict';
import test from 'node:test';
import { createTaskEntity } from './task.factory';
import {
  ALLOWED_TASK_TRANSITIONS,
  canTransitionTaskStatus,
  isTerminalTaskStatus,
  TERMINAL_TASK_STATUSES,
  toTaskLifecycleStatus,
  transitionTaskStatus,
  validateTaskStatusTransition,
} from './task.transitions';
import { TASK_LIFECYCLE_STATUSES, TaskLifecycleStatus } from './task.types';
import { validateTaskEntity } from './task.validation';

/**
 * Automated Unit Tests for SIREADER Phase 2.1 — Task State Machine & Transitions
 * Covers all 5 mandatory requirements in Section 15.C:
 * 1. All valid transitions are accepted.
 * 2. All invalid transitions are rejected.
 * 3. Terminal states (`COMPLETED`, `CANCELLED`) cannot transition to any other state.
 * 4. Transition validation produces structured error objects.
 * 5. Failed transition never mutates the initial task state.
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
  // Phase 1.1 stage statuses map to RUNNING
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

  // Attempt illegal transition PENDING -> RUNNING
  const failedAttempt = transitionTaskStatus(originalTask, 'RUNNING', {
    simTimeMs: 2500,
    assignedWorkerId: 'haiku',
  });

  assert.equal(failedAttempt.ok, false);
  assert.ok(failedAttempt.error);
  assert.equal(failedAttempt.error.code, 'INVALID_STATUS_TRANSITION');

  // Verify the original object reference and contents are 100% untouched
  assert.equal(failedAttempt.task, originalTask);
  assert.equal(JSON.stringify(originalTask), snapshotBefore);
  assert.equal(originalTask.status, 'PENDING');
  assert.equal(originalTask.updatedAt, 1000);
  assert.equal(originalTask.startedAt, null);
});
