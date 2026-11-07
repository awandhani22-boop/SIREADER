import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTaskEntity,
  createTaskEntitySafe,
  DeterministicTaskSequence,
  generateDeterministicTaskId,
} from './task.factory';
import { validateTaskEntity } from './task.validation';
import {
  createCustomCapabilityRegistry,
} from '../workers/worker.capabilities';
import { WorkerMockService } from '../workers/worker.mock-service';
import { WORKER_TASK_TEMPLATES } from '../workers/worker.registry';
import { SimulationEngine } from '../workers/simulation.engine';
import {
  PERMANENT_WORKER_IDS,
  TASK_EXECUTION_STAGE_STATUSES,
  TASK_LIFECYCLE_STATUSES,
  TaskEntity,
} from '../workers/worker.types';

/**
 * Automated Unit Tests for SIREADER Phase 2.1 + Audit Remediation
 * Covers:
 * - Section 15.B (12 task validation rules)
 * - Section 15.D (4 deterministic factory rules)
 * - Audit Finding 1 (status & lifecycleStatus consistency validation)
 * - Audit Finding 3 (capability validation & legacy template compatibility)
 * - Audit Finding 5 (deterministic task ID uniqueness & collision prevention)
 * - Section 8 (workerId & assignedWorkerId consistency)
 */

