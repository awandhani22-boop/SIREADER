import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTaskEntity,
  createTaskEntitySafe,
  DeterministicTaskSequence,
  generateDeterministicTaskId,
} from './task.factory';
import { validateTaskEntity } from './task.validation';
import { SimulationEngine } from '../workers/simulation.engine';
import { TaskEntity } from '../workers/worker.types';

/**
 * Automated Unit Tests for SIREADER Phase 2.1 — Task Model, Validation & Deterministic Factory
 * Covers all 12 requirements in Section 15.B and all 4 requirements in Section 15.D:
 * B.1  Valid task passes validation.
 * B.2  Invalid priority is rejected.
 * B.3  Unknown task type is rejected.
 * B.4  maxAttempts <= 0 is rejected.
 * B.5  attemptCount < 0 is rejected.
 * B.6  attemptCount > maxAttempts is rejected.
 * B.7  Duplicate dependencyIds are rejected.
 * B.8  Self-dependency is rejected.
 * B.9  Invalid assignedWorkerId is rejected.
 * B.10 Invalid timestamp ordering / missing timestamps are rejected.
 * B.11 PENDING task with queuedAt !== null is rejected.
 * B.12 COMPLETED task without completedAt is rejected.
 * D.1  Same seed & sequence produce identical task IDs.
 * D.2  Resetting sequence generator restores identical ID sequence.
 * D.3  Default task fields are populated accurately.
 * D.4  Timestamps use simulation time (not wall-clock Date.now()).
 */

test('B.1 Valid TaskEntity created via factory passes all 17 validation rules', () => {
  const task = createTaskEntity({
    seed: 20261106,
    sequenceNumber: 1,
    simTimeMs: 1500,
    type: 'QUICK_RESEARCH',
    title: 'Scan G10 FX Session Headlines',
    description: 'Extract top 3 macro catalysts from simulated feed.',
    priority: 'HIGH',
    status: 'PENDING',
    assignedWorkerId: null,
  });

  const validation = validateTaskEntity(task);
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
});

test('B.2 Invalid priority is rejected with INVALID_PRIORITY', () => {
  const baseTask = createTaskEntity({
    simTimeMs: 1000,
    title: 'Priority Validation Check',
  });

  const invalidTask = {
    ...baseTask,
    priority: 'ULTRA_URGENT' as unknown as TaskEntity['priority'],
  };

  const result = validateTaskEntity(invalidTask);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'INVALID_PRIORITY'));
});

test('B.3 Unknown task type is rejected with UNKNOWN_TASK_TYPE', () => {
  const baseTask = createTaskEntity({
    simTimeMs: 1000,
    title: 'Type Validation Check',
  });

  const invalidTask = {
    ...baseTask,
    type: 'LIVE_MT5_ORDER_EXECUTION' as unknown as TaskEntity['type'],
  };

  const result = validateTaskEntity(invalidTask);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === 'UNKNOWN_TASK_TYPE'));
});

test('B.4 maxAttempts <= 0 is rejected with INVALID_MAX_ATTEMPTS', () => {
  const outcomeZero = createTaskEntitySafe({
    simTimeMs: 1000,
    title: 'Zero Max Attempts',
    maxAttempts: 0,
  });
  assert.equal(outcomeZero.valid, false);
  assert.ok(
    outcomeZero.validation.issues.some((i) => i.code === 'INVALID_MAX_ATTEMPTS'),
  );

  const outcomeNegative = createTaskEntitySafe({
    simTimeMs: 1000,
    title: 'Negative Max Attempts',
    maxAttempts: -2,
  });
  assert.equal(outcomeNegative.valid, false);
  assert.ok(
    outcomeNegative.validation.issues.some(
      (i) => i.code === 'INVALID_MAX_ATTEMPTS',
    ),
  );
});

