import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  MAX_DELTA_CLAMP_MS,
  SimulationEngine,
} from './simulation.engine';
import { WorkerMockService } from './worker.mock-service';

test('1. Initial registry contains all 7 SIREADER workers with SIMULATED metrics', () => {
  const snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  assert.equal(snapshot.workerOrder.length, 7);
  assert.deepEqual(snapshot.workerOrder, [
    'supervisor',
    'haiku',
    'sonnet',
    'opus',
    'decision_engineer',
    'market_monitor',
    'data_archivist',
  ]);

  for (const workerId of snapshot.workerOrder) {
    const worker = snapshot.workers[workerId];
    assert.ok(worker, `Worker ${workerId} should exist`);
    assert.equal(worker.metrics.isSimulated, true);
    assert.equal(worker.avatarConfig.fallbackType, 'articulated-humanoid');
  }
});

test('2. Worker and Task entities are distinct: BUSY worker can have active task and QUEUED tasks', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);

  // Assign two additional tasks to sonnet (who already has 1 active and 1 queued)
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'sonnet',
    title: 'Queued Reasoning Task Alpha',
  });
  snapshot = WorkerMockService.assignTask(snapshot, {
    workerId: 'sonnet',
    title: 'Queued Reasoning Task Beta',
  });

  const sonnet = snapshot.workers.sonnet;
  assert.equal(sonnet.status, 'BUSY');
  assert.ok(sonnet.currentTaskId, 'Sonnet should have an active task');

  const activeTask = snapshot.tasks[sonnet.currentTaskId];
  assert.notEqual(activeTask.status, 'QUEUED');
  assert.ok(sonnet.taskQueueIds.length >= 2, 'Sonnet should hold multiple queued tasks');

  for (const queuedId of sonnet.taskQueueIds) {
    const queuedTask = snapshot.tasks[queuedId];
    assert.equal(queuedTask.status, 'QUEUED');
    assert.equal(queuedTask.progress, 0);
  }
});

test('3. Deterministic seeded simulation produces identical state across runs', () => {
  let runA = SimulationEngine.createInitialSnapshot(998877);
  let runB = SimulationEngine.createInitialSnapshot(998877);

  for (let i = 0; i < 20; i++) {
    runA = SimulationEngine.stepSimulationTick(runA, FIXED_TICK_SIM_MS);
    runB = SimulationEngine.stepSimulationTick(runB, FIXED_TICK_SIM_MS);
  }

  assert.equal(runA.simTimeMs, runB.simTimeMs);
  assert.equal(runA.prngState, runB.prngState);
  assert.equal(
    runA.workers.haiku.metrics.simulatedTokens,
    runB.workers.haiku.metrics.simulatedTokens,
  );
  assert.equal(runA.events.length, runB.events.length);
});

test('4. Simulation clock clamps large wall-clock lag so tasks never skip stages uncontrollably', () => {
  const initial = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  const startSimTime = initial.simTimeMs;

  // Simulate a 45-second browser tab freeze (45000ms)
  const afterLag = SimulationEngine.advanceByWallClockDelta(initial, 45000);

  // Should clamp delta to MAX_DELTA_CLAMP_MS * simSpeedMultiplier
  assert.equal(
    afterLag.simTimeMs - startSimTime,
    MAX_DELTA_CLAMP_MS * initial.simSpeedMultiplier,
  );
});