test('B.1 Valid TaskEntity created via factory passes all validation rules', () => {
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
    sequenceNumber: 1,
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
    sequenceNumber: 1,
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
    sequenceNumber: 1,
    simTimeMs: 1000,
    title: 'Zero Max Attempts',
    maxAttempts: 0,
  });
  assert.equal(outcomeZero.valid, false);
  assert.ok(
    outcomeZero.validation.issues.some((i) => i.code === 'INVALID_MAX_ATTEMPTS'),
  );

  const outcomeNegative = createTaskEntitySafe({
    sequenceNumber: 2,
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
    sequenceNumber: 1,
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
    sequenceNumber: 1,
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
    sequenceNumber: 1,
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
    sequenceNumber: 1,
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
  const baseCompleted = createTaskEntity({
    sequenceNumber: 1,
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

  const invalidRunningWithoutStartedAt = createTaskEntitySafe({
    sequenceNumber: 2,
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
    sequenceNumber: 1,
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
    sequenceNumber: 1,
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

  seqA.reset();
  const runAfterReset = [
    seqA.nextId(0),
    seqA.nextId(500),
    seqA.nextId(1000, 'haiku'),
  ];
  assert.deepEqual(runAfterReset, runA);

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

test('Audit Finding 1: validateTaskEntity enforces strict consistency between status and lifecycleStatus', () => {
  const base = createTaskEntity({
    sequenceNumber: 1,
    simTimeMs: 2000,
    title: 'Status Consistency Base',
    status: 'QUEUED',
  });

  // 1. Valid canonical status and lifecycleStatus
  for (const canonicalStatus of TASK_LIFECYCLE_STATUSES) {
    const candidate = createTaskEntity({
      sequenceNumber: 10,
      simTimeMs: 2000,
      title: `Canonical ${canonicalStatus}`,
      status: canonicalStatus,
    });
    assert.equal(candidate.lifecycleStatus, canonicalStatus);
    assert.equal(validateTaskEntity(candidate).valid, true);
  }

  // 2. Valid Phase 1.1 execution stages with lifecycleStatus === 'RUNNING'
  for (const stageStatus of TASK_EXECUTION_STAGE_STATUSES) {
    const stageTask = createTaskEntity({
      sequenceNumber: 20,
      simTimeMs: 2000,
      title: `Stage ${stageStatus}`,
      status: stageStatus,
    });
    assert.equal(stageTask.lifecycleStatus, 'RUNNING');
    assert.equal(validateTaskEntity(stageTask).valid, true);
  }

  // 3. QUEUED with lifecycleStatus RUNNING -> rejected
  const queuedWithRunning: TaskEntity = {
    ...base,
    status: 'QUEUED',
    lifecycleStatus: 'RUNNING',
    startedAt: 2000,
  };
  const resQueuedMismatch = validateTaskEntity(queuedWithRunning);
  assert.equal(resQueuedMismatch.valid, false);
  assert.ok(
    resQueuedMismatch.issues.some((i) => i.code === 'STATUS_LIFECYCLE_MISMATCH'),
  );

  // 4. RUNNING with lifecycleStatus QUEUED -> rejected
  const runningWithQueued: TaskEntity = {
    ...base,
    status: 'RUNNING',
    lifecycleStatus: 'QUEUED',
    startedAt: 2000,
  };
  const resRunningMismatch = validateTaskEntity(runningWithQueued);
  assert.equal(resRunningMismatch.valid, false);
  assert.ok(
    resRunningMismatch.issues.some((i) => i.code === 'STATUS_LIFECYCLE_MISMATCH'),
  );

  // 5. Invalid lifecycleStatus -> rejected with INVALID_LIFECYCLE_STATUS
  const invalidLifecycle: TaskEntity = {
    ...base,
    status: 'QUEUED',
    lifecycleStatus: 'ANALYZING' as unknown as TaskEntity['lifecycleStatus'],
  };
  const resInvalidLifecycle = validateTaskEntity(invalidLifecycle);
  assert.equal(resInvalidLifecycle.valid, false);
  assert.ok(
    resInvalidLifecycle.issues.some(
      (i) => i.code === 'INVALID_LIFECYCLE_STATUS',
    ),
  );

  // 6. COMPLETED with mismatched lifecycleStatus -> rejected
  const completedMismatch: TaskEntity = {
    ...base,
    status: 'COMPLETED',
    lifecycleStatus: 'RUNNING',
    startedAt: 1500,
    completedAt: 2000,
  };
  const resCompletedMismatch = validateTaskEntity(completedMismatch);
  assert.equal(resCompletedMismatch.valid, false);
  assert.ok(
    resCompletedMismatch.issues.some(
      (i) => i.code === 'STATUS_LIFECYCLE_MISMATCH',
    ),
  );
});

test('Audit Finding 3 & Section 8: Capability matching validation, workerId/assignedWorkerId consistency, and legacy template compatibility', () => {
  // 1. Haiku accepts QUICK_RESEARCH
  const haikuValid = createTaskEntitySafe({
    sequenceNumber: 1,
    simTimeMs: 1000,
    type: 'QUICK_RESEARCH',
    assignedWorkerId: 'haiku',
    title: 'Haiku Quick Research',
  });
  assert.equal(haikuValid.valid, true);

  // 2. Haiku rejects COMPLEX_REASONING
  const haikuInvalid = createTaskEntitySafe({
    sequenceNumber: 2,
    simTimeMs: 1000,
    type: 'COMPLEX_REASONING',
    assignedWorkerId: 'haiku',
    title: 'Haiku Unsupported Complex Reasoning',
  });
  assert.equal(haikuInvalid.valid, false);
  assert.ok(
    haikuInvalid.validation.issues.some(
      (i) => i.code === 'UNSUPPORTED_WORKER_CAPABILITY',
    ),
  );

  // 3. Opus accepts COMPLEX_REASONING
  const opusValid = createTaskEntitySafe({
    sequenceNumber: 3,
    simTimeMs: 1000,
    type: 'COMPLEX_REASONING',
    assignedWorkerId: 'opus',
    title: 'Opus Complex Reasoning',
  });
  assert.equal(opusValid.valid, true);

  // 4. Both Decision Engineer and Opus accept DECISION_EVALUATION
  const decEngEval = createTaskEntitySafe({
    sequenceNumber: 4,
    simTimeMs: 1000,
    type: 'DECISION_EVALUATION',
    assignedWorkerId: 'decision_engineer',
    title: 'Decision Engineer Eval',
  });
  const opusEval = createTaskEntitySafe({
    sequenceNumber: 5,
    simTimeMs: 1000,
    type: 'DECISION_EVALUATION',
    assignedWorkerId: 'opus',
    title: 'Opus Decision Eval',
  });
  assert.equal(decEngEval.valid, true);
  assert.equal(opusEval.valid, true);

  // 5. Disabled capability is rejected
  const customRegDisabledCap = createCustomCapabilityRegistry({
    disabledCapabilityIds: ['quick_research'],
  });
  const disabledCapOutcome = createTaskEntitySafe(
    {
      sequenceNumber: 6,
      simTimeMs: 1000,
      type: 'QUICK_RESEARCH',
      assignedWorkerId: 'haiku',
      title: 'Disabled Capability Task',
    },
    { capabilityRegistry: customRegDisabledCap },
  );
  assert.equal(disabledCapOutcome.valid, false);
  assert.ok(
    disabledCapOutcome.validation.issues.some(
      (i) => i.code === 'UNSUPPORTED_WORKER_CAPABILITY',
    ),
  );

  // 6. Disabled worker is rejected
  const customRegDisabledWorker = createCustomCapabilityRegistry({
    disabledWorkerIds: ['opus'],
  });
  const disabledWorkerOutcome = createTaskEntitySafe(
    {
      sequenceNumber: 7,
      simTimeMs: 1000,
      type: 'COMPLEX_REASONING',
      assignedWorkerId: 'opus',
      title: 'Disabled Worker Task',
    },
    { capabilityRegistry: customRegDisabledWorker },
  );
  assert.equal(disabledWorkerOutcome.valid, false);
  assert.ok(
    disabledWorkerOutcome.validation.issues.some(
      (i) => i.code === 'UNSUPPORTED_WORKER_CAPABILITY',
    ),
  );

  // 7. Unassigned task (assignedWorkerId: null) with any valid TaskType remains valid
  const unassignedComplex = createTaskEntitySafe({
    sequenceNumber: 8,
    simTimeMs: 1000,
    type: 'COMPLEX_REASONING',
    assignedWorkerId: null,
    title: 'Unassigned Complex Task',
  });
  assert.equal(unassignedComplex.valid, true);

  // 8. workerId vs assignedWorkerId mismatch is rejected with WORKER_ASSIGNMENT_MISMATCH
  const mismatchedWorkerTask: TaskEntity = {
    ...opusValid.task!,
    workerId: 'haiku',
    assignedWorkerId: 'opus',
  };
  const mismatchValidation = validateTaskEntity(mismatchedWorkerTask);
  assert.equal(mismatchValidation.valid, false);
  assert.ok(
    mismatchValidation.issues.some(
      (i) => i.code === 'WORKER_ASSIGNMENT_MISMATCH',
    ),
  );

  // 9. All legacy WORKER_TASK_TEMPLATES across all 7 workers remain 100% valid
  let snapshot = SimulationEngine.createBaselineSnapshot(20261106);
  for (const workerId of PERMANENT_WORKER_IDS) {
    const templates = WORKER_TASK_TEMPLATES[workerId];
    assert.ok(templates && templates.length > 0);
    for (let idx = 0; idx < templates.length; idx++) {
      const entity = WorkerMockService.createTaskEntity(
        snapshot,
        { workerId },
        idx,
      );
      snapshot = {
        ...snapshot,
        tasks: { ...snapshot.tasks, [entity.id]: entity },
      };
      const check = validateTaskEntity(entity);
      assert.equal(
        check.valid,
        true,
        `Legacy template #${idx} for ${workerId} failed validation: ${JSON.stringify(check.issues)}`,
      );
      assert.equal(entity.workerId, workerId);
      assert.equal(entity.assignedWorkerId, workerId);
    }
  }
});

test('Audit Finding 5: Deterministic Task ID uniqueness prevents silent collisions at the same simulation timestamp', () => {
  const sequence = new DeterministicTaskSequence(20261106, 1);

  // Two tasks created at the exact same simulation time (simTimeMs = 1000) via sequence receive distinct IDs
  const task1 = createTaskEntity({
    sequence,
    simTimeMs: 1000,
    title: 'Concurrent Sim Time Task 1',
  });
  const task2 = createTaskEntity({
    sequence,
    simTimeMs: 1000,
    title: 'Concurrent Sim Time Task 2',
  });
  assert.notEqual(task1.id, task2.id);

  // Passing ONLY existingTaskIds without id, sequenceNumber, or sequence is rejected so repeated calls
  // with an un-updated existingTaskIds collection can never silently generate duplicate IDs
  const existingIds = new Set<string>([task1.id]);
  assert.throws(() => {
    createTaskEntity({
      seed: 20261106,
      simTimeMs: 1000,
      title: 'Task With Only Existing IDs Context (No Sequence)',
      existingTaskIds: existingIds,
    });
  }, /Deterministic task creation requires an explicit id, sequenceNumber, or DeterministicTaskSequence instance\. existingTaskIds is reserved strictly for duplicate ID validation\./);

  const safeOnlyExistingOutcome = createTaskEntitySafe({
    seed: 20261106,
    simTimeMs: 1000,
    title: 'Safe Call With Only Existing IDs Context',
    existingTaskIds: existingIds,
  });
  assert.equal(safeOnlyExistingOutcome.valid, false);
  assert.ok(
    safeOnlyExistingOutcome.validation.issues.some(
      (i) => i.code === 'INVALID_TASK_ID',
    ),
  );

  // Calling createTaskEntity without id, sequenceNumber, or sequence throws a clear deterministic error
  assert.throws(() => {
    createTaskEntity({
      simTimeMs: 1000,
      title: 'Missing Deterministic Identity Context',
    });
  }, /Deterministic task creation requires an explicit id, sequenceNumber, or DeterministicTaskSequence instance/);

  // Duplicate ID against existingTaskIds is rejected with DUPLICATE_TASK_ID
  const duplicateAttempt = createTaskEntitySafe(
    {
      id: task1.id,
      simTimeMs: 1000,
      title: 'Duplicate Task ID Attempt',
    },
    { existingTaskIds: [task1.id] },
  );
  assert.equal(duplicateAttempt.valid, false);
  assert.ok(
    duplicateAttempt.validation.issues.some(
      (i) => i.code === 'DUPLICATE_TASK_ID',
    ),
  );
});