test('B.5 attemptCount < 0 is rejected with NEGATIVE_ATTEMPT_COUNT', () => {
  const outcome = createTaskEntitySafe({
    simTimeMs: 1000,
    title: 'Negative Attempt Count',
    attemptCount: -1,
    maxAttempts: 3,
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some((i) => i.code === 'NEGATIVE_ATTEMPT_COUNT'),
  );
});

test('B.6 attemptCount > maxAttempts is rejected with ATTEMPT_COUNT_EXCEEDS_MAX', () => {
  const outcome = createTaskEntitySafe({
    simTimeMs: 1000,
    title: 'Exceeded Attempt Count',
    attemptCount: 4,
    maxAttempts: 3,
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some(
      (i) => i.code === 'ATTEMPT_COUNT_EXCEEDS_MAX',
    ),
  );
});

test('B.7 Duplicate dependencyIds are rejected with DUPLICATE_DEPENDENCY_IDS', () => {
  const outcome = createTaskEntitySafe({
    simTimeMs: 2000,
    title: 'Duplicate Dependencies Task',
    dependencyIds: ['tsk_upstream_1', 'tsk_upstream_2', 'tsk_upstream_1'],
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some((i) => i.code === 'DUPLICATE_DEPENDENCY_IDS'),
  );
});

test('B.8 Self-dependency is rejected with SELF_DEPENDENCY_DETECTED', () => {
  const outcome = createTaskEntitySafe({
    id: 'tsk_self_ref_100',
    simTimeMs: 2000,
    title: 'Self Dependent Task',
    dependencyIds: ['tsk_other_99', 'tsk_self_ref_100'],
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some((i) => i.code === 'SELF_DEPENDENCY_DETECTED'),
  );
});

test('B.9 Invalid assignedWorkerId is rejected with INVALID_ASSIGNED_WORKER_ID', () => {
  const outcome = createTaskEntitySafe({
    simTimeMs: 2000,
    title: 'Invalid Worker Reference Task',
    assignedWorkerId: 'non_existent_worker',
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some(
      (i) => i.code === 'INVALID_ASSIGNED_WORKER_ID',
    ),
  );
});

test('B.10 Invalid timestamp ordering (completedAt < startedAt, updatedAt < createdAt, RUNNING without startedAt) is rejected', () => {
  // Case 1: completedAt < startedAt
  const baseCompleted = createTaskEntity({
    simTimeMs: 5000,
    title: 'Completed Task',
    status: 'COMPLETED',
    startedAt: 4000,
    completedAt: 5000,
  });
  const invalidCompletedBeforeStarted: TaskEntity = {
    ...baseCompleted,
    startedAt: 5000,
    completedAt: 3500,
  };
  const res1 = validateTaskEntity(invalidCompletedBeforeStarted);
  assert.equal(res1.valid, false);
  assert.ok(
    res1.issues.some(
      (i) => i.code === 'INVALID_TIMESTAMP_ORDER_COMPLETED_BEFORE_STARTED',
    ),
  );

  // Case 2: updatedAt < createdAt
  const invalidUpdatedBeforeCreated: TaskEntity = {
    ...baseCompleted,
    createdAt: 5000,
    updatedAt: 2000,
  };
  const res2 = validateTaskEntity(invalidUpdatedBeforeCreated);
  assert.equal(res2.valid, false);
  assert.ok(
    res2.issues.some(
      (i) => i.code === 'INVALID_TIMESTAMP_ORDER_UPDATED_BEFORE_CREATED',
    ),
  );

  // Case 3: RUNNING without startedAt
  const invalidRunningWithoutStartedAt = createTaskEntitySafe({
    simTimeMs: 3000,
    title: 'Running Without StartedAt',
    status: 'RUNNING',
    startedAt: null,
  });
  assert.equal(invalidRunningWithoutStartedAt.valid, false);
  assert.ok(
    invalidRunningWithoutStartedAt.validation.issues.some(
      (i) => i.code === 'MISSING_STARTED_AT_TIMESTAMP',
    ),
  );
});

test('B.11 PENDING task with non-null queuedAt is rejected with PENDING_TASK_HAS_QUEUED_AT', () => {
  const outcome = createTaskEntitySafe({
    simTimeMs: 1000,
    title: 'Pending Task With QueuedAt',
    status: 'PENDING',
    queuedAt: 1000,
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some(
      (i) => i.code === 'PENDING_TASK_HAS_QUEUED_AT',
    ),
  );
});

test('B.12 COMPLETED task without completedAt is rejected with MISSING_COMPLETED_AT_TIMESTAMP', () => {
  const outcome = createTaskEntitySafe({
    simTimeMs: 4000,
    title: 'Completed Without Timestamp',
    status: 'COMPLETED',
    startedAt: 2000,
    completedAt: null,
  });
  assert.equal(outcome.valid, false);
  assert.ok(
    outcome.validation.issues.some(
      (i) => i.code === 'MISSING_COMPLETED_AT_TIMESTAMP',
    ),
  );
});

test('D.1 & D.2 Deterministic Task Factory produces identical IDs for same seed/sequence and restores sequence on reset', () => {
  const seqA = new DeterministicTaskSequence(20261106, 1);
  const seqB = new DeterministicTaskSequence(20261106, 1);

  const runA = [
    seqA.nextId(0),
    seqA.nextId(500),
    seqA.nextId(1000, 'haiku'),
  ];
  const runB = [
    seqB.nextId(0),
    seqB.nextId(500),
    seqB.nextId(1000, 'haiku'),
  ];

  assert.deepEqual(runA, runB);

  // Reset seqA and verify it produces the exact same sequence again
  seqA.reset();
  const runAfterReset = [
    seqA.nextId(0),
    seqA.nextId(500),
    seqA.nextId(1000, 'haiku'),
  ];
  assert.deepEqual(runAfterReset, runA);

  // Pure function check
  assert.equal(
    generateDeterministicTaskId({ seed: 42, sequenceNumber: 7, simTimeMs: 2500 }),
    generateDeterministicTaskId({ seed: 42, sequenceNumber: 7, simTimeMs: 2500 }),
  );
});

test('D.3 & D.4 Default fields and simulation timestamps are populated deterministically from SimulationEngine clock', () => {
  let snapshot = SimulationEngine.createBaselineSnapshot(20261106);
  snapshot = SimulationEngine.stepSimulationTick(snapshot, 500);
  snapshot = SimulationEngine.stepSimulationTick(snapshot, 500);
  assert.equal(snapshot.simTimeMs, 1000);

  const task = createTaskEntity({
    seed: snapshot.seed,
    sequenceNumber: 1,
    simTimeMs: snapshot.simTimeMs,
    type: 'DATA_ANALYSIS',
    title: 'Multi-Factor Correlation Check',
  });

  assert.equal(task.status, 'PENDING');
  assert.equal(task.lifecycleStatus, 'PENDING');
  assert.equal(task.priority, 'NORMAL');
  assert.equal(task.assignedWorkerId, null);
  assert.equal(task.parentTaskId, null);
  assert.deepEqual(task.dependencyIds, []);
  assert.equal(task.attemptCount, 0);
  assert.equal(task.maxAttempts, 3);
  assert.equal(task.result, null);
  assert.equal(task.error, null);
  assert.equal(task.createdAt, 1000);
  assert.equal(task.updatedAt, 1000);
  assert.equal(task.queuedAt, null);
  assert.equal(task.startedAt, null);
  assert.equal(task.completedAt, null);
  assert.equal(task.createdAtSimMs, 1000);
  assert.equal(task.isSimulated, true);
});
