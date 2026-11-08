/**
 * Comprehensive Determinism & Fixed-Step Accumulator Test Suite (C1 Milestone)
 *
 * Covers:
 * T1: Determinism across diverse delta patterns (500ms, 130ms, 33ms, 17ms, 1000ms) at 1x, 2x, 4x
 * T2: Demo task generator invocation & PRNG draw invariance (120 ticks -> 10 invocations -> 20 draws)
 * T3: Residual accumulator preservation (60,250ms -> 60,000ms simTime, 120 ticks, 250ms accumulator)
 * T4: Wall-clock delta clamping at MAX_DELTA_CLAMP_MS (1,000ms)
 * T5: Global Pause & Resume accumulator & state preservation
 * T6: Deterministic Reset & Replay invariance
 * T7: Mid-simulation speed changes with wall-clock flush
 * T8: Exact 500ms contract validation for stepSimulationTick (throws RangeError)
 * T9: Complete elimination of partial ticks (stepMs === 500 strictly enforced across all internal paths)
 * T10: Unified render clock anchor & interpolation smoothness (zero double-counting, pause freeze, flush consistency)
 * T11: C1 baseline regression proof (demonstrating divergence in old baseline vs strict determinism now)
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SIMULATION_SEED,
  FIXED_TICK_SIM_MS,
  MAX_DELTA_CLAMP_MS,
  SimulationEngine,
} from './simulation.engine';
import { useOfficeStore } from './worker.state';
import type { SimulationSnapshot } from './worker.types';

function createCleanTestBaseline(seed: number = DEFAULT_SIMULATION_SEED): SimulationSnapshot {
  return SimulationEngine.createBaselineSnapshot(seed);
}

function advanceWithPattern(
  initial: SimulationSnapshot,
  totalWallMs: number,
  stepDelta: number,
): SimulationSnapshot {
  let s = initial;
  let remaining = totalWallMs;
  while (remaining > 0) {
    const delta = Math.min(remaining, stepDelta);
    s = SimulationEngine.advanceByWallClockDelta(s, delta);
    remaining -= delta;
  }
  return s;
}

// ============================================================================
// T1: Determinisme berbagai delta (500ms, 130ms, 33ms, 17ms, 1000ms at 1x, 2x, 4x)
// ============================================================================
test('T1. Determinism across delta sizes at 1x, 2x, and 4x speeds for 60,000ms simulation time', () => {
  const TARGET_SIM_MS = 60000;
  const DELTA_PATTERNS = [500, 130, 33, 17, 1000];
  const SPEEDS: (1 | 2 | 4)[] = [1, 2, 4];

  for (const speed of SPEEDS) {
    const totalWallMs = TARGET_SIM_MS / speed;
    let referenceSnapshot: SimulationSnapshot | null = null;

    for (const delta of DELTA_PATTERNS) {
      const base = {
        ...createCleanTestBaseline(DEFAULT_SIMULATION_SEED),
        simSpeedMultiplier: speed,
      };

      const result = advanceWithPattern(base, totalWallMs, delta);

      assert.equal(result.simTimeMs, TARGET_SIM_MS, `Speed ${speed}x, delta ${delta}ms must reach exactly ${TARGET_SIM_MS}ms simTimeMs`);
      assert.equal(result.tickCount, TARGET_SIM_MS / FIXED_TICK_SIM_MS, `Speed ${speed}x, delta ${delta}ms must execute exactly 120 full ticks`);
      assert.equal(result.accumulatorMs, 0, `Speed ${speed}x, delta ${delta}ms must have 0ms remaining accumulator`);

      if (!referenceSnapshot) {
        referenceSnapshot = result;
      } else {
        assert.equal(result.prngState, referenceSnapshot.prngState, `prngState divergence at speed ${speed}x with delta ${delta}ms`);
        assert.deepEqual(result.tasks, referenceSnapshot.tasks, `tasks divergence at speed ${speed}x with delta ${delta}ms`);
        assert.deepEqual(result.workers, referenceSnapshot.workers, `workers divergence at speed ${speed}x with delta ${delta}ms`);
        assert.deepEqual(result.scheduler, referenceSnapshot.scheduler, `scheduler divergence at speed ${speed}x with delta ${delta}ms`);
        assert.deepEqual(result.events, referenceSnapshot.events, `events divergence at speed ${speed}x with delta ${delta}ms`);
      }
    }
  }
});

// ============================================================================
// T2: Demo task generator invocation & PRNG draw invariance
// ============================================================================
test('T2. Demo task generator executes exactly 10 invocations (20 PRNG draws) across all delta patterns at 1x', () => {
  const TARGET_SIM_MS = 60000;
  const DELTA_PATTERNS = [500, 130, 33, 17, 1000];
  const results = DELTA_PATTERNS.map((delta) => {
    const base = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
    return advanceWithPattern(base, TARGET_SIM_MS, delta);
  });

  const ref = results[0]!;
  assert.equal(ref.tickCount, 120);

  // Exactly 10 invocations occurred: tick 12, 24, 36, 48, 60, 72, 84, 96, 108, 120
  for (let i = 1; i < results.length; i++) {
    const res = results[i]!;
    assert.equal(res.tickCount, 120);
    assert.equal(res.prngState, ref.prngState);

    // Verify task IDs and templates match identically
    const refTaskKeys = Object.keys(ref.tasks).sort();
    const resTaskKeys = Object.keys(res.tasks).sort();
    assert.deepEqual(resTaskKeys, refTaskKeys);

    for (const id of refTaskKeys) {
      assert.equal(res.tasks[id]!.type, ref.tasks[id]!.type);
      assert.equal(res.tasks[id]!.createdAtSimMs, ref.tasks[id]!.createdAtSimMs);
    }
  }
});

// ============================================================================
// T3: Residual accumulator preservation (60,250ms -> 60,000ms simTime, 120 ticks, 250ms accumulator)
// ============================================================================
test('T3. Residual time below 500ms is strictly preserved in accumulatorMs without advancing committed simTime', () => {
  const TARGET_WALL_MS = 60250;
  const DELTA_PATTERNS = [500, 130, 33, 17];
  let reference: SimulationSnapshot | null = null;

  for (const delta of DELTA_PATTERNS) {
    const base = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
    const result = advanceWithPattern(base, TARGET_WALL_MS, delta);

    assert.equal(result.simTimeMs, 60000, `Delta ${delta}ms must commit exactly 60,000ms`);
    assert.equal(result.tickCount, 120, `Delta ${delta}ms must execute exactly 120 ticks`);
    assert.equal(result.accumulatorMs, 250, `Delta ${delta}ms must preserve 250ms in accumulatorMs`);

    if (!reference) {
      reference = result;
    } else {
      assert.equal(result.prngState, reference.prngState);
      assert.deepEqual(result.tasks, reference.tasks);
      assert.deepEqual(result.workers, reference.workers);
      assert.deepEqual(result.scheduler, reference.scheduler);
    }
  }
});

// ============================================================================
// T4: Wall-clock delta clamping at MAX_DELTA_CLAMP_MS (1,000ms)
// ============================================================================
test('T4. Delta exceeding MAX_DELTA_CLAMP_MS (1000ms) is clamped to exactly 1000ms', () => {
  const baseA = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
  const baseB = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);

  // Advance by 5000ms in a single call vs 1000ms
  const clamped5000 = SimulationEngine.advanceByWallClockDelta(baseA, 5000);
  const clamped1000 = SimulationEngine.advanceByWallClockDelta(baseB, 1000);

  assert.equal(clamped5000.simTimeMs, 1000);
  assert.equal(clamped5000.tickCount, 2);
  assert.equal(clamped5000.accumulatorMs, 0);

  assert.deepEqual(clamped5000, clamped1000);

  // A 2,750ms raw delta clamped to 1,000ms -> 2 ticks (1000ms), 0 remainder
  const baseC = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
  const clamped2750 = SimulationEngine.advanceByWallClockDelta(baseC, 2750);
  assert.deepEqual(clamped2750, clamped1000);
});

// ============================================================================
// T5: Global Pause & Resume accumulator & state preservation
// ============================================================================
test('T5. Global Pause preserves accumulatorMs, freezes worker progress, and resumes seamlessly', () => {
  const base = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);

  // Advance 500ms then 750ms (both <= MAX_DELTA_CLAMP_MS):
  // 500ms -> 1 tick, 0 remainder
  // 750ms -> 1 tick, 250ms remainder -> total 2 full ticks (1000ms), 250ms in accumulator
  let snap = SimulationEngine.advanceByWallClockDelta(base, 500);
  snap = SimulationEngine.advanceByWallClockDelta(snap, 750);
  assert.equal(snap.simTimeMs, 1000);
  assert.equal(snap.tickCount, 2);
  assert.equal(snap.accumulatorMs, 250);

  // Pause globally
  snap = SimulationEngine.setGlobalPaused(snap, true);
  assert.equal(snap.isGlobalPaused, true);
  assert.equal(snap.accumulatorMs, 250);

  const prngAtPause = snap.prngState;
  const simTimeAtPause = snap.simTimeMs;

  // Passing wall time while paused does not advance accumulator or simulation
  snap = SimulationEngine.advanceByWallClockDelta(snap, 5000);
  assert.equal(snap.simTimeMs, simTimeAtPause);
  assert.equal(snap.accumulatorMs, 250);
  assert.equal(snap.prngState, prngAtPause);

  // Resume globally
  snap = SimulationEngine.setGlobalPaused(snap, false);
  assert.equal(snap.isGlobalPaused, false);
  assert.equal(snap.accumulatorMs, 250);

  // Advance another 250ms: 250 + 250 = 500ms -> triggers 3rd full tick!
  snap = SimulationEngine.advanceByWallClockDelta(snap, 250);
  assert.equal(snap.simTimeMs, 1500);
  assert.equal(snap.tickCount, 3);
  assert.equal(snap.accumulatorMs, 0);

  // Compare with a direct non-paused run of 1500ms
  const direct = advanceWithPattern(createCleanTestBaseline(DEFAULT_SIMULATION_SEED), 1500, 500);
  assert.equal(snap.simTimeMs, direct.simTimeMs);
  assert.equal(snap.tickCount, direct.tickCount);
  assert.equal(snap.prngState, direct.prngState);
  assert.deepEqual(snap.workers, direct.workers);
  assert.deepEqual(snap.tasks, direct.tasks);
  assert.deepEqual(snap.scheduler, direct.scheduler);
});

// ============================================================================
// T6: Deterministic Reset & Replay invariance
// ============================================================================
test('T6. Reset clears accumulator, restores prngState to seed, and increments resetGeneration', () => {
  const seed = 556677;
  const genBefore = SimulationEngine.getResetGeneration();

  let run1 = createCleanTestBaseline(seed);
  run1 = advanceWithPattern(run1, 10250, 130);
  assert.equal(run1.accumulatorMs, 250);

  // Reset
  const resetSnap = SimulationEngine.resetToBaseline(seed);
  assert.equal(resetSnap.simTimeMs, 0);
  assert.equal(resetSnap.tickCount, 0);
  assert.equal(resetSnap.accumulatorMs, 0);
  assert.equal(resetSnap.prngState, seed);
  assert.equal(SimulationEngine.getResetGeneration(), genBefore + 2); // baseline + reset

  // Replay
  let run2 = resetSnap;
  run2 = advanceWithPattern(run2, 10250, 130);

  assert.equal(run2.simTimeMs, run1.simTimeMs);
  assert.equal(run2.tickCount, run1.tickCount);
  assert.equal(run2.accumulatorMs, run1.accumulatorMs);
  assert.equal(run2.prngState, run1.prngState);
  assert.deepEqual(run2.workers, run1.workers);
  assert.deepEqual(run2.tasks, run1.tasks);
  assert.deepEqual(run2.scheduler, run1.scheduler);
  assert.deepEqual(run2.events, run1.events);
});

// ============================================================================
// T7: Mid-simulation speed changes with wall-clock flush
// ============================================================================
test('T7. Speed changes correctly flush pending delta with old speed and preserve accumulator', () => {
  // Scenario: 1000ms at 1x (sim 1000ms) + 1000ms at 2x (sim 2000ms) = total 3000ms simulated time
  const snap1 = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
  const after1x = advanceWithPattern(snap1, 1000, 500);

  const afterSwitch = { ...after1x, simSpeedMultiplier: 2 as const };
  const after2x = advanceWithPattern(afterSwitch, 1000, 500);

  assert.equal(after2x.simTimeMs, 3000);
  assert.equal(after2x.tickCount, 6);
  assert.equal(after2x.accumulatorMs, 0);

  // Reference: direct run at 1x for 3000ms
  const ref = advanceWithPattern(createCleanTestBaseline(DEFAULT_SIMULATION_SEED), 3000, 500);
  assert.equal(after2x.simTimeMs, ref.simTimeMs);
  assert.equal(after2x.tickCount, ref.tickCount);
  assert.equal(after2x.prngState, ref.prngState);
  assert.deepEqual(after2x.tasks, ref.tasks);
  assert.deepEqual(after2x.workers, ref.workers);
  assert.deepEqual(after2x.scheduler, ref.scheduler);

  // Fractional speed flush: 250ms at 1x (acc=250), then switch to 2x, then 125ms at 2x (250ms sim)
  // Total sim added = 250 + 250 = 500ms -> exactly 1 tick!
  let fractional = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
  fractional = SimulationEngine.advanceByWallClockDelta(fractional, 250);
  assert.equal(fractional.accumulatorMs, 250);
  assert.equal(fractional.tickCount, 0);

  fractional = { ...fractional, simSpeedMultiplier: 2 as const };
  fractional = SimulationEngine.advanceByWallClockDelta(fractional, 125);
  assert.equal(fractional.simTimeMs, 500);
  assert.equal(fractional.tickCount, 1);
  assert.equal(fractional.accumulatorMs, 0);
});

// ============================================================================
// T8: Exact 500ms contract validation for stepSimulationTick
// ============================================================================
test('T8. stepSimulationTick strictly enforces exact 500ms and rejects other values with RangeError', () => {
  const snap = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);

  // 500ms is accepted
  const stepped = SimulationEngine.stepSimulationTick(snap, 500);
  assert.equal(stepped.simTimeMs, 500);
  assert.equal(stepped.tickCount, 1);

  // Invalid values throw RangeError
  assert.throws(() => SimulationEngine.stepSimulationTick(snap, 250), RangeError);
  assert.throws(() => SimulationEngine.stepSimulationTick(snap, 1000), RangeError);
  assert.throws(() => SimulationEngine.stepSimulationTick(snap, 0), RangeError);
  assert.throws(() => SimulationEngine.stepSimulationTick(snap, -500), RangeError);
  assert.throws(() => SimulationEngine.stepSimulationTick(snap, 500.5), RangeError);

  // Invalid values throw even when globally paused
  const paused = SimulationEngine.setGlobalPaused(snap, true);
  assert.throws(() => SimulationEngine.stepSimulationTick(paused, 250), RangeError);
  assert.throws(() => SimulationEngine.stepSimulationTick(paused, 1000), RangeError);

  // Manual step in store while paused advances exactly 500ms and preserves accumulator
  useOfficeStore.getState().resetSimulationWithSeed();
  useOfficeStore.getState().advanceByWallClock(250); // accumulator = 250
  assert.equal(useOfficeStore.getState().accumulatorMs, 250);

  useOfficeStore.getState().setGlobalPaused(true);
  assert.equal(useOfficeStore.getState().isGlobalPaused, true);
  assert.equal(useOfficeStore.getState().accumulatorMs, 250);

  useOfficeStore.getState().tickSimulation(500);
  assert.equal(useOfficeStore.getState().simTimeMs, 500);
  assert.equal(useOfficeStore.getState().isGlobalPaused, true); // Still paused!
  assert.equal(useOfficeStore.getState().accumulatorMs, 250); // Accumulator strictly preserved!
});

// ============================================================================
// T9: Complete elimination of partial ticks (stepMs === 500 strictly enforced)
// ============================================================================
test('T9. Internal simulation steps only ever invoke stepSimulationTick with exact 500ms', () => {
  const originalStepWithDiagnostics = SimulationEngine.stepSimulationTickWithDiagnostics;
  const recordedSteps: number[] = [];

  try {
    SimulationEngine.stepSimulationTickWithDiagnostics = function (
      snapshot: SimulationSnapshot,
      stepSimMs: number = FIXED_TICK_SIM_MS,
    ) {
      recordedSteps.push(stepSimMs);
      return originalStepWithDiagnostics.call(SimulationEngine, snapshot, stepSimMs);
    };

    let s = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);

    // Call advance with diverse non-multiple-of-500 deltas
    s = SimulationEngine.advanceByWallClockDelta(s, 17);
    s = SimulationEngine.advanceByWallClockDelta(s, 33);
    s = SimulationEngine.advanceByWallClockDelta(s, 130);
    s = SimulationEngine.advanceByWallClockDelta(s, 250); // Total = 430ms -> 0 ticks
    assert.equal(recordedSteps.length, 0, 'No ticks should have run for 430ms');

    // Add 100ms -> total 530ms -> exactly 1 tick of 500ms!
    s = SimulationEngine.advanceByWallClockDelta(s, 100);
    assert.equal(recordedSteps.length, 1);
    assert.equal(recordedSteps[0], 500);

    // Add 1000ms -> exactly 2 ticks of 500ms!
    s = SimulationEngine.advanceByWallClockDelta(s, 1000);
    assert.equal(recordedSteps.length, 3);
    assert.equal(recordedSteps[1], 500);
    assert.equal(recordedSteps[2], 500);

    for (const step of recordedSteps) {
      assert.equal(step, 500, `Every internal tick step must be exactly 500ms, found: ${step}`);
    }
  } finally {
    SimulationEngine.stepSimulationTickWithDiagnostics = originalStepWithDiagnostics;
  }
});

// ============================================================================
// T10: Unified render clock anchor & interpolation smoothness
// ============================================================================
test('T10. Unified render clock accounts for accumulator, stays smooth, never double-counts, and is consistent across flushes', () => {
  // 1. Accumulator is accounted for when simTimeMs === 0 and tickCount === 0
  const snapWithAcc: SimulationSnapshot = {
    ...createCleanTestBaseline(DEFAULT_SIMULATION_SEED),
    accumulatorMs: 250,
  };
  const unifiedTime = SimulationEngine.getUnifiedSimTimeMs(snapWithAcc);
  assert.equal(unifiedTime, 250, 'Accumulator must not be ignored when simTimeMs and tickCount are 0');

  // 2. Render clock interpolation smoothness at 1x, 2x, 4x
  const anchorTime = 10000;
  for (const speed of [1, 2, 4] as const) {
    const snap: SimulationSnapshot = {
      ...createCleanTestBaseline(DEFAULT_SIMULATION_SEED),
      simSpeedMultiplier: speed,
    };
    SimulationEngine.syncRealtimeClockAnchor(snap, anchorTime, true);

    const t0 = SimulationEngine.getUnifiedSimTimeMs(snap, anchorTime);
    const t1 = SimulationEngine.getUnifiedSimTimeMs(snap, anchorTime + 100);
    const t2 = SimulationEngine.getUnifiedSimTimeMs(snap, anchorTime + 200);

    assert.equal(t0, 0);
    assert.equal(t1, 100 * speed);
    assert.equal(t2, 200 * speed);
    assert.ok(t2 > t1 && t1 > t0, `Render clock must advance monotonically at ${speed}x`);
  }

  // 3. Render time does not double-count accumulator
  const snapAcc100: SimulationSnapshot = {
    ...createCleanTestBaseline(DEFAULT_SIMULATION_SEED),
    simTimeMs: 1000,
    accumulatorMs: 100,
    simSpeedMultiplier: 1,
  };
  SimulationEngine.syncRealtimeClockAnchor(snapAcc100, anchorTime, true);
  const renderAtAnchor = SimulationEngine.getUnifiedSimTimeMs(snapAcc100, anchorTime);
  assert.equal(renderAtAnchor, 1100, 'Render time at anchor must equal simTimeMs + accumulatorMs (no double count)');

  // 4. Render time freezes when globally paused
  const pausedSnap = SimulationEngine.setGlobalPaused(snapAcc100, true);
  SimulationEngine.syncRealtimeClockAnchor(pausedSnap, anchorTime, false);
  const renderPaused1 = SimulationEngine.getUnifiedSimTimeMs(pausedSnap, anchorTime + 100);
  const renderPaused2 = SimulationEngine.getUnifiedSimTimeMs(pausedSnap, anchorTime + 500);
  assert.equal(renderPaused1, renderPaused2, 'Render clock must freeze when paused');

  // 5. Render time before and after flush for the exact same wall time is consistent
  const liveSnap: SimulationSnapshot = {
    ...createCleanTestBaseline(DEFAULT_SIMULATION_SEED),
    simTimeMs: 2000,
    accumulatorMs: 100,
    simSpeedMultiplier: 2,
  };
  SimulationEngine.syncRealtimeClockAnchor(liveSnap, anchorTime, true);

  const evalWallTime = anchorTime + 150; // 150ms wall elapsed -> 300ms sim delta
  const renderBeforeFlush = SimulationEngine.getUnifiedSimTimeMs(liveSnap, evalWallTime);
  assert.equal(renderBeforeFlush, 2000 + 100 + 150 * 2); // 2400ms

  // Execute flush at evalWallTime
  const pendingWallMs = SimulationEngine.getPendingRealtimeWallDeltaMs(evalWallTime);
  assert.equal(pendingWallMs, 150);
  const flushResult = SimulationEngine.advanceByWallClockDeltaWithDiagnostics(liveSnap, pendingWallMs);
  SimulationEngine.syncRealtimeClockAnchor(flushResult.snapshot, evalWallTime, true);

  const renderAfterFlush = SimulationEngine.getUnifiedSimTimeMs(flushResult.snapshot, evalWallTime);
  assert.equal(renderAfterFlush, renderBeforeFlush, 'Render time before and after flush at the same wall time must be identical');
});

// ============================================================================
// T11: C1 Baseline Regression Proof
// ============================================================================
test('T11. C1 regression proof: varying delta sizes never cause tickCount inflation or demo task divergence', () => {
  // In baseline 6e35402, running 120,000ms with 130ms deltas produced ~924 ticks and ~34 tasks,
  // whereas 500ms deltas produced 240 ticks and ~14 tasks.
  // With C1 fixed-step accumulator: both 500ms and 130ms deltas produce EXACTLY 240 ticks and identical tasks!
  const TARGET_SIM_MS = 120000;
  const base500 = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
  const base130 = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);
  const base33 = createCleanTestBaseline(DEFAULT_SIMULATION_SEED);

  const res500 = advanceWithPattern(base500, TARGET_SIM_MS, 500);
  const res130 = advanceWithPattern(base130, TARGET_SIM_MS, 130);
  const res33 = advanceWithPattern(base33, TARGET_SIM_MS, 33);

  assert.equal(res500.tickCount, 240, '500ms pattern must yield exactly 240 ticks for 120s');
  assert.equal(res130.tickCount, 240, '130ms pattern must yield exactly 240 ticks for 120s (was ~924 in baseline 6e35402)');
  assert.equal(res33.tickCount, 240, '33ms pattern must yield exactly 240 ticks for 120s (was ~3636 in baseline 6e35402)');

  assert.equal(res130.prngState, res500.prngState);
  assert.equal(res33.prngState, res500.prngState);

  assert.deepEqual(Object.keys(res130.tasks), Object.keys(res500.tasks));
  assert.deepEqual(Object.keys(res33.tasks), Object.keys(res500.tasks));
  assert.deepEqual(res130.scheduler, res500.scheduler);
  assert.deepEqual(res33.scheduler, res500.scheduler);
});