test('5. Worker Pause freezes ONLY that worker while others continue, and Resume preserves exact task progress', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);

  const sonnetBeforePause = snapshot.workers.sonnet;
  assert.equal(sonnetBeforePause.status, 'BUSY');
  assert.ok(sonnetBeforePause.currentTaskId);

  const sonnetTaskBefore = snapshot.tasks[sonnetBeforePause.currentTaskId];
  const preservedProgress = sonnetTaskBefore.progress;
  const preservedElapsed = sonnetTaskBefore.elapsedSimMs;

  const opusBefore = snapshot.workers.opus;
  assert.ok(opusBefore.currentTaskId);
  const opusProgressBefore = snapshot.tasks[opusBefore.currentTaskId].progress;

  // Pause ONLY sonnet
  snapshot = SimulationEngine.pauseWorker(snapshot, 'sonnet');
  assert.equal(snapshot.workers.sonnet.status, 'PAUSED');

  // Advance simulation by 4 ticks (2000ms)
  for (let i = 0; i < 4; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  }

  // Sonnet's active task must not have progressed at all
  const sonnetTaskDuringPause = snapshot.tasks[sonnetBeforePause.currentTaskId];
  assert.equal(sonnetTaskDuringPause.progress, preservedProgress);
  assert.equal(sonnetTaskDuringPause.elapsedSimMs, preservedElapsed);

  // Meanwhile, Opus (not paused) MUST have progressed
  const opusTaskAfterTicks = snapshot.tasks[opusBefore.currentTaskId];
  assert.ok(
    opusTaskAfterTicks.progress > opusProgressBefore,
    'Unpaused worker Opus should continue progressing while Sonnet is paused',
  );

  // Now Resume Sonnet -> must resume from preservedProgress, NOT reset to 0
  snapshot = SimulationEngine.resumeWorker(snapshot, 'sonnet');
  assert.equal(snapshot.workers.sonnet.status, 'BUSY');
  const sonnetTaskAfterResume = snapshot.tasks[sonnetBeforePause.currentTaskId];
  assert.equal(sonnetTaskAfterResume.progress, preservedProgress);
  assert.equal(sonnetTaskAfterResume.elapsedSimMs, preservedElapsed);

  // Tick once more -> Sonnet now advances beyond preservedProgress
  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  const sonnetTaskNextTick = snapshot.tasks[sonnetBeforePause.currentTaskId];
  assert.ok(sonnetTaskNextTick.progress > preservedProgress);
});

test('6. Global Pause stops the entire simulation clock for all workers', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  snapshot = SimulationEngine.setGlobalPaused(snapshot, true);
  assert.equal(snapshot.isGlobalPaused, true);

  const timeBefore = snapshot.simTimeMs;
  const opusTaskBefore = snapshot.tasks[snapshot.workers.opus.currentTaskId!].progress;

  snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
  snapshot = SimulationEngine.advanceByWallClockDelta(snapshot, 1000);

  assert.equal(snapshot.simTimeMs, timeBefore);
  assert.equal(
    snapshot.tasks[snapshot.workers.opus.currentTaskId!].progress,
    opusTaskBefore,
  );
});

test('7. Task Progress drives deterministic Task Status transitions across stage pipeline', () => {
  let snapshot = SimulationEngine.createInitialSnapshot(DEFAULT_SIMULATION_SEED);
  const opusTaskId = snapshot.workers.opus.currentTaskId!;
  assert.ok(opusTaskId);

  const observedStages = new Set<string>();
  observedStages.add(snapshot.tasks[opusTaskId].status);

  // Advance until Opus finishes the task
  for (let i = 0; i < 40; i++) {
    snapshot = SimulationEngine.stepSimulationTick(snapshot, FIXED_TICK_SIM_MS);
    const task = snapshot.tasks[opusTaskId];
    observedStages.add(task.status);
    if (task.status === 'COMPLETED') break;
  }

  // Escalation pipeline has ROUTING -> ANALYZING -> VALIDATING -> ARCHIVING -> COMPLETED
  assert.ok(observedStages.has('ANALYZING'), 'Should pass through ANALYZING stage');
  assert.ok(observedStages.has('VALIDATING'), 'Should pass through VALIDATING stage');
  assert.ok(observedStages.has('ARCHIVING'), 'Should pass through ARCHIVING stage');
  assert.ok(observedStages.has('COMPLETED'), 'Should reach COMPLETED stage at 100%');
  assert.equal(snapshot.tasks[opusTaskId].progress, 100);
});
